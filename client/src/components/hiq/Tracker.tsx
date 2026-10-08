import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { TRAIL_BATCH_MAX, TRAIL_IN_APP, TRAIL_NO_CLICK_PATH, TRAIL_SKIP_PATH, trailFirstLine, trailHref, trailLabel, trailPath } from "@shared/uiTrail";
import { isNativeApp } from "@/lib/nativeBridge";
import { TRAIL_EVENT } from "@/lib/trail";

/**
 * 발자국 수집 — 어느 화면을 봤고 무엇을 눌렀는지(관리자 콘솔 '방문자 발자국'의 바탕). 서버: POST /api/ui-event/batch
 * (2026-10-08 오너: "[폴리] 어드민 보면 방문자 발자국 만들어 놓은 것처럼 우리 랭큐도 접목해 줘")
 *
 * 방문 비콘(VisitBeacon)은 "그날 왔다"만 센다. 가입하지 않은 사람이 **어디로 가고 어디서 나가는지**는 여기서 모은다.
 * 무엇을 남기고 무엇을 남기지 않는지는 shared/uiTrail 머리말 — 숫자뿐인 글자(PIN·점수), 채팅·경기 중 화면의 누름,
 * 네이버 결과의 글자, 입력칸에 친 글, 쿼리스트링은 남기지 않는다.
 *
 * 비용: 화면마다 서버를 두드리지 않는다. 모아 뒀다가 20초마다 또는 화면을 떠날 때 **한 번에** 보낸다.
 * 봇: 첫 조작(스크롤·터치·키) 또는 5초 체류 전에는 아무것도 보내지 않는다(위장 크롤러는 그 문턱을 못 넘는다).
 * 끄는 곳: 관리자·사장님 콘솔, 개발 서버(localhost — 운영 DB 를 같이 쓴다), 앱 안(TRAIL_IN_APP — 스토어 개인정보 표기를 고친 뒤 켠다).
 */
const ID_KEY = "rankue-visitor";      // VisitBeacon 과 같은 방문자 ID
const SID_KEY = "rankue-session";     // 탭을 닫으면 끝나는 방문 한 번
const FLUSH_MS = 20_000;
const DWELL_MS = 5000;
const ENDPOINT = "/api/ui-event/batch";
/** 로컬 화면 하니스에서만 — 이 값을 "1"로 두면 localhost 에서도 모은다(하니스는 /api 를 가짜로 답한다. 진짜 개발 서버에서는 쓰지 말 것) */
const TEST_KEY = "rankue-trail-test";
const CLICKABLE = "a, button, [role=button], [role=tab], [role=radio], [role=menuitem], summary";

type Ev = { n: "page" | "click" | "scroll" | "open"; p: string; m?: Record<string, unknown>; t: number };

function visitorId(): string | null {
    try {
        let id = localStorage.getItem(ID_KEY);
        if (!id) { id = crypto.randomUUID(); localStorage.setItem(ID_KEY, id); }
        return id;
    } catch { return null; }   // 사생활 모드 등 — 식별 없이 보내지 않는다
}
function sessionId(): string {
    try {
        let s = sessionStorage.getItem(SID_KEY);
        if (!s) { s = Math.random().toString(36).slice(2, 10); sessionStorage.setItem(SID_KEY, s); }
        return s;
    } catch { return "x"; }
}
/** 이 기기에서는 아예 모으지 않는가 */
function off(): boolean {
    if (typeof window === "undefined") return true;
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) || /\.(localhost|test)$/.test(window.location.hostname);
    if (local) { try { if (localStorage.getItem(TEST_KEY) !== "1") return true; } catch { return true; } }
    return !TRAIL_IN_APP && isNativeApp();
}

export function Tracker() {
    const [location] = useLocation();
    const buf = useRef<Ev[]>([]);
    const human = useRef(false);
    const depth = useRef<Set<number>>(new Set());
    const first = useRef(true);
    const disabled = useRef(off());

    // 보내기 — 화면을 떠나는 순간에도 끊기지 않게 sendBeacon 을 먼저 쓴다
    const flush = useRef(() => {
        if (!human.current || buf.current.length === 0) return;
        const visitor = visitorId();
        if (!visitor) { buf.current = []; return; }
        const body = JSON.stringify({ visitor, session: sessionId(), events: buf.current.splice(0, TRAIL_BATCH_MAX) });
        try {
            if (!navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) {
                void fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => { });
            }
        } catch { /* 수집 실패는 화면에 아무 영향이 없어야 한다 */ }
    });
    const push = useRef((e: Ev) => {
        if (disabled.current || TRAIL_SKIP_PATH.test(e.p)) return;
        buf.current.push(e);
        if (buf.current.length >= TRAIL_BATCH_MAX) flush.current();
    });

    // 화면 이동 — 한 줄씩. 첫 화면에만 유입처(호스트)와 폰/PC 를 붙인다
    useEffect(() => {
        const path = trailPath(location);
        if (!path) return;
        depth.current = new Set();
        const m: Record<string, unknown> = {};
        if (first.current) {
            first.current = false;
            try { const r = document.referrer ? new URL(document.referrer) : null; if (r && r.host !== window.location.host) m.ref = r.host; } catch { /* 깨진 referrer */ }
            m.w = window.innerWidth < 768 ? "m" : "d";
        }
        push.current({ n: "page", p: path, m, t: Date.now() });
    }, [location]);

    useEffect(() => {
        if (disabled.current) return;
        const markHuman = () => { human.current = true; };
        const dwell = window.setTimeout(markHuman, DWELL_MS);

        const onClick = (ev: MouseEvent) => {
            markHuman();
            const path = window.location.pathname;
            if (TRAIL_NO_CLICK_PATH.test(path)) return;
            const el = (ev.target as Element | null)?.closest?.(CLICKABLE);
            if (!el || el.closest("[data-notrack], input, textarea, select, [contenteditable=true]")) return;
            // 구역 이름만 남기는 곳(네이버 검색 결과) — 결과의 글자·주소는 남기지 않는다
            const zone = el.closest("[data-track-as]");
            if (zone) {
                const l = trailLabel(zone.getAttribute("data-track-as"));
                if (l) push.current({ n: "click", p: path, m: { l }, t: Date.now() });
                return;
            }
            const label = trailLabel(el.getAttribute("data-track")) ?? trailLabel(el.getAttribute("aria-label")) ?? trailFirstLine((el as HTMLElement).innerText);
            if (!label) return;   // 숫자뿐인 단추(PIN·점수)·그림뿐인 단추
            const href = trailHref(el.closest("a")?.getAttribute("href"), window.location.origin);
            push.current({ n: "click", p: path, m: href ? { l: label, h: href } : { l: label }, t: Date.now() });
        };
        const onScroll = () => {
            markHuman();
            const max = document.documentElement.scrollHeight - window.innerHeight;
            if (max < 200) return;
            const pct = (window.scrollY / max) * 100;
            for (const d of [50, 90]) {
                if (pct >= d && !depth.current.has(d)) { depth.current.add(d); push.current({ n: "scroll", p: window.location.pathname, m: { d }, t: Date.now() }); }
            }
        };
        const onOpen = (ev: Event) => {
            const l = trailLabel((ev as CustomEvent<{ l?: unknown }>).detail?.l);
            if (l) push.current({ n: "open", p: window.location.pathname, m: { l }, t: Date.now() });
        };
        const onHide = () => { if (document.visibilityState === "hidden") flush.current(); };
        const onLeave = () => flush.current();

        document.addEventListener("click", onClick, true);
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("keydown", markHuman);
        window.addEventListener("touchstart", markHuman, { passive: true });
        window.addEventListener(TRAIL_EVENT, onOpen);
        document.addEventListener("visibilitychange", onHide);
        window.addEventListener("pagehide", onLeave);
        const timer = window.setInterval(() => flush.current(), FLUSH_MS);
        return () => {
            window.clearTimeout(dwell); window.clearInterval(timer);
            document.removeEventListener("click", onClick, true);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("keydown", markHuman);
            window.removeEventListener("touchstart", markHuman);
            window.removeEventListener(TRAIL_EVENT, onOpen);
            document.removeEventListener("visibilitychange", onHide);
            window.removeEventListener("pagehide", onLeave);
        };
    }, []);

    return null;
}
