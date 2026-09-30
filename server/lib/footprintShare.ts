/**
 * 골프 발자국 공유 카드 주소의 서명(2026-09-30).
 *
 * 왜 서명하나: 발자국은 **그 사람이 어디를 다니는지**다. 선수·골프장 카드처럼 번호만으로 열리는 공개 주소면
 * 회원 번호만 알면 누구나 남의 동선을 본다. 그래서 카드 주소는 본인이 '공유'를 눌렀을 때만 만들어 주고,
 * 서명(HMAC-SHA256)과 만료가 맞아야 그려 준다. 기본은 비공개 — 공유를 안 누르면 주소 자체가 세상에 없다.
 *
 * 열쇠는 COOKIE_SECRET 에서 **용도별로 파생**한다. 쿠키 서명(cookie-parser)은 같은 비밀로 회원 번호에 HMAC 을 건다 —
 * 원래 비밀로 회원 번호를 서명하면 공유 주소의 서명이 곧 로그인 쿠키 서명이 되어, 카드 주소를 받은 사람이
 * 그 회원으로 로그인할 수 있게 된다. 파생 열쇠 + 용도 접두어로 두 서명이 절대 같아지지 않게 한다.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** 공유 주소의 수명 — 카톡방에 올린 링크가 한 달 뒤엔 닫힌다. 이미지 파일로 보낸 건 상관없다. */
export const FOOTPRINT_SHARE_TTL_SEC = 30 * 24 * 3600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function key(): Buffer | null {
    const secret = process.env.COOKIE_SECRET;
    // 비밀이 없으면(설정 사고) 공유를 막는다 — 빈 열쇠로 서명하면 누구나 주소를 만들 수 있다.
    if (!secret) return null;
    return createHmac("sha256", secret).update("rankue:golf-footprints-card:v1").digest();
}

function sign(k: Buffer, memberId: string, year: number | null, exp: number): string {
    return createHmac("sha256", k).update(`fp1|${memberId.toLowerCase()}|${year ?? "all"}|${exp}`).digest("base64url").slice(0, 32);
}

/** t = "<만료(초, 36진)>.<서명>" */
export function signFootprintShare(memberId: string, year: number | null, nowSec = Math.floor(Date.now() / 1000)): { token: string; exp: number } | null {
    const k = key();
    if (!k || !UUID_RE.test(memberId)) return null;
    const exp = nowSec + FOOTPRINT_SHARE_TTL_SEC;
    return { token: `${exp.toString(36)}.${sign(k, memberId, year, exp)}`, exp };
}

/** 서명·만료가 맞으면 true. 틀린 이유는 밖에 알리지 않는다(라우트는 전부 404). */
export function verifyFootprintShare(memberId: string, year: number | null, token: unknown, nowSec = Math.floor(Date.now() / 1000)): boolean {
    const k = key();
    if (!k || typeof token !== "string" || token.length > 80 || !UUID_RE.test(memberId)) return false;
    const m = /^([0-9a-z]{1,10})\.([A-Za-z0-9_-]{32})$/.exec(token);
    if (!m) return false;
    const exp = parseInt(m[1], 36);
    if (!Number.isFinite(exp) || exp < nowSec || exp > nowSec + FOOTPRINT_SHARE_TTL_SEC + 3600) return false;
    const want = Buffer.from(sign(k, memberId, year, exp));
    const got = Buffer.from(m[2]);
    return want.length === got.length && timingSafeEqual(want, got);
}

/** 카드 주소(상대 경로) — 앱은 원격 URL 모드라 같은 출처다. 연도가 없으면 전체. */
export function footprintCardPath(memberId: string, year: number | null, token: string): string {
    const q = new URLSearchParams();
    if (year != null) q.set("year", String(year));
    q.set("t", token);
    return `/og/golf-footprints/${memberId}.png?${q.toString()}`;
}
