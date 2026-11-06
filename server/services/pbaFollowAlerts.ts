/**
 * PBA 관심 선수 알림 보내기(2026-11-06) — 무엇을 · 언제는 shared/pbaFollowAlert, 여기는 찍어 두고 · 견주고 · 보낸다.
 *
 *  · 순위: 크론 pba-sync(매일 06:30 KST — UMB 순위 알림이 06:00 에 가는 것과 같은 때)가 시즌 순위를 덮어쓰기 **전에** 팔로우된 선수의 순위를 찍어 두고,
 *    덮어쓴 뒤 다시 읽어 바뀐 선수의 팔로워에게 한 건씩. 찍기 전에 팔로우된 선수만 본다(그사이 새로 팔로우한 선수에게 '진입'이 잘못 가지 않게).
 *  · 우승: 크론 pba-tournaments 가 대회 표를 쓰기 전에 그 시즌들의 우승자를 찍어 두고, 쓴 뒤 우승자가 새로 생긴 대회를 본다.
 *  · 보내기: notificationService(설정 '관심 선수'를 끈 사람은 알림함에만), 누르면 /pba-player/<선수>.
 * 실패는 삼킨다 — 알림이 동기화를 실패로 만들면 안 된다(부르는 곳이 catch).
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { notificationService } from "./notificationService.js";
import { msg } from "../lib/i18n.js";
import { PBA_RANK_KEYS, PBA_WIN_KEYS, newPbaWins, pbaPlayerUrl, pbaRankChange, pbaSeasonText } from "../../shared/pbaFollowAlert.js";

const rowsOf = (r: unknown) => ((r as { rows?: any[] })?.rows ?? (r as any[])) as any[];

export type PbaRankSnapshot = Map<string, { league: string | null; rank: number | null }>;

/** 팔로우된 PBA 선수의 이 시즌 상금 순위 — 순위에 없으면 null */
export async function followedPbaRanks(season: number): Promise<PbaRankSnapshot> {
    const rows = rowsOf(await db.execute(sql`
        select f.mem_code, r.league, r.prize_rank
        from (select distinct player_umb_id as mem_code from hiq_player_follows where category = 'pba') f
        left join pba_season_ranks r on r.mem_code = f.mem_code and r.season = ${season}`));
    return new Map(rows.map((r) => [String(r.mem_code), { league: r.league ?? null, rank: r.prize_rank == null ? null : Number(r.prize_rank) }]));
}

/** 그 선수를 팔로우한 회원 · 선수 이름 */
async function followersOf(memCodes: readonly string[]): Promise<{ memberId: string; memCode: string; name: string; league: string | null }[]> {
    if (memCodes.length === 0) return [];
    const rows = rowsOf(await db.execute(sql`
        select f.member_id, f.player_umb_id as mem_code, p.name_ko, p.league
        from hiq_player_follows f join pba_players p on p.mem_code = f.player_umb_id
        where f.category = 'pba' and f.player_umb_id in (${sql.join(memCodes.map((m) => sql`${m}`), sql`, `)})`));
    return rows.map((r) => ({ memberId: String(r.member_id), memCode: String(r.mem_code), name: String(r.name_ko ?? ""), league: r.league ?? null }));
}

/** 순위가 바뀐 선수의 팔로워에게 — before 는 동기화 전에 찍은 것 */
export async function notifyPbaRankChanges(before: PbaRankSnapshot, season: number): Promise<{ changed: number; sent: number }> {
    const after = await followedPbaRanks(season);
    const changes = new Map<string, { kind: keyof typeof PBA_RANK_KEYS; d: number; prev: number | null; rank: number; league: string | null }>();
    for (const [memCode, now] of after) {
        if (!before.has(memCode)) continue;
        const c = pbaRankChange(before.get(memCode)!.rank, now.rank);
        if (c && now.rank != null) changes.set(memCode, { ...c, prev: before.get(memCode)!.rank, rank: now.rank, league: now.league });
    }
    if (changes.size === 0) return { changed: 0, sent: 0 };
    let sent = 0;
    for (const f of await followersOf([...changes.keys()])) {
        const c = changes.get(f.memCode)!;
        const keys = PBA_RANK_KEYS[c.kind];
        const params = { name: f.name, rank: c.rank, prevRank: c.prev ?? 0, d: c.d, league: c.league ?? f.league ?? "PBA", season: pbaSeasonText(season) };
        await notificationService.sendAndSaveNotification({
            memberId: f.memberId, title: msg(keys.title, params), body: msg(keys.body, params),
            category: "BILLIARDS", type: "PLAYER_RANK", pref: "players",
            params: { url: pbaPlayerUrl(f.memCode), memCode: f.memCode, season, rank: c.rank },
        }).then(() => { sent++; }).catch((e) => console.error(`[PbaFollowAlerts] ${f.memberId} ← ${f.memCode} 발송 실패:`, (e as Error)?.message));
    }
    return { changed: changes.size, sent };
}

/** 그 시즌들 대회의 우승자(아직 없으면 null) — 대회 표를 쓰기 전에 찍어 둔다 */
export async function pbaWinnerSnapshot(seasons: readonly number[]): Promise<Map<string, string | null>> {
    if (seasons.length === 0) return new Map();
    const rows = rowsOf(await db.execute(sql`
        select id, winner_mem_code from pba_tournaments where season in (${sql.join(seasons.map((s) => sql`${s}`), sql`, `)})`));
    return new Map(rows.map((r) => [String(r.id), r.winner_mem_code == null ? null : String(r.winner_mem_code)]));
}

/** 우승자가 새로 생긴 대회 — 그 선수의 팔로워에게 */
export async function notifyPbaWins(before: Map<string, string | null>, seasons: readonly number[]): Promise<{ wins: number; sent: number }> {
    if (seasons.length === 0) return { wins: 0, sent: 0 };
    const after = rowsOf(await db.execute(sql`
        select id, title, winner_mem_code from pba_tournaments where season in (${sql.join(seasons.map((s) => sql`${s}`), sql`, `)})`));
    const followed = new Set(rowsOf(await db.execute(sql`select distinct player_umb_id as m from hiq_player_follows where category = 'pba'`)).map((r) => String(r.m)));
    const wins = newPbaWins(before, after.map((r) => ({ id: String(r.id), winnerMemCode: r.winner_mem_code == null ? null : String(r.winner_mem_code) })), followed);
    if (wins.length === 0) return { wins: 0, sent: 0 };
    const titleOf = new Map(after.map((r) => [String(r.id), String(r.title ?? "")]));
    let sent = 0;
    for (const w of wins) {
        for (const f of await followersOf([w.memCode])) {
            const params = { name: f.name, title: titleOf.get(w.id) ?? "" };
            await notificationService.sendAndSaveNotification({
                memberId: f.memberId, title: msg(PBA_WIN_KEYS.title, params), body: msg(PBA_WIN_KEYS.body, params),
                category: "BILLIARDS", type: "PLAYER_RANK", pref: "players",
                params: { url: pbaPlayerUrl(w.memCode), memCode: w.memCode, tournament: w.id },
            }).then(() => { sent++; }).catch((e) => console.error(`[PbaFollowAlerts] 우승 ${f.memberId} ← ${w.memCode} 발송 실패:`, (e as Error)?.message));
        }
    }
    return { wins: wins.length, sent };
}
