import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { requireAuth, type AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { msg } from "../../lib/i18n.js";
import { storage } from "../../storage/index.js";
import { isMemberSuspended, SUSPENDED_TEXT } from "../../middleware/terms.js";
import { ACCOUNT_SUSPENDED_CODE } from "../../../shared/terms.js";
import { DELETED_PHONE_PREFIX } from "../../../shared/loginPhone.js";
import {
    HANDOFF_ISSUE_MAX, HANDOFF_ISSUE_WINDOW_SEC, HANDOFF_LAND_PATH, HANDOFF_TTL_SEC,
    handoffAppUrl, handoffIntentUrl, isHandoffToken, type HandoffIssue,
} from "../../../shared/loginHandoff.js";
import { insertLoginHandoff, recentLoginHandoffs, redeemLoginHandoff, sweepLoginHandoffs } from "../../storage/loginHandoff.repo.js";
import { attemptKey, checkRateLimit, registerFailure } from "./auth.js";

/**
 * '앱에서 열기' — 웹의 로그인을 앱으로 넘겨준다(2026-10-06 오너: "웹에서 로그인한 사람이 앱을 깔았을 때 다시 로그인하지 않고
 * 그대로 이어 쓰게. 새 앱 빌드 없이"). 흐름과 주소 모양은 shared/loginHandoff.
 *
 *   POST /handoff          로그인 필수. 한 번만 쓰는 토큰을 만들어 { appUrl, intentUrl, expiresInSec } 로 준다. 회원당 10분에 5번.
 *   POST /handoff/redeem   로그인 불필요. { token } 을 쿠키와 바꾼다 — 한 번만, 120초 안에. 이미 로그인된 요청은 바꿔 주지 않는다(409).
 *
 * 지키는 것:
 *  - **토큰 원문은 저장하지 않는다.** DB 에는 sha256 만 간다. 원문이 실리는 곳은 발급 응답의 본문 하나뿐이다(로그에도 적지 않는다).
 *  - 두 길 다 JSON 본문만 받는다. 이 서버는 폼 본문(urlencoded)도 읽는다 — 그대로 두면 남의 사이트가 숨긴 폼으로
 *    자기 토큰을 보내 방문자를 **공격자 계정으로 로그인**시킬 수 있다(로그인 CSRF, 카카오 로그인과 같은 이유).
 *  - 바꾸기 실패는 전부 같은 401 한 가지다 — 없는 토큰·만료·이미 쓴 토큰·꼴이 틀린 값을 구분해 알려 주지 않는다.
 *  - 응답은 캐시하지 않는다(Cache-Control: no-store).
 */
const router = Router();

/** IP 하나가 15분 동안 낼 수 있는 바꾸기 실패 수. 토큰은 256비트 난수라 맞혀 볼 수 없다 — 이 한도는 DB 를 두드리는 것을 묶는 용도다.
 *  통신사 망·매장 와이파이는 여럿이 한 주소를 쓰므로(auth.ts LOGIN_UNKNOWN_MAX 와 같은 사정) 기본값 5 보다 넉넉히 둔다. */
const REDEEM_MAX_FAILS = 20;

/** 토큰 → DB 에 적는 값. 원문은 이 함수 밖 어디에도 저장하지 않는다. */
export function hashHandoffToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
}

/** 응답을 어디에도 캐시하지 않게 — 발급 응답에는 토큰이, 바꾸기 응답에는 회원 행이 실린다. */
function noStore(_req: unknown, res: any, next: () => void) {
    res.set("Cache-Control", "no-store");
    next();
}

// 아래 둘은 auth.ts 의 같은 이름 함수와 같은 규칙이다 — 그쪽이 내보내지(export) 않아 옮겨 적었다(시험이 두 벌이 같은지 본다).
/** 시도 횟수 제한에 쓸 접속 IP — trust proxy 를 켜지 않아 req.ip 는 앞단 주소일 수 있다. x-forwarded-for 의 첫 값을 먼저 본다. */
function clientIp(req: { headers: Record<string, unknown>; ip?: string }): string | undefined {
    const fwd = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    return (fwd || req.ip || undefined)?.slice(0, 64);
}

/** 본문이 JSON 으로 왔는가 — 폼은 application/json 을 못 보내고, 다른 사이트의 fetch 는 사전 요청(preflight)에서 막힌다. */
function isJsonBody(req: { is?: (type: string) => unknown }): boolean {
    return typeof req.is === "function" && !!req.is("application/json");
}

/** 탈퇴해 이름·번호가 지워진 회원 행인가(user.repo deleteAccount 가 phone 을 `del-…` 로 바꾼다). */
function isDeletedMember(member: { phone?: unknown } | null | undefined): boolean {
    return typeof member?.phone === "string" && member.phone.startsWith(DELETED_PHONE_PREFIX);
}

// POST /handoff — 로그인한 회원에게 '앱에서 열기' 주소를 준다. 본문은 빈 JSON `{}` 면 된다.
// 결과: 200 { appUrl, intentUrl, expiresInSec } · 400(JSON 본문 아님) · 401(비로그인·탈퇴) · 429(10분에 5번 초과)
router.post("/", noStore, requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!isJsonBody(req)) return sendError(res, 400, "err.auth.handoffBadRequest", "HANDOFF_BAD_REQUEST");
    const memberId = req.userId!;

    // 쿠키는 서명만 본다 — 그 사이 탈퇴한 회원(행은 '탈퇴회원'으로 남는다)의 쿠키로는 토큰을 만들지 않는다
    const member = await storage.getMemberById(memberId);
    if (!member || isDeletedMember(member)) return sendError(res, 401, "err.common.loginRequired");

    // 표가 쌓이지 않게 발급 때마다 치운다. 청소가 실패해도 발급은 살린다(다음 발급이 다시 치운다).
    try {
        await sweepLoginHandoffs(memberId, HANDOFF_ISSUE_WINDOW_SEC);
    } catch (e) {
        console.error("[Handoff] sweep failed:", (e as Error)?.message);
    }

    // 회원당 10분에 5번 — DB 의 행 수로 센다(서버리스 인스턴스가 여럿이어도 같은 수를 본다).
    // 세는 것과 적는 것이 한 문장이 아니라 동시에 온 요청이 한두 개 더 통과할 수 있다 — 자기 계정의 토큰을 조금 더 받을 뿐이라 둔다.
    const recent = await recentLoginHandoffs(memberId, HANDOFF_ISSUE_WINDOW_SEC);
    if (recent.count >= HANDOFF_ISSUE_MAX) {
        const sec = Math.max(1, HANDOFF_ISSUE_WINDOW_SEC - recent.oldestAgeSec);
        return sendError(res, 429, msg("err.auth.requestTooMany", { sec }), "HANDOFF_TOO_MANY");
    }

    // 난수 32바이트(base64url 43자). 저장하는 것은 해시뿐이고, 원문은 아래 응답의 두 주소 안에만 실린다.
    const token = randomBytes(32).toString("base64url");
    await insertLoginHandoff(memberId, hashHandoffToken(token), HANDOFF_TTL_SEC);

    const issued: HandoffIssue = { appUrl: handoffAppUrl(token), intentUrl: handoffIntentUrl(token), expiresInSec: HANDOFF_TTL_SEC };
    return sendSuccess(res, issued);
}));

/** 바꾸기 실패 — 이유가 무엇이든 같은 답 하나. 실패는 IP 로 센다. */
function sendRedeemInvalid(res: any, key: string) {
    registerFailure(key, REDEEM_MAX_FAILS);
    return sendError(res, 401, "err.auth.handoffInvalid", "HANDOFF_INVALID");
}

// POST /handoff/redeem — 토큰을 로그인 쿠키와 바꾼다. body: { token }
// 결과: 200 { member, isNew: false, redirectTo } (/social 과 같은 모양) · 400(JSON 본문 아님) · 401 HANDOFF_INVALID(없음·만료·이미 씀·꼴 틀림 — 구분 없음)
//       · 403 ACCOUNT_SUSPENDED(정지 계정 — 다른 로그인 길과 같은 답) · 409 HANDOFF_SIGNED_IN(이미 로그인된 요청 — 토큰은 그대로 둔다)
//       · 429(이 IP 의 실패가 너무 많음)
// 같은 토큰을 두 번 보내면 두 번째는 401 이다. 두 번 부르지 않는 것은 화면 몫이다(components/hiq/HandoffRedeemer).
router.post("/redeem", noStore, asyncHandler(async (req: any, res: any) => {
    if (!isJsonBody(req)) return sendError(res, 400, "err.auth.handoffBadRequest", "HANDOFF_BAD_REQUEST");

    // 실패만 센다. 성공해도 지우지 않는다 — 맞는 토큰 하나로 세던 것을 되돌리지 못하게.
    const key = attemptKey("handoff-redeem", "any", clientIp(req));
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, msg("err.auth.tooManyAttempts", { sec: rl.retryAfterSec }));
    }

    const token = req.body?.token;
    // 꼴이 틀린 값은 DB 를 보지 않고 끊는다(답은 같다)
    if (!isHandoffToken(token)) return sendRedeemInvalid(res, key);

    // 이미 로그인된 요청은 바꿔 주지 않는다(2026-10-06 검토). "쓰던 계정을 말없이 바꾸지 않는다"가 화면에만 있었다 — 화면의 로그인 확인이
    // 오류(순간 끊김 · 5xx)로 끝나면 비로그인으로 보여 그대로 바꾸러 왔고, 여기서 쿠키가 토큰의 계정으로 덮였다.
    // 토큰의 주인과 견주지 않는다(로그인돼 있으면 무조건 거절) — 견주려면 토큰을 먼저 읽어야 하고, 살아 있는 토큰인지에 따라 답이 갈린다.
    // 토큰은 건드리지 않고(쓰지 않은 채 만료된다) 실패로 세지도 않는다. 쿠키의 회원이 없거나 탈퇴·정지면 죽은 쿠키라 아래로 내려간다.
    const currentId = req.signedCookies?.hiq_user_id;
    if (typeof currentId === "string" && currentId) {
        const current = await storage.getMemberById(currentId);
        if (current && !isDeletedMember(current) && !(await isMemberSuspended(current.id))) {
            return sendError(res, 409, "err.auth.handoffSignedIn", "HANDOFF_SIGNED_IN");
        }
    }

    // 한 번만 쓰이게: 안 썼고 만료 전인 행을 '썼음'으로 바꾸는 한 문장이 회원 id 를 돌려준다(storage/loginHandoff.repo)
    const memberId = await redeemLoginHandoff(hashHandoffToken(token));
    if (!memberId) return sendRedeemInvalid(res, key);

    const member = await storage.getMemberById(memberId);
    if (!member || isDeletedMember(member)) return sendRedeemInvalid(res, key);

    // 운영자가 정지한 계정은 들여보내지 않는다 — 쿠키를 주기 전에 막는다(/login·/social 과 같은 답)
    if (await isMemberSuspended(member.id)) {
        res.clearCookie('hiq_user_id', { path: '/' });
        return sendError(res, 403, SUSPENDED_TEXT, ACCOUNT_SUSPENDED_CODE);
    }

    res.cookie('hiq_user_id', member.id, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        signed: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
        path: '/'
    });

    return sendSuccess(res, { member, isNew: false, redirectTo: HANDOFF_LAND_PATH });
}));

export default router;
