/**
 * 큐 케이스 저장소(2026-10-16, 기획 docs/01-plan/features/billiards-cue-case.md). 목록 shared/cueCase · 판정 shared/cueCaseRules.
 *
 * 열 때마다 기록을 읽어 다시 판정하고, 새로 채운 것만 받은 기록(hiq_cue_case_awards)에 더한다 — 고치지도 지우지도 않는다.
 * 불변: 실전 경기 · 회원 · 온라인 대전 · 레이팅 표는 **읽기만** 한다. 쓰는 표는 hiq_cue_case_awards · hiq_cue_case_prefs 둘뿐이다.
 *  - 실전 = 공식 경기(hiq_game_history.is_ranked · 경기 모드 match · 당구 · 끝난 경기). 상대 = 같은 경기의 다른 회원 칸(이름만 적은 게스트는 없다).
 *  - 온라인 = 레이팅에 반영된 대전(storage.simMatch.ratedDeltas — 이달의 랭킹 · 장식장과 같은 목록, 10/12 전 판도 다시 계산해 들어 있다).
 * 표가 아직 없으면(배포 전에 migrations/cue_case.sql 을 안 돌렸으면) 받은 기록 없이 판정만 보여 준다.
 */
import { db } from "../db.js";
import { and, eq, sql } from "drizzle-orm";
import { hiqCueCaseAwards, hiqCueCasePrefs, hiqMembers } from "../../shared/schema.js";
import { isWithdrawnMember } from "../../shared/chatSupport.js";
import { CASE_ITEMS, caseItem, isLive } from "../../shared/cueCase.js";
import { deficitFromInnings, deficitFromShots, evaluateCase, kstMonthKey, type Bar, type OnlineGame, type RealGame } from "../../shared/cueCaseRules.js";
import { bestRealTier } from "../../shared/realTier.js";
import { START_RATING } from "../../shared/sim/rank.js";
import type { MatchDelta } from "../../shared/simMonthly.js";

const missingTable = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";
const n = (v: unknown, d = 0) => { const x = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN; return Number.isFinite(x) ? x : d; };
const ms = (v: unknown) => (v instanceof Date ? v.getTime() : n(v));
const arr = (v: unknown): number[] => (Array.isArray(v) ? v.map((x) => n(x)) : []);
const inList = (ids: readonly string[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `);
const HOLDERS_MS = 5 * 60_000;
let holders: { at: number; by: Map<string, number> } | null = null;

export interface CueCaseItemView { done: boolean; at: number | null; got: number | null; bars: Bar[]; soon?: boolean; holders: number }
export interface CueCaseView {
    member: { id: string; name: string; country: string | null; mine: boolean };
    hero: string | null;
    items: Record<string, CueCaseItemView>;
    /** 이달 장갑 칸(실전 1판 = 3칸 · 온라인 1판 = 1칸) */
    month: { key: string; cells: number; need: number };
    /** 같이 친 서로 다른 사람 */
    people: number;
    /** 온라인 대전 기록이 있는가(메달 · 배지 칸을 열지) */
    online: boolean;
    /** 실전 다마(메달 칸의 둥근 다마 메달) */
    handi: { "3c": number | null; "4c": number | null };
}

export class CueCaseRepository {
    constructor(private readonly deltas: () => Promise<MatchDelta[]>) {}

    /** 레이팅 반영 대전 — 판마다 내 레이팅 · 판 수를 다시 쌓고, 하이런 · 이닝 · 목표 · 샷을 붙인다 */
    private async online(memberId: string): Promise<OnlineGame[]> {
        const all = await this.deltas();
        const rating = new Map<string, number>(), played = new Map<string, number>();
        const mine: { d: MatchDelta; idx: 0 | 1; after: number; count: number }[] = [];
        for (const d of all) {
            const idx = d.hostId === memberId ? 0 : d.guestId === memberId ? 1 : -1;
            if (idx < 0) continue;
            const after = (rating.get(d.gameType) ?? START_RATING) + (idx === 0 ? d.delta : -d.delta);
            const count = (played.get(d.gameType) ?? 0) + 1;
            rating.set(d.gameType, after); played.set(d.gameType, count);
            mine.push({ d, idx: idx as 0 | 1, after, count });
        }
        if (mine.length === 0) return [];
        const ids = mine.map((m) => m.d.id);
        const rows = (await db.execute(sql`
            select m.id, m.end_reason, m.host_target, m.guest_target,
                   m.state->'players'->0->>'highRun' as hr0, m.state->'players'->1->>'highRun' as hr1,
                   m.state->'players'->0->>'innings' as in0, m.state->'players'->1->>'innings' as in1,
                   exists (select 1 from hiq_sim_matches p where p.rematch_id = m.id) as rematch,
                   h.country as host_country, g.country as guest_country
            from hiq_sim_matches m
            left join hiq_members h on h.id = m.host_id
            left join hiq_members g on g.id = m.guest_id
            where m.id in (${inList(ids)})`)).rows as Record<string, unknown>[];
        const shots = (await db.execute(sql`
            select match_id, player_index, points, outcome_code, cushions, extract(epoch from created_at) * 1000 as at
            from hiq_sim_match_shots where match_id in (${inList(ids)}) order by match_id, idx`)).rows as Record<string, unknown>[];
        const byId = new Map(rows.map((r) => [String(r.id), r]));
        const shotsBy = new Map<string, Record<string, unknown>[]>();
        for (const s of shots) { const k = String(s.match_id); const l = shotsBy.get(k); if (l) l.push(s); else shotsBy.set(k, [s]); }
        const out: OnlineGame[] = [];
        for (const { d, idx, after, count } of mine) {
            const r = byId.get(d.id);
            if (!r) continue;
            const hostT = n(r.host_target), guestT = n(r.guest_target, hostT);
            const myT = idx === 0 ? hostT : guestT, oppT = idx === 0 ? guestT : hostT;
            const list = shotsBy.get(d.id) ?? [];
            const scored = list.filter((s) => n(s.player_index) === idx && n(s.points) > 0);
            const reason = String(r.end_reason ?? "");
            const five = scored.find((s) => n(s.cushions) >= 5);
            out.push({
                id: d.id, at: d.endedMs, opp: idx === 0 ? d.guestId : d.hostId,
                oppCountry: ((idx === 0 ? r.guest_country : r.host_country) as string | null) ?? null,
                gameType: d.gameType,
                // 무승부는 양쪽 다 승(2026-09-16 오너 — 레이팅 표의 wins 와 같다)
                won: d.winner === null || d.winner === idx, lost: d.winner !== null && d.winner !== idx,
                natural: reason === "target" || reason === "inningCap",
                highRun: n(idx === 0 ? r.hr0 : r.hr1), innings: n(idx === 0 ? r.in0 : r.in1), target: myT,
                ratingAfter: after, matchesAfter: count, rematch: r.rematch === true,
                maxDeficit: d.winner === idx ? deficitFromShots(list.map((s) => ({ me: n(s.player_index) === idx, points: n(s.points) })), myT, oppT) : 0,
                banks: scored.filter((s) => s.outcome_code === "point-bank").map((s) => n(s.at)),
                fiveCushionAt: five ? n(five.at) : null,
            });
        }
        return out;
    }

    /** 공식 실전 경기 — 내 칸을 찾아 상대 · 목표 · 이닝별 점수를 붙인다 */
    private async real(memberId: string): Promise<RealGame[]> {
        const rows = (await db.execute(sql`
            select h.game_id, h.game_type, h.is_winner, h.high_run,
                   extract(epoch from h.created_at) * 1000 as at, extract(epoch from g.played_at) * 1000 as started,
                   g.player1_id, g.player2_id, g.player3_id, g.player4_id, g.player3_name, g.player4_name,
                   g.player1_target, g.player2_target, g.player3_target, g.player4_target,
                   g.player1_score, g.player2_score, g.player3_score, g.player4_score,
                   g.player1_innings, g.player2_innings, g.player3_innings, g.player4_innings
            from hiq_game_history h join hiq_games g on g.id = h.game_id
            where h.member_id = ${memberId} and h.game_mode = 'match' and h.is_ranked and h.sport_category = 'BILLIARDS'
              and h.game_type in ('3c', '4c') and g.status = 'finished'`)).rows as Record<string, unknown>[];
        const out: RealGame[] = [];
        const seen = new Set<string>();
        for (const r of rows) {
            const id = String(r.game_id);
            if (seen.has(id)) continue;
            seen.add(id);
            const slots = [1, 2, 3, 4].map((i) => ({
                id: (r[`player${i}_id`] as string | null) ?? null, target: n(r[`player${i}_target`]), score: n(r[`player${i}_score`]), innings: arr(r[`player${i}_innings`]),
            }));
            const me = slots.findIndex((s) => s.id === memberId);
            if (me < 0) continue;
            // 두 사람 경기 — 3 · 4번 칸에 회원도 이름도 없다(완봉 · 역전은 두 사람 경기에서만 본다)
            const two = !slots[2].id && !slots[3].id && !r.player3_name && !r.player4_name;
            const opp = two ? slots[me === 0 ? 1 : 0] : null;
            const mine = slots[me];
            out.push({
                id, at: n(r.at), startedAt: n(r.started), gameType: r.game_type === "4c" ? "4c" : "3c", won: r.is_winner === true,
                opps: slots.filter((s, i) => i !== me && s.id).map((s) => s.id as string),
                highRun: n(r.high_run), target: mine.target, innings: mine.innings,
                oppScore: opp ? opp.score : null,
                maxDeficit: opp && r.is_winner === true && me <= 1 ? deficitFromInnings(mine.innings, opp.innings, mine.target, opp.target, me === 0) : 0,
            });
        }
        return out;
    }

    private async holderCounts(fresh = false): Promise<Map<string, number>> {
        const now = Date.now();
        if (!fresh && holders && now - holders.at < HOLDERS_MS) return holders.by;
        try {
            const rows = (await db.execute(sql`select item_id, count(*)::int as n from hiq_cue_case_awards group by item_id`)).rows as { item_id: string; n: number }[];
            holders = { at: now, by: new Map(rows.map((r) => [String(r.item_id), n(r.n)])) };
        } catch (e) {
            if (!missingTable(e)) throw e;
            holders = { at: now, by: new Map() };
        }
        return holders.by;
    }

    /**
     * 한 사람의 큐 케이스. 남의 것도 볼 수 있다(랭킹 · 프로필이 이미 보여 주는 이름 · 전적에서 나온 것이다).
     * 탈퇴한 회원 · 공식 경기도 레이팅 대전도 받은 것도 없는 남의 회원은 null — 아무 회원 id 로 이름을 알아낼 수 없게.
     */
    async view(viewerId: string, memberId: string, nowMs: number): Promise<CueCaseView | null> {
        const [who] = await db.select({ id: hiqMembers.id, name: hiqMembers.name, country: hiqMembers.country, phone: hiqMembers.phone, createdAt: hiqMembers.createdAt, handi3c: hiqMembers.handi3c, handi4c: hiqMembers.handi4c })
            .from(hiqMembers).where(eq(hiqMembers.id, memberId)).limit(1);
        if (!who || isWithdrawnMember(who)) return null;
        const mine = viewerId === memberId;
        const country = (who.country as string | null) ?? null;
        const [online, real] = await Promise.all([this.online(memberId), this.real(memberId)]);
        const awards = (await db.execute(sql`
            select kind, rank, extract(epoch from created_at) * 1000 as at from hiq_sim_awards
            where member_id = ${memberId} and (kind = 'cup' or (kind = 'month_rank' and rank = 1))`)).rows as Record<string, unknown>[];
        const entries = (await db.execute(sql`
            select extract(epoch from c.starts_at) * 1000 as at from hiq_sim_cup_entries e join hiq_sim_cups c on c.id = e.cup_id where e.member_id = ${memberId}`)).rows as Record<string, unknown>[];

        let ledger: { item_id: string; earned: number; created: number }[] = [];
        let hasLedger = true;
        try {
            ledger = ((await db.execute(sql`
                select item_id, extract(epoch from earned_at) * 1000 as earned, extract(epoch from created_at) * 1000 as created
                from hiq_cue_case_awards where member_id = ${memberId}`)).rows as Record<string, unknown>[])
                .map((r) => ({ item_id: String(r.item_id), earned: n(r.earned), created: n(r.created) }));
        } catch (e) {
            if (!missingTable(e)) throw e;
            hasLedger = false;
        }
        if (!mine && online.length === 0 && real.length === 0 && ledger.length === 0) return null;

        const states = evaluateCase({
            nowMs, joinedAt: ms(who.createdAt), country,
            cups: awards.filter((a) => a.kind === "cup").map((a) => ({ rank: n(a.rank), at: n(a.at) })),
            monthTops: awards.filter((a) => a.kind === "month_rank").map((a) => n(a.at)),
            cupEntries: entries.map((e) => n(e.at)),
            realTier: bestRealTier({ handi3c: who.handi3c as number | null, handi4c: who.handi4c as number | null })?.tier.id ?? null,
            online, real,
        });

        // 새로 채운 것만 더한다 — 이미 있는 줄은 그대로(받은 때도 바꾸지 않는다)
        const have = new Map(ledger.map((l) => [l.item_id, l]));
        const fresh = CASE_ITEMS.filter((x) => isLive(x) && states[x.id]?.done && !have.has(x.id));
        if (hasLedger && fresh.length > 0) {
            const wrote = await db.insert(hiqCueCaseAwards)
                .values(fresh.map((x) => ({ memberId, itemId: x.id, earnedAt: new Date(states[x.id].at ?? nowMs) })))
                .onConflictDoNothing()
                .returning({ itemId: hiqCueCaseAwards.itemId, earnedAt: hiqCueCaseAwards.earnedAt, createdAt: hiqCueCaseAwards.createdAt });
            for (const w of wrote as { itemId: string; earnedAt: Date; createdAt: Date }[]) have.set(w.itemId, { item_id: w.itemId, earned: ms(w.earnedAt), created: ms(w.createdAt) });
        }
        const counts = await this.holderCounts(fresh.length > 0);

        const items: Record<string, CueCaseItemView> = {};
        for (const x of CASE_ITEMS) {
            const s = states[x.id] ?? { done: false, at: null, bars: [] };
            const l = have.get(x.id);
            items[x.id] = l
                ? { done: true, at: l.earned, got: l.created, bars: s.bars, holders: counts.get(x.id) ?? 1 }
                : { done: !hasLedger && s.done, at: !hasLedger ? s.at : null, got: null, bars: s.bars, ...(s.soon ? { soon: true } : {}), holders: counts.get(x.id) ?? 0 };
        }

        // 대표 큐 — 고른 것(받은 큐만), 없으면 가진 사람이 가장 적은 큐(같으면 최근)
        let hero: string | null = null;
        try {
            const [p] = await db.select({ heroItem: hiqCueCasePrefs.heroItem }).from(hiqCueCasePrefs).where(eq(hiqCueCasePrefs.memberId, memberId)).limit(1);
            if (p?.heroItem && items[p.heroItem]?.done && caseItem(p.heroItem)?.kind === "cue") hero = p.heroItem;
        } catch (e) { if (!missingTable(e)) throw e; }
        if (!hero) {
            const owned = CASE_ITEMS.filter((x) => x.kind === "cue" && items[x.id].done)
                .sort((a, b) => (items[a.id].holders - items[b.id].holders) || ((items[b.id].at ?? 0) - (items[a.id].at ?? 0)));
            hero = owned[0]?.id ?? null;
        }

        const monthKey = kstMonthKey(nowMs);
        const cells = real.filter((g) => kstMonthKey(g.at) === monthKey).length * 3 + online.filter((g) => kstMonthKey(g.at) === monthKey).length;
        const people = new Set([...real.flatMap((g) => g.opps), ...online.map((g) => g.opp)]).size;
        return {
            member: { id: String(who.id), name: String(who.name), country, mine },
            hero, items, month: { key: monthKey, cells, need: 12 }, people,
            online: online.length > 0 || awards.length > 0,
            handi: { "3c": (who.handi3c as number | null) ?? null, "4c": (who.handi4c as number | null) ?? null },
        };
    }

    /**
     * 홈 입구 띠의 한 줄 — 받은 기록만 센다(판정은 큐 케이스를 열 때). 아직 한 번도 안 열었으면 opened=false(띠가 '열어 보세요'를 쓴다).
     * 대표 큐는 고른 것, 없으면 가장 최근에 받은 큐.
     */
    async summary(memberId: string): Promise<{ opened: boolean; cue: number; chalk: number; glove: number; hero: string | null; latest: number | null }> {
        try {
            const rows = (await db.execute(sql`
                select item_id, extract(epoch from created_at) * 1000 as created from hiq_cue_case_awards where member_id = ${memberId} order by earned_at desc`)).rows as Record<string, unknown>[];
            const ids = rows.map((r) => String(r.item_id)).filter((id) => caseItem(id));
            const kind = (k: string) => ids.filter((id) => caseItem(id)!.kind === k).length;
            const [p] = await db.select({ heroItem: hiqCueCasePrefs.heroItem }).from(hiqCueCasePrefs).where(eq(hiqCueCasePrefs.memberId, memberId)).limit(1);
            const hero = p?.heroItem && ids.includes(p.heroItem) ? p.heroItem : ids.find((id) => caseItem(id)!.kind === "cue") ?? null;
            return { opened: rows.length > 0, cue: kind("cue"), chalk: kind("chalk"), glove: kind("glove"), hero, latest: rows.length ? Math.max(...rows.map((r) => n(r.created))) : null };
        } catch (e) {
            if (!missingTable(e)) throw e;
            return { opened: false, cue: 0, chalk: 0, glove: 0, hero: null, latest: null };
        }
    }

    /** 대표 큐 고르기 — 받은 큐만. 고르면 true */
    async setHero(memberId: string, itemId: string): Promise<boolean> {
        const x = caseItem(itemId);
        if (!x || x.kind !== "cue") return false;
        const [own] = await db.select({ id: hiqCueCaseAwards.id }).from(hiqCueCaseAwards)
            .where(and(eq(hiqCueCaseAwards.memberId, memberId), eq(hiqCueCaseAwards.itemId, itemId))).limit(1);
        if (!own) return false;
        await db.insert(hiqCueCasePrefs).values({ memberId, heroItem: itemId, updatedAt: new Date() })
            .onConflictDoUpdate({ target: hiqCueCasePrefs.memberId, set: { heroItem: itemId, updatedAt: new Date() } });
        return true;
    }
}
