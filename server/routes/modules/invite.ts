/**
 * 친구 초대(2026-10-16, 규칙 shared/invite · 보상 shared/cueCase 의 invite · invited · invitePick).
 *
 * GET  /friend-invite/me          내 코드 · 링크 · 초대한 수 · 한정 큐 고르기 남은 수 · 내가 누구의 초대로 왔는지 · 아직 코드를 넣을 수 있는지
 * GET  /friend-invite/code/:code  링크를 연 사람에게(로그인 없이) — 초대한 사람의 이름 · 대표 큐
 * POST /friend-invite/claim       { code } 새로 가입한 사람이 초대를 낸다(가입한 지 7일 안 · 한 번만). 받는 즉시 환영 초크,
 *                          초대한 사람에게는 단계(1 · 3 · 10명) 보상과 알림. 30명마다 한정 큐 고르기가 하나씩 생긴다(고르기는 /cue-case/invite-pick).
 * 주소가 /friend-invite 인 까닭: 게임 초대 코드(game.ts 의 GET /invite/:code)가 먼저 걸려 있어 /invite/me 를 가로챘다(2026-10-16 오너 "버튼이 비활성화").
 * 표: hiq_invite_codes(한 사람 코드 하나) · hiq_referrals(초대로 센 가입 — invitee 가 열쇠라 한 사람은 한 번만). 더하기만.
 */
import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db.js";
import { hiqMembers } from "../../../shared/schema.js";
import { storage } from "../../storage/index.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth, type AuthRequest } from "../../middleware/auth.js";
import { msg } from "../../lib/i18n.js";
import { notificationService } from "../../services/notificationService.js";
import { isWithdrawnMember } from "../../../shared/chatSupport.js";
import { CASE_ITEMS, INVITE_PICK_EVERY, caseItem, invitePicks } from "../../../shared/cueCase.js";
import { claimRefusal, cleanInviteCode, inviteUrl, randomInviteCode, INVITE_CLAIM_DAYS, type ClaimRefusal, type InviteCard, type InviteMe } from "../../../shared/invite.js";

const router = Router();
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const LADDER = CASE_ITEMS.filter((x) => x.rule.k === "invite");
const PICKS = CASE_ITEMS.filter((x) => x.rule.k === "invitePick").map((x) => x.id);
const REFUSAL: Readonly<Record<ClaimRefusal, [number, string]>> = {
    code: [404, "err.invite.code"], self: [400, "err.invite.self"], old: [409, "err.invite.old"], already: [409, "err.invite.already"], older: [409, "err.invite.older"],
};

/** 내 코드 — 없으면 만든다(겹치면 다시 뽑는다) */
async function codeOf(memberId: string): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
        const [row] = rowsOf(await db.execute(sql`select code from hiq_invite_codes where member_id = ${memberId}::uuid`));
        if (row) return String(row.code);
        try {
            await db.execute(sql`insert into hiq_invite_codes (member_id, code) values (${memberId}::uuid, ${randomInviteCode()}) on conflict (member_id) do nothing`);
        } catch (e: any) {
            if (e?.code !== "23505") throw e; // 코드가 남의 것과 겹쳤다 — 다시 뽑는다
        }
    }
    throw new Error("invite code: could not allocate");
}
// 운영자가 취소한 초대(canceled_at — 어드민 › 당구 › 친구 초대)는 세지 않는다. 줄은 남아 있어 같은 사람이 다시 넣지는 못한다
const countOf = async (memberId: string) => Number(rowsOf(await db.execute(sql`select count(*)::int as n from hiq_referrals where inviter_id = ${memberId}::uuid and canceled_at is null`))[0]?.n) || 0;

router.get("/friend-invite/me", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const me = req.userId!;
    const [code, count, [mine], [who], used] = await Promise.all([
        codeOf(me),
        countOf(me),
        db.execute(sql`select m.name, r.canceled_at from hiq_referrals r left join hiq_members m on m.id = r.inviter_id where r.invitee_id = ${me}::uuid`).then(rowsOf),
        db.select({ createdAt: hiqMembers.createdAt }).from(hiqMembers).where(eq(hiqMembers.id, me)).limit(1),
        db.execute(sql`select count(*)::int as n from hiq_cue_case_awards where member_id = ${me} and item_id = any(${`{${PICKS.join(",")}}`}::text[])`).then((r) => Number(rowsOf(r)[0]?.n) || 0),
    ]);
    const joined = who?.createdAt ? new Date(who.createdAt).getTime() : 0;
    const body: InviteMe = {
        code, url: inviteUrl(code), count, picks: invitePicks(count, used),
        invitedBy: mine && !mine.canceled_at ? String(mine.name ?? "회원") : null,
        canClaim: !mine && Date.now() - joined <= INVITE_CLAIM_DAYS * 86_400_000,
    };
    res.setHeader("Cache-Control", "private, no-store");
    return sendSuccess(res, body);
}));

/** 링크를 연 사람에게 — 이름과 대표 큐만(로그인 없이). 대표 큐 규칙은 큐 케이스 · 게임과 같다(고른 것, 없으면 가장 최근에 받은 큐) */
router.get("/friend-invite/code/:code", asyncHandler(async (req: any, res: any) => {
    const code = cleanInviteCode(req.params.code);
    if (!code) return sendError(res, 404, "err.invite.code");
    const [row] = rowsOf(await db.execute(sql`
        select m.id, m.name, m.phone,
            coalesce(
                (select p.hero_item from hiq_cue_case_prefs p join hiq_cue_case_awards a on a.member_id = p.member_id and a.item_id = p.hero_item where p.member_id = m.id),
                (select a.item_id from hiq_cue_case_awards a where a.member_id = m.id and a.item_id like 'cue-%' order by a.earned_at desc, a.item_id limit 1)) as hero
        from hiq_invite_codes c join hiq_members m on m.id = c.member_id where c.code = ${code}`));
    if (!row || isWithdrawnMember({ phone: row.phone })) return sendError(res, 404, "err.invite.code");
    const hero = typeof row.hero === "string" && caseItem(row.hero)?.kind === "cue" ? row.hero : null;
    res.setHeader("Cache-Control", "public, max-age=300");
    return sendSuccess(res, { name: String(row.name ?? "회원"), hero } satisfies InviteCard);
}));

router.post("/friend-invite/claim", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const me = req.userId!, now = Date.now();
    const code = cleanInviteCode(req.body?.code);
    if (!code) return sendError(res, 404, "err.invite.code");
    const [inviter] = rowsOf(await db.execute(sql`select c.member_id, m.created_at, m.name from hiq_invite_codes c join hiq_members m on m.id = c.member_id where c.code = ${code}`));
    const [who] = await db.select({ name: hiqMembers.name, createdAt: hiqMembers.createdAt }).from(hiqMembers).where(eq(hiqMembers.id, me)).limit(1);
    const [already] = rowsOf(await db.execute(sql`select 1 from hiq_referrals where invitee_id = ${me}::uuid`));
    const refusal = claimRefusal({
        inviterId: inviter ? String(inviter.member_id) : null, meId: me,
        myJoinedAt: who?.createdAt ? new Date(who.createdAt).getTime() : 0,
        inviterJoinedAt: inviter?.created_at ? new Date(inviter.created_at).getTime() : null,
        already: !!already, now,
    });
    if (refusal) { const [status, key] = REFUSAL[refusal]; return sendError(res, status, key); }
    const inviterId = String(inviter.member_id);
    const done = rowsOf(await db.execute(sql`insert into hiq_referrals (invitee_id, inviter_id, code) values (${me}::uuid, ${inviterId}::uuid, ${code}) on conflict (invitee_id) do nothing returning invitee_id`));
    if (!done.length) return sendError(res, 409, "err.invite.already");

    // 보상 — 초대받은 사람은 환영 초크, 초대한 사람은 다다른 단계까지(이미 있으면 그대로)
    const at = new Date(now);
    await storage.cueCase.awardNow(me, "chalk-welcome", at);
    const count = await countOf(inviterId);
    for (const x of LADDER) if (x.rule.k === "invite" && count >= x.rule.n) await storage.cueCase.awardNow(inviterId, x.id, at);
    const name = String(who?.name ?? "회원");
    await notificationService.sendAndSaveNotification({
        memberId: inviterId, category: "BILLIARDS", type: "INVITE_JOINED",
        title: msg("notif.invite.joinedTitle"),
        body: count % INVITE_PICK_EVERY === 0 ? msg("notif.invite.pickBody", { name, n: count }) : msg("notif.invite.joinedBody", { name, n: count }),
        params: { url: "/cue-case?sec=cue&invite=1" },
    }).catch((e: unknown) => console.warn("[invite] notify failed:", (e as Error)?.message));
    return sendSuccess(res, { ok: true, welcome: "chalk-welcome", inviter: String(inviter.name ?? "회원") });
}));

export default router;
