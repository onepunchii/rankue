/**
 * 코리아둘레길 코스 도장 카드 주소의 서명(2026-10-21) — 골프 도장첩 카드(server/lib/stampShare.ts)와 같은 방식이다.
 *
 * 왜 서명하나: 도장 카드는 **그 사람이 언제 어느 코스를 걸었는지**다. 번호만으로 열리면 회원 번호만 알면 남의 카드를 본다.
 * 그래서 주소는 본인이 '공유'를 눌렀을 때만 만들어 주고, 서명(HMAC-SHA256)과 만료가 맞아야 그려 준다.
 * 열쇠는 COOKIE_SECRET 에서 **이 용도로만** 파생한다 — 쿠키 · 발자국 · 골프 도장 카드의 서명과 절대 같아지지 않는다.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** 공유 주소의 수명 — 30일 뒤 닫힌다. 이미지 파일로 보낸 건 상관없다 */
export const TRAIL_STAMP_SHARE_TTL_SEC = 30 * 24 * 3600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 두루누비 코스 id(crsIdx) — 'T_CRS_MNG0000004239' */
const COURSE_RE = /^[A-Z][A-Z0-9_]{5,39}$/;

function key(): Buffer | null {
    const secret = process.env.COOKIE_SECRET;
    // 비밀이 없으면(설정 사고) 공유를 막는다 — 빈 열쇠로 서명하면 누구나 주소를 만들 수 있다
    if (!secret) return null;
    return createHmac("sha256", secret).update("rankue:trail-stamp-card:v1").digest();
}
const sign = (k: Buffer, memberId: string, courseId: string, exp: number) =>
    createHmac("sha256", k).update(`ts1|${memberId.toLowerCase()}|${courseId}|${exp}`).digest("base64url").slice(0, 32);

/** t = "<만료(초, 36진)>.<서명>" */
export function signTrailStampShare(memberId: string, courseId: string, nowSec = Math.floor(Date.now() / 1000)): { token: string; exp: number } | null {
    const k = key();
    if (!k || !UUID_RE.test(memberId) || !COURSE_RE.test(courseId)) return null;
    const exp = nowSec + TRAIL_STAMP_SHARE_TTL_SEC;
    return { token: `${exp.toString(36)}.${sign(k, memberId, courseId, exp)}`, exp };
}

/** 서명 · 만료가 맞으면 true. 틀린 이유는 밖에 알리지 않는다(라우트는 전부 404) */
export function verifyTrailStampShare(memberId: string, courseId: string, token: unknown, nowSec = Math.floor(Date.now() / 1000)): boolean {
    const k = key();
    if (!k || typeof token !== "string" || token.length > 80 || !UUID_RE.test(memberId) || !COURSE_RE.test(courseId)) return false;
    const m = /^([0-9a-z]{1,10})\.([A-Za-z0-9_-]{32})$/.exec(token);
    if (!m) return false;
    const exp = parseInt(m[1], 36);
    if (!Number.isFinite(exp) || exp < nowSec || exp > nowSec + TRAIL_STAMP_SHARE_TTL_SEC + 3600) return false;
    const want = Buffer.from(sign(k, memberId, courseId, exp));
    const got = Buffer.from(m[2]);
    return want.length === got.length && timingSafeEqual(want, got);
}

/** 카드 주소(상대 경로) — 앱은 원격 URL 모드라 같은 출처다 */
export const trailStampCardPath = (memberId: string, courseId: string, token: string): string =>
    `/og/trail-stamp/${memberId}/${courseId}.png?${new URLSearchParams({ t: token }).toString()}`;
