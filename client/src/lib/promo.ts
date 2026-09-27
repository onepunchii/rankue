/**
 * 검색 유입 → 가입 깔때기(2026-09-27) — 화면 쪽. shared/promoFunnel.ts 의 단계를 서버(/api/promo-event)로 보낸다.
 *  - 방문자 id 는 접속자 비콘(VisitBeacon)과 같은 난수 id 를 쓴다(IP·계정은 보내지 않는다).
 *  - 단계마다 **하루 한 번**만 보낸다(localStorage 게이트) — 스크롤할 때마다 view 가 쌓이지 않게.
 *  - 배너를 누르면 출처(store·pba·umb)를 7일 기억해, 그 뒤의 길 찾기·가입 안내·가입을 같은 출처로 센다.
 * localStorage 가 막힌 곳(시크릿 등)에서는 조용히 넘어간다 — 부가 기능이다.
 */
import { GUEST_PATH_FREE, guestPathLeft, isPromoSrc, type PromoSrc, type PromoStep } from "@shared/promoFunnel";

const ID_KEY = "rankue-visitor"; // VisitBeacon 과 같은 키
const SRC_KEY = "rankue-promo-src";
const SENT_KEY = "rankue-promo-sent";
const GUEST_PATH_KEY = "rankue.sim.guestPathUses";
const SRC_TTL = 7 * 86_400_000;

const kstToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

function visitorId(): string | null {
    try {
        let id = localStorage.getItem(ID_KEY);
        if (!id) { id = crypto.randomUUID(); localStorage.setItem(ID_KEY, id); }
        return id;
    } catch { return null; }
}

/** 배너를 누른 출처 기억(7일) */
export function rememberPromoSrc(src: PromoSrc) {
    try { localStorage.setItem(SRC_KEY, JSON.stringify({ src, at: Date.now() })); } catch { /* 부가 기능 */ }
}
/** 기억한 출처 — 없거나 7일이 지났으면 null(배너를 거치지 않은 사람은 세지 않는다) */
export function promoSrc(): PromoSrc | null {
    try {
        const raw = JSON.parse(localStorage.getItem(SRC_KEY) ?? "null");
        return raw && isPromoSrc(raw.src) && Date.now() - Number(raw.at) < SRC_TTL ? raw.src : null;
    } catch { return null; }
}

/** 단계 하나 보내기 — 같은 날 같은 출처·단계는 한 번만. src 를 안 주면 기억한 출처(없으면 보내지 않는다). */
export function promoEvent(step: PromoStep, src?: PromoSrc | null) {
    const s = src ?? promoSrc();
    if (!s) return;
    try {
        const today = kstToday();
        const sent: Record<string, string> = JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}") || {};
        const k = `${s}:${step}`;
        if (sent[k] === today) return;
        // 지난 날짜 기록은 버린다(키가 쌓이지 않게)
        for (const key of Object.keys(sent)) if (sent[key] !== today) delete sent[key];
        sent[k] = today;
        localStorage.setItem(SENT_KEY, JSON.stringify(sent));
    } catch { /* 게이트가 안 되면 그냥 보낸다 — 서버가 하루 한 행으로 막는다 */ }
    const v = visitorId();
    if (!v) return;
    void fetch("/api/promo-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ v, src: s, step }),
        keepalive: true,
    }).catch(() => { });
}

/* ── 비회원 무료 길 찾기(3번) ── */

export function guestPathUsed(): number {
    try { return Math.max(0, Number(localStorage.getItem(GUEST_PATH_KEY) ?? 0) || 0); } catch { return 0; }
}
/** 한 번 썼다 — 남은 횟수를 돌려준다 */
export function bumpGuestPath(): number {
    const used = guestPathUsed() + 1;
    try { localStorage.setItem(GUEST_PATH_KEY, String(used)); } catch { /* 부가 기능 */ }
    return guestPathLeft(used);
}
export const guestPathRemaining = () => guestPathLeft(guestPathUsed());
export { GUEST_PATH_FREE };
