import type { Response, NextFunction } from "express";
import { eq, or } from "drizzle-orm";
import { db } from "../db.js";
import { hiqMembers, profiles } from "../../shared/schema.js";
import { isTermsAccepted, TERMS_REQUIRED_CODE, TERMS_VERSION, ACCOUNT_SUSPENDED_CODE } from "../../shared/terms.js";
import { TERMS_CONTACT_EMAIL } from "../../shared/termsContent.js";
import { sendError } from "../utils/response.js";
import type { AuthRequest } from "./auth.js";

// 이용약관 동의 + 계정 정지 문지기 — UGC 를 새로 만들거나 공개 문구를 바꾸는 라우트(커뮤니티 글·댓글, 크루 글·댓글·사진·
// 사진 댓글·채팅·정모·투표·대회·정산, 크루 만들기·설정, 프로필 이름·소개·사진)에만 건다.
//
// 왜 서버에서도 막는가: 화면의 동의 시트는 새 화면에서만 뜬다. 탭을 오래 열어 둔 옛 화면이나 API 를 직접 부르는
// 경우에도 "동의 없이는 UGC 없음"(Apple 1.2 · Play UGC)이 지켜져야 한다.
// 왜 UGC 작성 라우트에만 거는가: 읽기·경기 기록·설정까지 막으면 약관 시트가 없는 옛 화면에서 앱이 통째로 멈춘다.
// 여기서 막혀도 옛 화면은 오류 문구를 토스트로 보여 줄 뿐이고, 새 화면은 코드(TERMS_REQUIRED)를 보고 시트를 띄운다.

// 정지된 계정도 여기서 막는다(2026-09-11 검토 policy:R1) — 운영자가 신고 큐에서 '작성자 계정 정지'를 누르면
// profiles.status='banned' 가 되는데, 로그인·요청 인증(requireAuth)은 그 값을 읽지 않아 정지된 사람이 계속 글을 올렸다.
// requireAuth 전체에 거는 대신 UGC 작성 라우트의 이 문지기에 붙인 이유: 모든 요청마다 DB 를 한 번 더 읽지 않고,
// 약관 동의와 같은 행(hiq_members → profiles)을 한 번에 읽으면 된다. 로그인 자체는 auth.ts 가 막는다.

// 통과한 회원만 잠깐 기억한다(서버리스 인스턴스 메모리). 동의는 되돌리는 동작이 없지만 정지는 언제든 걸리므로
// 영구 캐시가 아니라 짧은 수명을 둔다 — 정지는 늦어도 이 시간 안에 모든 인스턴스에서 효력이 난다.
// 버전을 같이 적어 두어 최소 버전이 오르면 자연히 무효가 된다.
const CACHE_TTL_MS = 60_000;
const passCache = new Map<string, { version: string; at: number }>();
const CACHE_LIMIT = 5000;

function remember(memberId: string, version: string) {
    if (passCache.size >= CACHE_LIMIT) passCache.clear();
    passCache.set(memberId, { version, at: Date.now() });
}

function cachedPass(memberId: string): boolean {
    const hit = passCache.get(memberId);
    if (!hit) return false;
    if (Date.now() - hit.at > CACHE_TTL_MS) { passCache.delete(memberId); return false; }
    return isTermsAccepted(hit.version);
}

/** 회원의 약관 동의 버전과 정지 여부. 프로필이 없는 회원(매장에서 번호만으로 만든 행)은 정지할 계정이 없어 banned=false. */
async function memberGateState(memberId: string): Promise<{ termsVersion: string | null; banned: boolean }> {
    const [row] = await db
        .select({ termsVersion: hiqMembers.termsVersion, status: profiles.status })
        .from(hiqMembers)
        .leftJoin(profiles, eq(hiqMembers.profileId, profiles.id))
        .where(eq(hiqMembers.id, memberId))
        .limit(1);
    return { termsVersion: row?.termsVersion ?? null, banned: row?.status === "banned" };
}

/** 정지된 계정인가 — 로그인·가입 직후(auth.ts)에 쿠키를 주기 전에 확인한다. */
export async function isMemberSuspended(memberId: string): Promise<boolean> {
    return (await memberGateState(memberId)).banned;
}

export const SUSPENDED_MESSAGE = `운영 정책 위반으로 이용이 정지된 계정입니다. 문의: ${TERMS_CONTACT_EMAIL}`;

/** requireAuth 뒤에 둔다. 정지된 계정이면 403 + ACCOUNT_SUSPENDED, 동의 기록이 없거나 옛 버전이면 403 + TERMS_REQUIRED. */
export async function requireTermsAccepted(req: AuthRequest, res: Response, next: NextFunction) {
    const memberId = req.userId;
    if (!memberId) return next(); // requireAuth 가 이미 401 을 보냈어야 한다 — 여기서 이중으로 막지 않는다
    if (cachedPass(memberId)) return next();
    let state: { termsVersion: string | null; banned: boolean };
    try {
        state = await memberGateState(memberId);
    } catch (e) {
        // 조회 실패 때 그냥 통과시키면 정지된 계정·미동의 회원이 그 틈에 글을 올린다(검토 policy:R10).
        // DB 가 흔들리는 순간이면 뒤따르는 글 저장도 대개 실패하므로, 잠시 뒤 다시 하라고 안내하는 편이 낫다.
        console.error("[Terms] gate lookup failed:", (e as Error)?.message);
        return sendError(res, 503, "err.common.retryLater");
    }
    if (state.banned) {
        passCache.delete(memberId);
        return sendError(res, 403, SUSPENDED_MESSAGE, ACCOUNT_SUSPENDED_CODE);
    }
    if (isTermsAccepted(state.termsVersion)) {
        remember(memberId, state.termsVersion!);
        return next();
    }
    return sendError(
        res,
        403,
        "이용약관에 동의해야 글·댓글·사진·채팅을 올릴 수 있어요. 화면을 새로고침한 뒤 약관에 동의해 주세요.",
        TERMS_REQUIRED_CODE,
    );
}

/**
 * 동의를 기록한다. 같은 사람(profile)이 매장마다 회원 행을 따로 가질 수 있어서, 한 번 동의하면
 * 같은 profile 의 회원 행 모두에 적는다 — 매장을 옮겨 로그인했다고 다시 묻지 않게.
 */
export async function recordTermsAcceptance(memberId: string, version: string = TERMS_VERSION): Promise<void> {
    if (!isTermsAccepted(version)) throw new Error("INVALID_TERMS_VERSION");
    const [row] = await db
        .select({ profileId: hiqMembers.profileId })
        .from(hiqMembers)
        .where(eq(hiqMembers.id, memberId))
        .limit(1);
    const target = row?.profileId
        ? or(eq(hiqMembers.id, memberId), eq(hiqMembers.profileId, row.profileId))
        : eq(hiqMembers.id, memberId);
    await db.update(hiqMembers).set({ termsVersion: version, termsAcceptedAt: new Date() }).where(target);
    remember(memberId, version);
}
