/**
 * 도장첩 완성 카드 주소의 서명(2026-10-12) — 발자국 카드(server/lib/footprintShare.ts)와 같은 방식이다.
 *
 * 왜 서명하나: 다 채운 도장첩은 **그 사람이 어느 골프장을 다녔는지**다. 번호만으로 열리는 공개 주소면
 * 회원 번호만 알면 누구나 남의 카드를 본다. 그래서 주소는 본인이 '공유'를 눌렀을 때만 만들어 주고,
 * 서명(HMAC-SHA256)과 만료가 맞아야 그려 준다. 공유를 안 누르면 주소 자체가 세상에 없다.
 *
 * 열쇠는 COOKIE_SECRET 에서 **이 용도로만** 파생한다 — 쿠키 서명 · 발자국 카드 서명과 절대 같아지지 않는다
 * (같은 열쇠면 한쪽의 주소가 다른 쪽의 열쇠가 된다).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** 공유 주소의 수명 — 카톡방에 올린 링크가 한 달 뒤엔 닫힌다. 이미지 파일로 보낸 건 상관없다. */
export const STAMP_SHARE_TTL_SEC = 30 * 24 * 3600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 도장첩의 이름표 — 영문 소문자와 붙임표만 */
const BOOK_RE = /^[a-z][a-z-]{1,30}$/;

function key(): Buffer | null {
    const secret = process.env.COOKIE_SECRET;
    // 비밀이 없으면(설정 사고) 공유를 막는다 — 빈 열쇠로 서명하면 누구나 주소를 만들 수 있다.
    if (!secret) return null;
    return createHmac("sha256", secret).update("rankue:golf-stamp-card:v1").digest();
}

function sign(k: Buffer, memberId: string, bookId: string, exp: number): string {
    return createHmac("sha256", k).update(`st1|${memberId.toLowerCase()}|${bookId}|${exp}`).digest("base64url").slice(0, 32);
}

/** t = "<만료(초, 36진)>.<서명>" */
export function signStampShare(memberId: string, bookId: string, nowSec = Math.floor(Date.now() / 1000)): { token: string; exp: number } | null {
    const k = key();
    if (!k || !UUID_RE.test(memberId) || !BOOK_RE.test(bookId)) return null;
    const exp = nowSec + STAMP_SHARE_TTL_SEC;
    return { token: `${exp.toString(36)}.${sign(k, memberId, bookId, exp)}`, exp };
}

/** 서명 · 만료가 맞으면 true. 틀린 이유는 밖에 알리지 않는다(라우트는 전부 404). */
export function verifyStampShare(memberId: string, bookId: string, token: unknown, nowSec = Math.floor(Date.now() / 1000)): boolean {
    const k = key();
    if (!k || typeof token !== "string" || token.length > 80 || !UUID_RE.test(memberId) || !BOOK_RE.test(bookId)) return false;
    const m = /^([0-9a-z]{1,10})\.([A-Za-z0-9_-]{32})$/.exec(token);
    if (!m) return false;
    const exp = parseInt(m[1], 36);
    if (!Number.isFinite(exp) || exp < nowSec || exp > nowSec + STAMP_SHARE_TTL_SEC + 3600) return false;
    const want = Buffer.from(sign(k, memberId, bookId, exp));
    const got = Buffer.from(m[2]);
    return want.length === got.length && timingSafeEqual(want, got);
}

/** 카드 주소(상대 경로) — 앱은 원격 URL 모드라 같은 출처다 */
export function stampCardPath(memberId: string, bookId: string, token: string): string {
    return `/og/golf-stamp/${memberId}/${bookId}.png?${new URLSearchParams({ t: token }).toString()}`;
}
