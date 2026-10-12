/**
 * 장식장 저장소(2026-10-12 오너: "장식장에 보관이 되도록 매월초가 되면 …"). 규칙은 shared/simShelf — 여기는 읽고, 달이 끝나면 한 번 적는다.
 * 불변: 실전 경기 · 회원 성적 · 온라인 대전 레이팅 표는 읽기만 한다. 쓰는 표는 hiq_sim_awards · hiq_sim_month_closes 둘뿐이다.
 */
import { db } from "../db.js";
import { hiqMembers, hiqSimAwards, hiqSimMatchRatings, hiqSimMonthCloses } from "../../shared/schema.js";
import { desc, eq, sql } from "drizzle-orm";
import { isWithdrawnMember } from "../../shared/chatSupport.js";
import { TIERS, tierFor, type TierId } from "../../shared/sim/rank.js";
import { MONTHLY_MIN_MATCHES, daysLeftInMonth, kstMonthOf, type MatchDelta } from "../../shared/simMonthly.js";
import { SHELF_FIRST_MONTH, monthAwards, monthsToClose, shelfCounts, shelfPreview, type MedalRank } from "../../shared/simShelf.js";

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const tierId = (v: unknown): TierId | null => (typeof v === "string" && TIERS.some((t) => t.id === v) ? (v as TierId) : null);
const medalRank = (v: unknown): MedalRank | null => (v === 1 || v === 2 || v === 3 ? v : null);

export class SimShelfRepository {
    /** deltas: 레이팅에 반영된 판과 그 변화(storage.simMatch.ratedDeltas) */
    constructor(private readonly deltas: (fresh?: boolean) => Promise<MatchDelta[]>) {}

    /**
     * 끝난 달을 마감한다 — 하루 한 번 도는 정리 작업(/api/cron/sim-cleanup)이 부른다. 밀린 달이 있으면 같이 마감한다.
     * 달마다 한 번만: 마감 줄(hiq_sim_month_closes)을 먼저 넣고, 들어갔을 때만 그 달의 것을 준다(같은 때 두 번 돌아도 한 번만 준다).
     */
    async closeMonths(nowMs: number): Promise<{ closed: { month: string; medals: number; tiers: number }[] }> {
        const deltas = await this.deltas(true);
        const done = (await db.select({ month: hiqSimMonthCloses.month }).from(hiqSimMonthCloses)).map((r: { month: string }) => r.month);
        const closed: { month: string; medals: number; tiers: number }[] = [];
        for (const month of monthsToClose(deltas, nowMs, done)) {
            const awards = monthAwards(deltas, month);
            const c = shelfCounts(awards);
            const summary = { medals: c.medalTotal, tiers: c.tierTotal };
            const wrote = await db.transaction(async (tx: any) => {
                const first = await tx.insert(hiqSimMonthCloses).values({ month, summary }).onConflictDoNothing().returning({ month: hiqSimMonthCloses.month });
                if (first.length === 0) return false;
                if (awards.length > 0) {
                    await tx.insert(hiqSimAwards).values(awards.map((a) => ({
                        memberId: a.memberId, month: a.month, kind: a.kind, gameType: a.gameType, rank: a.rank, tier: a.tier,
                        detail: { points: a.points, matches: a.matches, wins: a.wins, rating: a.rating },
                    }))).onConflictDoNothing();
                }
                return true;
            });
            if (wrote) closed.push({ month, ...summary });
        }
        return { closed };
    }

    /** 홈 배너의 한 줄 — 내가 모은 개수와 가장 최근에 받은 달 */
    async summary(memberId: string): Promise<{ medals: number; badges: number; latest: string | null }> {
        const rows = (await db.execute(sql`
            select kind, count(*)::int as n, max(month) as latest from hiq_sim_awards where member_id = ${memberId} group by kind`)).rows as Record<string, unknown>[];
        let medals = 0, badges = 0, latest: string | null = null;
        for (const r of rows) {
            if (r.kind === "month_rank") medals = Number(r.n ?? 0); else if (r.kind === "month_tier") badges = Number(r.n ?? 0);
            if (typeof r.latest === "string" && (latest === null || r.latest > latest)) latest = r.latest;
        }
        return { medals, badges, latest };
    }

    /**
     * 한 사람의 장식장. 남의 것도 볼 수 있다(순위표가 이미 회원에게 보여 주는 이름 · 등급 · 그 달의 성적이다).
     * 온라인 대전을 한 판도 안 둔 회원 · 탈퇴한 회원은 null — 아무 회원 id 로 이름을 알아낼 수 없게.
     */
    async shelf(viewerId: string, memberId: string, nowMs: number, placement = 3) {
        const [who] = await db.select({ id: hiqMembers.id, name: hiqMembers.name, country: hiqMembers.country, phone: hiqMembers.phone })
            .from(hiqMembers).where(eq(hiqMembers.id, memberId)).limit(1);
        if (!who || isWithdrawnMember(who)) return null;
        const mine = viewerId === memberId;
        const ratings = await db.select({ gameType: hiqSimMatchRatings.gameType, rating: hiqSimMatchRatings.rating, matches: hiqSimMatchRatings.matches, wins: hiqSimMatchRatings.wins })
            .from(hiqSimMatchRatings).where(eq(hiqSimMatchRatings.memberId, memberId));
        const rows = await db.select().from(hiqSimAwards).where(eq(hiqSimAwards.memberId, memberId)).orderBy(desc(hiqSimAwards.month));
        if (!mine && ratings.length === 0 && rows.length === 0) return null;

        // 지금 등급 — 배치를 마친 종목 가운데 높은 쪽(같으면 3쿠션)
        type R = { gameType: "3c" | "4c"; rating: number; matches: number; wins: number };
        const placed = (ratings as R[]).filter((r) => r.matches >= placement)
            .sort((a, b) => (b.rating - a.rating) || (a.gameType === "3c" ? -1 : 1));
        const best = placed[0] ?? null;

        const month = kstMonthOf(nowMs);
        const deltas = await this.deltas();
        const [lastClose] = await db.select({ month: hiqSimMonthCloses.month }).from(hiqSimMonthCloses).orderBy(desc(hiqSimMonthCloses.month)).limit(1);
        return {
            member: { id: String(who.id), name: String(who.name), country: who.country ?? null, mine },
            tier: best ? { gameType: best.gameType, tier: tierFor(best.rating).id, rating: best.rating } : null,
            awards: (rows as Record<string, any>[]).map((a) => {
                const d = (a.detail && typeof a.detail === "object" ? a.detail : {}) as Record<string, unknown>;
                return {
                    month: String(a.month), kind: a.kind === "month_rank" ? "month_rank" as const : "month_tier" as const,
                    gameType: a.gameType === "4c" ? "4c" as const : "3c" as const,
                    rank: medalRank(a.rank), tier: tierId(a.tier),
                    points: num(d.points), matches: num(d.matches), wins: num(d.wins), rating: num(d.rating, 1000),
                };
            }),
            /** 이번 달 — 지금 끝난다면 받는 것(아직 받은 것이 아니다) */
            current: { month, daysLeft: daysLeftInMonth(month, nowMs), minMatches: MONTHLY_MIN_MATCHES, boards: shelfPreview(deltas, month, memberId, nowMs) },
            /** 장식장이 쌓이기 시작한 달 · 마지막으로 마감한 달 */
            since: SHELF_FIRST_MONTH,
            closedThrough: lastClose?.month ?? null,
        };
    }
}
