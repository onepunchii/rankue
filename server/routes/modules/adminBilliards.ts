/**
 * 어드민 · 당구(2026-10-16 어드민 전수 조사 → 오너가 정한 순서의 '당구'). '실전 경기' · '친구 초대' — 회원을 한 명씩 열지 않고 전부를 본다.
 *
 * GET /admin/billiards/games?days=7&type=3c|4c&flagged=1&q=   끝난 당구 경기(매치 · 대회) — 선수 · 점수 · 하이런 · 이닝 · 이상 표시(shared/billiardsGameFlags)
 * GET /admin/billiards/invites                                    친구 초대 — 초대한 사람 순위 · 초대로 든 가입(다시 볼 것 표시 · shared/inviteAdmin)
 * POST /admin/billiards/invites/:inviteeId/cancel { reason, takeBack } 초대 하나 취소(표시만) — takeBack 이면 줄어든 수만큼 보상(단계 · 고른 한정 큐)도 거둔다
 * GET /admin/billiards/online?days&type&q&member=                 끝난 온라인 대전(무효로 한 판 포함) — 점수 · 샷 수 · 레이팅 변화 · 다시 볼 것(shared/simMatchFlags)
 * GET /admin/billiards/online/ratings                              온라인 레이팅 표(3쿠션 · 4구)
 * GET /admin/billiards/online/:id                                  한 판의 샷(이닝 · 점수 · 앱/서버 어긋남) · 채팅 건수(글은 싣지 않는다)
 * GET /admin/billiards/online/:id/void-preview                     무효로 하면 레이팅이 바뀌는 사람(계산만)
 * POST /admin/billiards/online/:id/void { reason }                 무효 — canceled · end_reason 'void'(오래 멈춘 판 정리와 같은 길) → 레이팅 다시 계산
 * POST /admin/billiards/online/:id/restore { reason }              되살리기 — 원래 끝난 까닭으로 → 레이팅 다시 계산
 * GET /admin/billiards/case-audit                                   큐 케이스 맞춰 보기 — 받은 기록마다 지금 기록이 받쳐 주는가(shared/cueCaseAudit) · 한정판 번호 현황
 * GET /admin/billiards/case/:memberId                              한 사람 맞춰 보기
 * POST /admin/billiards/case/:memberId/take-back { itemIds, reason } 받쳐 주지 않는 줄만 거둔다(다시 판정해서 확인)
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
import type { CaseAuditMember, CaseAuditSweep } from "../../../shared/cueCaseAudit.js";
import { isRatedMatch, onlineFlags, type AdminOnlineDetail, type AdminOnlineRow, type AdminRatingChange, type AdminRatingRow } from "../../../shared/simMatchFlags.js";
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

// ── 온라인 대전 ─────────────────────────────────────────────────────────────
const shownName = (name: unknown, phone: unknown) => (isWithdrawnMember({ phone }) ? "탈퇴한 회원" : String(name ?? "회원"));
const ENDED = sql.raw("coalesce(m.finished_at, m.last_shot_at, m.created_at)");

router.get("/online", asyncHandler(async (req: any, res: any) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const type = req.query.type === "3c" || req.query.type === "4c" ? req.query.type : null;
    const member = typeof req.query.member === "string" && UUID.test(req.query.member) ? req.query.member : null;
    const term = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 30) : "";
    const like = `%${term.replace(/[%_\\]/g, "")}%`;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = rowsOf(await db.execute(sql`
        select m.id, m.game_type, m.handicap, m.aim_assist, m.end_reason, m.winner_id, m.host_id, m.guest_id, m.mismatches, m.rating_result, m.cup_game_id, m.admin_void,
            m.host_target, m.guest_target, m.state -> 'players' as ps,
            to_char(${ENDED}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ended_iso, to_char(${ENDED} + interval '9 hours', 'YYYY-MM-DD') as kst_day,
            h.name as host_name, h.phone as host_phone, g.name as guest_name, g.phone as guest_phone,
            (select count(*)::int from hiq_sim_match_shots s where s.match_id = m.id and s.player_index = 0) as s0,
            (select count(*)::int from hiq_sim_match_shots s where s.match_id = m.id and s.player_index = 1) as s1
        from hiq_sim_matches m left join hiq_members h on h.id = m.host_id left join hiq_members g on g.id = m.guest_id
        where m.guest_id is not null and (m.status = 'finished' or (m.status = 'canceled' and m.end_reason = 'void'))
          and ${ENDED} >= (${since}::timestamptz at time zone 'UTC')
          and (${type}::text is null or m.game_type = ${type})
          and (${member}::uuid is null or m.host_id = ${member}::uuid or m.guest_id = ${member}::uuid)
          and (${term} = '' or h.name ilike ${like} or g.name ilike ${like})
        order by ${ENDED} desc limit 400`));
    const base = rows.map((r) => {
        const voided = r.end_reason === "void";
        const endReason = voided ? (r.admin_void?.prevEndReason ?? null) : (r.end_reason ?? null);
        const winner: 0 | 1 | null = !r.winner_id ? null : String(r.winner_id) === String(r.host_id) ? 0 : 1;
        const input = { handicap: r.handicap === true, hasGuest: true, shots: [Number(r.s0) || 0, Number(r.s1) || 0] as const, endReason, winner, mismatches: Number(r.mismatches) || 0 };
        return { r, voided, endReason, winner, input, rated: isRatedMatch(input) };
    });
    // 같은 두 사람 · 같은 한국 날짜의 레이팅 판 수(무효로 한 판은 빼고)
    const pair = new Map<string, number>();
    const pairKey = (r: any) => `${r.kst_day}|${[String(r.host_id), String(r.guest_id)].sort().join("|")}`;
    for (const x of base) if (x.rated && !x.voided) pair.set(pairKey(x.r), (pair.get(pairKey(x.r)) ?? 0) + 1);
    const out: AdminOnlineRow[] = base.map(({ r, voided, endReason, winner, input, rated }) => {
        const ps = Array.isArray(r.ps) ? r.ps : [];
        const players = [0, 1].map((i) => ({
            id: String(i === 0 ? r.host_id : r.guest_id),
            name: i === 0 ? shownName(r.host_name, r.host_phone) : shownName(r.guest_name, r.guest_phone),
            score: Number(ps[i]?.score) || 0, target: Number(ps[i]?.target) || Number(i === 0 ? r.host_target : r.guest_target) || 0,
            innings: Number(ps[i]?.innings) || 0, highRun: Number(ps[i]?.highRun) || 0, shots: input.shots[i], winner: winner === i,
        }));
        const av = r.admin_void;
        return {
            id: String(r.id), endedAt: String(r.ended_iso), gameType: r.game_type === "4c" ? "4c" : "3c", handicap: r.handicap === true, rated,
            reality: r.aim_assist === false, endReason, delta: typeof r.rating_result?.delta === "number" ? r.rating_result.delta : null,
            mismatches: input.mismatches, cup: !!r.cup_game_id, players,
            flags: voided ? [] : onlineFlags(input, rated ? pair.get(pairKey(r)) ?? 0 : 0),
            voided: voided ? { at: String(av?.at ?? ""), reason: String(av?.reason ?? ""), by: String(av?.by ?? "관리자") } : null,
        };
    });
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, out);
}));

router.get("/online/ratings", asyncHandler(async (_req: any, res: any) => {
    const rows = rowsOf(await db.execute(sql`
        select r.member_id, r.game_type, r.rating, r.matches, r.wins, to_char(r.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_iso, m.name, m.phone
        from hiq_sim_match_ratings r left join hiq_members m on m.id = r.member_id order by r.rating desc, r.matches desc limit 500`));
    const out: AdminRatingRow[] = rows.map((r) => ({
        memberId: String(r.member_id), name: shownName(r.name, r.phone), gameType: r.game_type === "4c" ? "4c" : "3c",
        rating: Number(r.rating) || 0, matches: Number(r.matches) || 0, wins: Number(r.wins) || 0, updatedAt: String(r.updated_iso ?? ""),
    }));
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, out);
}));

router.get("/online/:id", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.id ?? "");
    if (!UUID.test(id)) return sendError(res, 404, "대전을 찾을 수 없어요");
    const shots = rowsOf(await db.execute(sql`
        select idx, player_index, inning, points, cushions, (client_hash is not null and client_hash <> hash) as mismatch,
            to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
        from hiq_sim_match_shots where match_id = ${id}::uuid order by idx limit 2000`));
    const [c] = rowsOf(await db.execute(sql`select count(*)::int as n from hiq_sim_match_chats where match_id = ${id}::uuid`));
    const out: AdminOnlineDetail = {
        shots: shots.map((s) => ({ idx: Number(s.idx), player: Number(s.player_index) === 1 ? 1 : 0, inning: s.inning == null ? null : Number(s.inning), points: Number(s.points) || 0, cushions: Number(s.cushions) || 0, mismatch: s.mismatch === true, at: String(s.at) })),
        chats: Number(c?.n) || 0,
    };
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, out);
}));

async function namedChanges(changes: readonly Omit<AdminRatingChange, "name">[]): Promise<AdminRatingChange[]> {
    const ids = [...new Set(changes.map((c) => c.memberId))].filter((x) => UUID.test(x));
    const names = new Map<string, string>();
    if (ids.length) for (const m of rowsOf(await db.execute(sql`select id, name, phone from hiq_members where id = any(${`{${ids.join(",")}}`}::uuid[])`))) names.set(String(m.id), shownName(m.name, m.phone));
    return changes.slice(0, 50).map((c) => ({ ...c, name: names.get(c.memberId) ?? "회원" }));
}

/** 무효 · 되살리기를 할 수 있는 판인가 — 월대회 판은 대진이 걸려 있어 여기서 건드리지 않는다 */
async function voidable(id: string, want: "finished" | "void"): Promise<string | null> {
    const [m] = rowsOf(await db.execute(sql`select status, end_reason, guest_id, cup_game_id from hiq_sim_matches where id = ${id}::uuid`));
    if (!m) return "대전을 찾을 수 없어요";
    if (m.cup_game_id) return "월대회 판은 대진이 걸려 있어 여기서 무효로 할 수 없어요";
    if (want === "finished" && !(m.status === "finished" && m.guest_id)) return m.end_reason === "void" ? "이미 무효로 한 판이에요" : "끝난 대전만 무효로 할 수 있어요";
    if (want === "void" && !(m.status === "canceled" && m.end_reason === "void")) return "무효로 한 판이 아니에요";
    return null;
}

router.get("/online/:id/void-preview", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.id ?? "");
    if (!UUID.test(id)) return sendError(res, 404, "대전을 찾을 수 없어요");
    const no = await voidable(id, "finished");
    if (no) return sendError(res, 409, no);
    const s = await storage.simMatch.recomputeRatings(true, { exclude: [id] });
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, { changes: await namedChanges(s.changes) });
}));

const adminNameOf = async (req: any) => String(((await storage.getProfile(req.adminProfileId).catch(() => null)) as any)?.nickname ?? "관리자").slice(0, 40);
const reasonOf = (req: any) => (typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 200) : "");

router.post("/online/:id/void", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.id ?? ""), reason = reasonOf(req);
    if (!UUID.test(id)) return sendError(res, 404, "대전을 찾을 수 없어요");
    if (!reason) return sendError(res, 400, "무효로 하는 까닭을 적어 주세요");
    const no = await voidable(id, "finished");
    if (no) return sendError(res, 409, no);
    const by = await adminNameOf(req);
    // 오른쪽 식은 바뀌기 전 값을 읽는다 — prevEndReason 은 원래 끝난 까닭
    const done = rowsOf(await db.execute(sql`update hiq_sim_matches
        set status = 'canceled', end_reason = 'void',
            admin_void = jsonb_build_object('at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'reason', ${reason}::text, 'by', ${by}::text, 'prevEndReason', end_reason)
        where id = ${id}::uuid and status = 'finished' and cup_game_id is null returning id`));
    if (!done.length) return sendError(res, 409, "끝난 대전만 무효로 할 수 있어요");
    const s = await storage.simMatch.recomputeRatings(false);
    await storage.simMatch.ratedDeltas(true).catch(() => undefined);
    return sendSuccess(res, { ok: true, changes: await namedChanges(s.changes) });
}));

router.post("/online/:id/restore", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.id ?? ""), reason = reasonOf(req);
    if (!UUID.test(id)) return sendError(res, 404, "대전을 찾을 수 없어요");
    if (!reason) return sendError(res, 400, "되살리는 까닭을 적어 주세요");
    const no = await voidable(id, "void");
    if (no) return sendError(res, 409, no);
    const by = await adminNameOf(req);
    const done = rowsOf(await db.execute(sql`update hiq_sim_matches
        set status = 'finished', end_reason = admin_void ->> 'prevEndReason',
            admin_void = admin_void || jsonb_build_object('restoredAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'restoreReason', ${reason}::text, 'restoredBy', ${by}::text)
        where id = ${id}::uuid and status = 'canceled' and end_reason = 'void' returning id`));
    if (!done.length) return sendError(res, 409, "무효로 한 판이 아니에요");
    const s = await storage.simMatch.recomputeRatings(false);
    await storage.simMatch.ratedDeltas(true).catch(() => undefined);
    return sendSuccess(res, { ok: true, changes: await namedChanges(s.changes) });
}));

// ── 큐 케이스 맞춰 보기 ──────────────────────────────────────────────────────
const LIMITED = CASE_ITEMS.filter((x) => typeof x.limit === "number");
const AUDIT_MAX = 300;

router.get("/case-audit", asyncHandler(async (_req: any, res: any) => {
    await storage.simMatch.ratedDeltas(true).catch(() => undefined); // 방금 무효로 한 판도 바로 빠지게 — 1분 재료를 새로
    const ids = rowsOf(await db.execute(sql`select member_id, count(*)::int as n from hiq_cue_case_awards group by member_id order by count(*) desc`).catch(() => ({ rows: [] })));
    const members: CaseAuditMember[] = [];
    for (const r of ids.slice(0, AUDIT_MAX)) {
        const a = await storage.cueCase.audit(String(r.member_id), Date.now());
        if (a) members.push(a);
    }
    members.sort((a, b) => b.unsupported - a.unsupported || b.rows.length - a.rows.length);
    const given = rowsOf(await db.execute(sql`select item_id, count(*)::int as n from hiq_cue_case_awards where item_id = any(${`{${LIMITED.map((x) => x.id).join(",")}}`}::text[]) group by item_id`).catch(() => ({ rows: [] })));
    const byItem = new Map(given.map((g) => [String(g.item_id), Number(g.n) || 0]));
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, {
        members, scanned: members.length, total: ids.length,
        limited: LIMITED.map((x) => ({ itemId: x.id, given: byItem.get(x.id) ?? 0, limit: x.limit! })),
    } satisfies CaseAuditSweep);
}));

router.get("/case/:memberId", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.memberId ?? "");
    if (!UUID.test(id)) return sendError(res, 404, "회원을 찾을 수 없어요");
    await storage.simMatch.ratedDeltas(true).catch(() => undefined);
    const a = await storage.cueCase.audit(id, Date.now());
    if (!a) return sendError(res, 404, "회원을 찾을 수 없어요");
    res.set("Cache-Control", "private, no-store");
    return sendSuccess(res, a);
}));

router.post("/case/:memberId/take-back", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.memberId ?? ""), reason = reasonOf(req);
    const itemIds = Array.isArray(req.body?.itemIds) ? req.body.itemIds.filter((x: unknown) => typeof x === "string").slice(0, 200) : [];
    if (!UUID.test(id)) return sendError(res, 404, "회원을 찾을 수 없어요");
    if (!reason) return sendError(res, 400, "거두는 까닭을 적어 주세요");
    if (!itemIds.length) return sendError(res, 400, "거둘 것을 골라 주세요");
    await storage.simMatch.ratedDeltas(true).catch(() => undefined);
    const taken = await storage.cueCase.takeBack(id, itemIds, Date.now());
    if (!taken.length) return sendError(res, 409, "지금 기록이 받쳐 주는 것은 거둘 수 없어요");
    return sendSuccess(res, { ok: true, taken });
}));

export default router;
