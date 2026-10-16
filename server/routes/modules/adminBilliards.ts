/**
 * 어드민 · 당구(2026-10-16 어드민 전수 조사 → 오너가 정한 순서의 '당구'). 지금은 '실전 경기' — 회원을 한 명씩 열지 않고 전부를 본다.
 *
 * GET /admin/billiards/games?days=7&type=3c|4c&flagged=1&q=   끝난 당구 경기(매치 · 대회) — 선수 · 점수 · 하이런 · 이닝 · 이상 표시(shared/billiardsGameFlags)
 * 지우기는 예전 길(DELETE /admin/games/:id — RP · 에버리지를 되돌린다)을 그대로 쓴다. 까닭은 작업 기록에 남는다.
 */
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db.js";
import { checkSuperAdmin } from "../../middleware/adminAuth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/response.js";
import { gameFlags, pairDayKey, type AdminGameRow } from "../../../shared/billiardsGameFlags.js";

const router = Router();
router.use(checkSuperAdmin);
const rowsOf = (r: any) => (r.rows ?? r) as any[];

router.get("/games", asyncHandler(async (req: any, res: any) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 7));
    const type = req.query.type === "3c" || req.query.type === "4c" ? req.query.type : null;
    const term = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 30) : "";
    const like = `%${term.replace(/[%_\\]/g, "")}%`;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = rowsOf(await db.execute(sql`
        select g.*, s.name as store_name,
            to_char(g.played_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as played_iso, to_char(g.played_at + interval '9 hours', 'YYYY-MM-DD') as kst_day,
            m1.avg_3c as a1_3, m1.avg_4c as a1_4, m2.avg_3c as a2_3, m2.avg_4c as a2_4, m3.avg_3c as a3_3, m3.avg_4c as a3_4, m4.avg_3c as a4_3, m4.avg_4c as a4_4,
            exists (select 1 from hiq_crew_tournament_matches t where t.game_id = g.id) as bracket
        from hiq_games g
        left join hiq_stores s on s.id = g.store_id
        left join hiq_members m1 on m1.id = g.player1_id left join hiq_members m2 on m2.id = g.player2_id
        left join hiq_members m3 on m3.id = g.player3_id left join hiq_members m4 on m4.id = g.player4_id
        where g.sport_category = 'BILLIARDS' and g.status = 'finished' and g.game_mode <> 'practice'
          and g.played_at >= (${since}::timestamptz at time zone 'UTC')
          and (${type}::text is null or g.game_type = ${type})
          and (${term} = '' or g.player1_name ilike ${like} or g.player2_name ilike ${like} or g.player3_name ilike ${like} or g.player4_name ilike ${like} or s.name ilike ${like})
        order by g.played_at desc limit 400`));
    // 같은 두 회원 · 같은 날 공식전 수
    const pair = new Map<string, number>();
    // 시각 칸은 시간대 없는 UTC 값이다 — 글자로 받아 한국 날짜를 DB 에서 만든다(날 Date 로 받으면 9시간 함정)
    const keyOf = (r: any) => (r.is_ranked ? pairDayKey(String(r.kst_day), [r.player1_id, r.player2_id, r.player3_id, r.player4_id]) : null);
    for (const r of rows) { const k = keyOf(r); if (k) pair.set(k, (pair.get(k) ?? 0) + 1); }
    const out: AdminGameRow[] = rows.map((r) => {
        const t = r.game_type as "3c" | "4c";
        const players = [1, 2, 3, 4].filter((n) => r[`player${n}_id`] || r[`player${n}_name`]).map((n) => ({
            id: r[`player${n}_id`] ? String(r[`player${n}_id`]) : null,
            name: String(r[`player${n}_name`] ?? "게스트"),
            score: Number(r[`player${n}_score`]) || 0, target: Number(r[`player${n}_target`]) || 0, highRun: Number(r[`player${n}_high_run`]) || 0,
            innings: Array.isArray(r[`player${n}_innings`]) ? (r[`player${n}_innings`] as unknown[]).map((x) => Number(x) || 0) : null,
            winner: !!r.winner_id && r.winner_id === r[`player${n}_id`],
            avg: Number(r[`a${n}_${t === "3c" ? 3 : 4}`]) || null,
        }));
        const k = keyOf(r);
        return {
            id: String(r.id), playedAt: String(r.played_iso), gameType: t, gameMode: String(r.game_mode),
            ranked: r.is_ranked === true, storeName: r.store_name ?? null, totalInnings: Number(r.total_innings) || 0,
            players: players.map(({ avg: _a, ...p }) => p),
            flags: gameFlags({ gameType: t, ranked: r.is_ranked === true, totalInnings: Number(r.total_innings) || 0, players }, k ? pair.get(k) ?? 0 : 0),
            bracket: r.bracket === true,
        };
    });
    const flagged = req.query.flagged === "1";
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, flagged ? out.filter((g) => g.flags.length) : out);
}));

export default router;
