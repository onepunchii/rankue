/**
 * 방문자 발자국 — 무엇을 남기고 무엇을 남기지 않는가(2026-10-08 오너: "[폴리] 어드민 보면 방문자 발자국 만들어 놓은 것처럼 우리 랭큐도 접목해 줘").
 *
 * 방문 비콘(/api/visit)은 "그날 왔다"만 센다. 여기는 가입하지 않은 사람이 **어디로 들어와 무엇을 보고 무엇을 누르고 어디서 나가는지**다.
 * 화면(client Tracker)이 모아 20초마다 한 번에 보내고(POST /api/ui-event/batch), 서버가 여기 규칙으로 한 번 더 거른 뒤 ui_events 에 넣는다.
 * 관리자 콘솔 '방문자 발자국'(/api/hiq/admin/visitors/*)이 읽는다. 60일이 지나면 지운다(하루 한 번 도는 정리 크론).
 *
 * 남기는 것: 화면 주소(쿼리 제외) · 누른 단추/링크의 글자(40자)와 이동 주소 · 스크롤 깊이(50%·90%) · 가입 창을 연 것 · 유입처(호스트만) · 폰/PC.
 * 남기지 않는 것 — 폴리 것을 그대로 옮기면 새는 것들이라 랭큐에 맞춰 막았다:
 *  · 입력칸에 친 글, 쿼리스트링, IP. 식별은 방문 비콘과 같은 난수 ID(+ 로그인했으면 회원 id) 하나뿐.
 *  · **숫자뿐인 글자** — PIN 키패드·점수판의 숫자 단추를 누른 순서가 곧 PIN·점수다. 숫자·기호만 있는 글자는 버린다(trailLabel).
 *  · **채팅·친구·경기 중 화면의 누름** — 상대 이름·메시지 미리보기가 단추 글자다. 경기 중 점수판은 한 판에 수백 번 누른다. 화면 이동만 남긴다(TRAIL_NO_CLICK_PATH).
 *  · **네이버 검색 결과의 글자** — 저장 금지(검색 API 특약). 그 구역은 data-track-as 로 구역 이름만 남긴다(주소도 버린다).
 *  · data-notrack 안의 모든 누름(PIN 창).
 *  · 관리자·사장님 콘솔(TRAIL_SKIP_PATH), 개발 서버(localhost).
 *  · **앱(iOS·Android) 안** — 스토어의 개인정보 표기(App Store 라벨·Play 데이터 보안)에 '앱 내 활동 수집'이 아직 없다. 오너가 표기를 고친 뒤 TRAIL_IN_APP 을 켠다.
 *
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙) — 이 파일은 아무것도 임포트하지 않는다.
 */

export const TRAIL_NAMES = ["page", "click", "scroll", "open"] as const;
export type TrailName = (typeof TRAIL_NAMES)[number];
const NAME_SET: ReadonlySet<string> = new Set(TRAIL_NAMES);

/** 보관 기간(일) — 지나면 지운다. 통계는 그 안에서만 본다 */
export const TRAIL_KEEP_DAYS = 60;
/** 한 묶음(요청 하나)의 최대 줄 수 */
export const TRAIL_BATCH_MAX = 60;
/** 앱 안에서도 모을 것인가 — 스토어 개인정보 표기를 고친 뒤에만 true(머리말) */
export const TRAIL_IN_APP = false;

/** 아예 모으지 않는 화면 — 관리자 콘솔·사장님 콘솔 */
export const TRAIL_SKIP_PATH = /^\/(admin|partner)(\/|$)/;
/**
 * 화면 이동만 남기고 **누른 것은 남기지 않는** 화면.
 *  chat · friends      상대 이름·메시지 미리보기가 단추 글자다
 *  game · golf/game    경기 중 점수판 — 한 판에 수백 번, 숫자 단추
 *  online-game · golf/play|minigolf|arcade|range   게임 화면
 *  register · auth · kakao-preview                 가입·로그인 절차
 */
export const TRAIL_NO_CLICK_PATH = /^\/(chat|friends|game|golf\/game|online-game|golf\/(?:play|minigolf|arcade|range)|register|auth|kakao-preview)(\/|$)/;

const LABEL_MAX = 40;
/** 숫자·기호·공백뿐인가 — PIN·점수 단추 */
const NUMERIC_ONLY = /^[\d\s.,:%+\-−–→←↑↓×*#/()]*$/;

/** 단추 글자를 남길 꼴로. 남기면 안 되는 글자(한 글자·숫자뿐)는 null */
export function trailLabel(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const s = raw.replace(/\s+/g, " ").trim().slice(0, LABEL_MAX);
    if (s.length < 2 || NUMERIC_ONLY.test(s)) return null;
    return s;
}

/**
 * 여러 줄 글자에서 이름이 될 한 줄 — 줄 전체가 링크인 목록(순위·이름·숫자…)은 글자가 길다.
 * 숫자뿐인 줄을 빼고 첫 줄(대개 이름)만 남긴다. 어디로 갔는지는 주소(h)에 있다.
 */
export function trailFirstLine(text: unknown): string | null {
    if (typeof text !== "string") return null;
    for (const line of text.split("\n")) {
        const label = trailLabel(line);
        if (label) return label;
    }
    return null;
}

/** 주소에서 쿼리·해시를 떼고 300자로. 우리 화면 주소("/…")가 아니면 null */
export function trailPath(raw: unknown): string | null {
    if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return null;
    return raw.split(/[?#]/)[0].slice(0, 300);
}

/** 누른 링크의 주소 — 안쪽 주소는 경로만, 바깥 주소는 "↗호스트"만 */
export function trailHref(raw: unknown, origin: string): string | null {
    if (typeof raw !== "string" || !raw || raw.startsWith("#") || /^(javascript|mailto|tel|sms|data|blob):/i.test(raw)) return null;
    try {
        const u = new URL(raw, origin);
        if (u.origin === origin) return u.pathname.slice(0, 200);
        return /^https?:$/.test(u.protocol) && u.host ? `↗${u.host.slice(0, 80)}` : null;
    } catch { return null; }
}

export interface TrailRow { name: TrailName; path: string; meta: Record<string, string | number> }

/**
 * 받은 한 줄을 넣어도 되는 꼴로(서버). 화면이 같은 규칙으로 이미 걸렀지만, 화면을 고쳐 보내는 사람도 있다 —
 * 서버가 한 번 더 본다. 버릴 줄은 null.
 */
export function cleanTrailEvent(e: unknown): TrailRow | null {
    if (!e || typeof e !== "object") return null;
    const r = e as { n?: unknown; p?: unknown; m?: unknown };
    const name = String(r.n ?? "");
    if (!NAME_SET.has(name)) return null;
    const path = trailPath(r.p);
    if (!path || TRAIL_SKIP_PATH.test(path)) return null;
    const src = (r.m && typeof r.m === "object" ? r.m : {}) as Record<string, unknown>;
    const meta: Record<string, string | number> = {};

    if (name === "click" || name === "open") {
        if (name === "click" && TRAIL_NO_CLICK_PATH.test(path)) return null;
        const label = trailLabel(src.l);
        if (!label) return null;
        meta.l = label;
        if (name === "click" && typeof src.h === "string") {
            // 화면이 이미 경로·호스트로 줄여 보낸다 — 쿼리가 붙어 왔으면 뗀다
            const h = src.h.startsWith("↗") ? `↗${src.h.slice(1).split(/[/?#]/)[0].slice(0, 80)}` : trailPath(src.h)?.slice(0, 200);
            if (h && h !== "↗") meta.h = h;
        }
    } else if (name === "scroll") {
        if (src.d !== 50 && src.d !== 90) return null;
        meta.d = src.d;
    } else {
        // page — 첫 화면에만 유입처·기기가 붙는다
        if (typeof src.ref === "string" && /^[A-Za-z0-9.-]{1,80}$/.test(src.ref)) meta.ref = src.ref.toLowerCase();
        if (src.w === "m" || src.w === "d") meta.w = src.w;
    }
    return { name: name as TrailName, path, meta };
}

/** 방문자 ID(브라우저 난수) — 방문 비콘과 같은 값. UUID 꼴만 받는다 */
export const isTrailVisitor = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v);

/**
 * 화면 종류로 묶기 — 골프장·선수·매장처럼 낱개가 수백 개인 주소는 앞머리만 남긴다(낱개로 세면 상위가 전부 1건이다).
 * 낱개 주소는 한 사람의 발자국에서 본다. 위에서부터 먼저 맞는 것.
 */
const KINDS: readonly [RegExp, string][] = [
    [/^\/$/, "/ (첫 화면)"],
    [/^\/dashboard$/, "/dashboard (홈)"],
    [/^\/stores\/register$/, "/stores/register"],
    [/^\/stores\/[^/]+/, "/stores/…"],
    [/^\/(store|r|join)\/[^/]+/, "/$1/…"],
    [/^\/club\/create$/, "/club/create"],
    [/^\/(club|crew)\/[^/]+/, "/$1/…"],
    [/^\/game\/result$/, "/game/result"],
    [/^\/game\/[^/]+/, "/game/…"],
    [/^\/golf\/game\/new$/, "/golf/game/new"],
    [/^\/golf\/game\/[^/]+/, "/golf/game/…"],
    [/^\/golf\/(course|membership|terms|find|booking-list)\/[^/]+/, "/golf/$1/…"],
    [/^\/golf\/(courses|booking|join|urgent)\/[^/]+/, "/golf/$1/…"],
    [/^\/billiards\/terms\/[^/]+/, "/billiards/terms/…"],
    [/^\/chat\/[^/]+/, "/chat/…"],
    [/^\/(community|briefing|player|pba-player|golfer)\/[^/]+/, "/$1/…"],
    [/^\/world-ranking\/country\/[^/]+/, "/world-ranking/country/…"],
    [/^\/tournaments\/(pba|umb)\/[^/]+/, "/tournaments/$1/…"],
];
export function pageKind(path: string | null | undefined): string {
    let p = String(path ?? "");
    try { p = decodeURIComponent(p); } catch { /* 깨진 인코딩은 그대로 */ }
    if (p.length > 1) p = p.replace(/\/+$/, "");
    for (const [re, to] of KINDS) {
        const m = p.match(re);
        if (m) return to.replace("$1", m[1] ?? "");
    }
    return p.length > 40 ? `${p.slice(0, 40)}…` : p || "/";
}
