/**
 * 어드민 · 당구(2026-10-16 어드민 전수 조사 → 오너가 정한 순서의 '당구'). '실전 경기' · '친구 초대' — 회원을 한 명씩 열지 않고 전부를 본다.
 *
 * GET /admin/billiards/games?days=7&type=3c|4c&flagged=1&q=   끝난 당구 경기(매치 · 대회) — 선수 · 점수 · 하이런 · 이닝 · 이상 표시(shared/billiardsGameFlags)
 * GET /admin/billiards/invites                                    친구 초대 — 초대한 사람 순위 · 초대로 든 가입(다시 볼 것 표시 · shared/inviteAdmin)
 * POST /admin/billiards/invites/:inviteeId/cancel { reason, takeBack } 초대 하나 취소(표시만) — takeBack 이면 줄어든 수만큼 보상(단계 · 고른 한정 큐)도 거둔다
 * 지우기는 예전 길(DELETE /admin/games/:id — RP · 에버리지를 되돌린다)을 그대로 쓴다. 까닭은 작업 기록에 남는다.
 */
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db.js";
import { checkSuperAdmin } from "../../middleware/adminAuth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { gameFlags, pairDayKey, type AdminGameRow } from "../../../shared/billiardsGameFlags.js";
import { CASE_ITEMS, INVITE_PICK_LIMIT, invitePicks } from "../../../shared/cueCase.js";
import { inviteFlags, type AdminInviteRow, type AdminInviterRow, type AdminInviteStock, type AdminInvites } from "../../../shared/inviteAdmin.js";
import { isWithdrawnMember } from "../../../shared/chatSupport.js";
import { storage } from "../../storage/index.js";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LADDER = CASE_ITEMS.filter((x) => x.rule.k === "invite");
const PICK_IDS = CASE_ITEMS.filter((x) => x.rule.k === "invitePick").map((x) => x.id);
const PICK_ARRAY = `{${PICK_IDS.join(",")}}`;
const iso = (col: string) => sql.raw(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);

router.get("/invites", asyncHandler(async (_req: any, res: any) => {
    let refs: any[] = [];
    try {
        refs = rowsOf(await db.execute(sql`
            select r.invitee_id, r.inviter_id, ${iso("r.created_at")} as at, ${iso("r.canceled_at")} as canceled_at, r.cancel_reason, r.canceled_by,
                coalesce(a.name, '회원') as inviter_name, a.phone as inviter_phone, coalesce(b.name, '회원') as invitee_name, b.phone as invitee_phone,
                to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as invitee_joined, to_char(b.last_visited_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as invitee_seen,
                (select count(*)::int from hiq_game_history h where h.member_id = r.invitee_id) as real_games,
                (select count(*)::int from hiq_sim_matches m where (m.host_id = r.invitee_id or m.guest_id = r.invitee_id) and m.status = 'finished') as online_games
            from hiq_referrals r left join hiq_members a on a.id = r.inviter_id left join hiq_members b on b.id = r.invitee_id
            order by r.created_at desc limit 1000`));
    } catch (e: any) { if ((e?.code ?? e?.cause?.code) !== "42P01" && (e?.code ?? e?.cause?.code) !== "42703") throw e; }
    // 같은 사람의 초대 시각(취소한 것 빼고) — 한 시간에 몰렸는지 본다
    const live = new Map<string, string[]>();
    for (const r of refs) if (!r.canceled_at) { const l = live.get(String(r.inviter_id)) ?? []; l.push(String(r.at)); live.set(String(r.inviter_id), l); }
    const rows: AdminInviteRow[] = refs.map((r) => {
        const games = (Number(r.real_games) || 0) + (Number(r.online_games) || 0), withdrawn = isWithdrawnMember({ phone: r.invitee_phone });
        return {
            inviteeId: String(r.invitee_id), inviteeName: withdrawn ? "탈퇴한 회원" : String(r.invitee_name), inviterId: String(r.inviter_id),
            inviterName: isWithdrawnMember({ phone: r.inviter_phone }) ? "탈퇴한 회원" : String(r.inviter_name),
            at: String(r.at), inviteeJoinedAt: r.invitee_joined ?? null, inviteeSeenAt: r.invitee_seen ?? null, games, withdrawn,
            canceled: r.canceled_at ? { at: String(r.canceled_at), reason: String(r.cancel_reason ?? ""), by: String(r.canceled_by ?? "관리자") } : null,
            flags: r.canceled_at ? [] : inviteFlags({ at: String(r.at), games, withdrawn, siblingsAt: live.get(String(r.inviter_id)) ?? [] }),
        };
    });
    // 한정 큐 열두 자루 — 몇 번을 누가 가졌나(운영자가 증정한 것도 함께 — 같은 번호 줄이다)
    const held = rowsOf(await db.execute(sql`select a.item_id, a.serial, a.member_id, coalesce(m.name, '회원') as name, m.phone
        from hiq_cue_case_awards a left join hiq_members m on m.id = a.member_id where a.item_id = any(${PICK_ARRAY}::text[]) order by a.item_id, a.serial`).catch(() => ({ rows: [] })));
    const used = new Map<string, number>();
    for (const h of held) used.set(String(h.member_id), (used.get(String(h.member_id)) ?? 0) + 1);
    const stock: AdminInviteStock[] = PICK_IDS.map((itemId) => ({
        itemId, limit: INVITE_PICK_LIMIT,
        holders: held.filter((h) => h.item_id === itemId).map((h) => ({ memberId: String(h.member_id), name: isWithdrawnMember({ phone: h.phone }) ? "탈퇴한 회원" : String(h.name), serial: Number(h.serial) || 0 })),
    }));
    const top: AdminInviterRow[] = [...live.entries()].map(([id, ats]) => {
        const mine = rows.filter((r) => r.inviterId === id && !r.canceled);
        return { memberId: id, name: mine[0].inviterName, count: ats.length, suspicious: mine.filter((r) => r.flags.length).length, picks: invitePicks(ats.length, used.get(id) ?? 0), lastAt: ats[0] };
    }).sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, { rows, top, stock } satisfies AdminInvites);
}));

/**
 * 초대 하나 취소 — 줄은 지우지 않고 표시만(지우면 같은 사람이 코드를 다시 넣을 수 있다). 초대 수에서 빠진다.
 * takeBack(기본 켬)이면 줄어든 수만큼 거둔다: 단계 보상(1 · 3 · 10명) · 고를 수 있는 수를 넘은 한정 큐(늦게 고른 것부터).
 * 운영자가 '굿즈 · 배지'에서 증정한 물건은 건드리지 않는다(증정 기록이 따로 있다 — 회수는 거기서).
 * 맨 끝 번호를 거두면 그 번호는 다음에 고르는 사람이 받는다(번호 = 지금 가장 큰 번호 + 1).
 */
router.post("/invites/:inviteeId/cancel", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.inviteeId ?? ""), reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 200) : "";
    if (!UUID.test(id)) return sendError(res, 404, "초대 기록을 찾을 수 없어요");
    if (!reason) return sendError(res, 400, "취소하는 까닭을 적어 주세요");
    const admin = await storage.getProfile(req.adminProfileId).catch(() => null);
    const by = String((admin as any)?.nickname ?? "관리자").slice(0, 40);
    const [gone] = rowsOf(await db.execute(sql`update hiq_referrals set canceled_at = now(), cancel_reason = ${reason}, canceled_by = ${by}
        where invitee_id = ${id}::uuid and canceled_at is null returning inviter_id`));
    if (!gone) {
        const [was] = rowsOf(await db.execute(sql`select 1 from hiq_referrals where invitee_id = ${id}::uuid`));
        return was ? sendError(res, 409, "이미 취소한 초대예요") : sendError(res, 404, "초대 기록을 찾을 수 없어요");
    }
    const inviter = String(gone.inviter_id);
    const taken: string[] = [];
    if (req.body?.takeBack !== false) {
        const [{ n }] = rowsOf(await db.execute(sql`select count(*)::int as n from hiq_referrals where inviter_id = ${inviter}::uuid and canceled_at is null`));
        const granted = sql`exists (select 1 from hiq_goods_grants g where g.member_id = ${inviter}::uuid and g.sport = 'billiards' and g.item = hiq_cue_case_awards.item_id and g.revoked_at is null)`;
        for (const x of LADDER) if (x.rule.k === "invite" && Number(n) < x.rule.n) {
            const d = rowsOf(await db.execute(sql`delete from hiq_cue_case_awards where member_id = ${inviter}::uuid and item_id = ${x.id} and not ${granted} returning item_id`).catch(() => ({ rows: [] })));
            if (d.length) taken.push(x.id);
        }
        const mine = rowsOf(await db.execute(sql`select item_id, (${granted}) as granted from hiq_cue_case_awards
            where member_id = ${inviter}::uuid and item_id = any(${PICK_ARRAY}::text[]) order by created_at desc`).catch(() => ({ rows: [] })));
        let over = mine.length - invitePicks(Number(n), 0).total;
        for (const r of mine) {
            if (over <= 0) break;
            if (r.granted === true) continue;
            await db.execute(sql`delete from hiq_cue_case_awards where member_id = ${inviter}::uuid and item_id = ${String(r.item_id)}`);
            taken.push(String(r.item_id));
            over--;
        }
        if (taken.length) await db.execute(sql`update hiq_cue_case_prefs set hero_item = null where member_id = ${inviter}::uuid and hero_item = any(${`{${taken.join(",")}}`}::text[])`).catch(() => undefined);
    }
    return sendSuccess(res, { ok: true, inviterId: inviter, taken });
}));

export default router;
