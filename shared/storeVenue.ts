/**
 * 테이블 QR — 이 매장에서 친 경기(2026-11-06 오너 '추천대로' 사장님 도구 ①).
 *
 * 문제: 사장님 화면의 회원 · 방문은 '그 매장 QR 로 새로 가입한 사람'과 '그 사람이 앱을 연 날'뿐이라, 이미 랭큐를 쓰는 손님은
 * 그 매장에서 쳐도 잡히지 않았다(인증 매장 3곳 모두 0명). 점수판 경기도 회원의 가입 매장(hiq_games.store_id)으로 적혔다.
 * 해법: 테이블마다 QR(/store/<매장>?table=<테이블>)을 붙인다. 손님이 찍으면 이 기기에 '지금 여기서 친다'를 몇 시간 적어 두고, 그동안 연 점수판 경기에
 * 그 매장 · 테이블을 같이 적는다(hiq_games.venue_store_id · table_no). **회원의 소속(가입 매장)은 바꾸지 않는다** — 10/7 오너 결정
 * ('단골 매장 따로 두기' 안 함)과 부딪치지 않게 '어디서 쳤나'만 더한다.
 * 그 기록으로: 사장님 대시보드 '우리 매장에서 친 경기 · 손님', 매장 페이지 '이번 달 이 매장 경기 · 지금 치는 판 · 이달의 에버 왕'.
 * QR 로 온 비회원이 가입하면 그 매장 회원이 된다(가입 매장 표시 — shared/joinStore, 10/7 결정 그대로).
 * ⚠️ 서버가 임포트하는 shared 파일 — 이 파일은 아무것도 임포트하지 않는다.
 */

/** 이 기기의 '지금 여기서 친다' 표시 */
export const VENUE_KEY = "rankue_venue";
/** 표시가 사는 시간 — 한 번 와서 치는 시간. 지나면 다음 경기에 붙지 않는다 */
export const VENUE_MAX_MS = 6 * 3600_000;
/** 테이블 번호의 끝 — 큰 구장도 이 안이다 */
export const VENUE_MAX_TABLE = 60;

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

export const venueTableOk = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= VENUE_MAX_TABLE;
export const venueSlugOk = (s: unknown): s is string => typeof s === "string" && SLUG_RE.test(s);

export interface Venue { slug: string; name: string; table: number }

export function venueRecord(v: Venue, now: number): string {
    return JSON.stringify({ slug: v.slug, name: v.name.slice(0, 40), table: v.table, at: now });
}

/** 적어 둔 것을 읽는다 — 꼴이 틀렸거나 오래됐거나 미래의 것이면 null */
export function venueRead(raw: unknown, now: number): Venue | null {
    if (typeof raw !== "string" || !raw) return null;
    try {
        const o = JSON.parse(raw) as Record<string, unknown> | null;
        if (!o || !venueSlugOk(o.slug) || !venueTableOk(o.table) || typeof o.at !== "number" || o.at > now || now - o.at > VENUE_MAX_MS) return null;
        return { slug: o.slug, name: typeof o.name === "string" ? o.name.slice(0, 40) : "", table: o.table };
    } catch {
        return null;
    }
}

/**
 * 테이블 QR 주소(경로) — 매장 QR 과 같은 /store/<slug> 에 ?table=N. 이 길은 이미 아이폰 · 안드로이드 앱이 받는 주소라
 * (apple-app-site-association · AndroidManifest 의 /store/) 앱을 깐 손님은 앱에서, 아니면 웹에서 열린다. 새 길(/t/…)을 만들면
 * 안드로이드는 앱을 새로 내야 앱에서 열린다.
 */
export const tableQrPath = (slug: string, table: number): string => `/store/${encodeURIComponent(slug)}?table=${table}`;

/** 주소의 ?table= → 테이블 번호(없거나 틀리면 null) */
export function tableFromSearch(search: string): number | null {
    const raw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("table");
    if (!raw || !/^\d{1,2}$/.test(raw)) return null;
    const n = Number(raw);
    return venueTableOk(n) ? n : null;
}

/** 경기 시작 요청에 실을 꼴 — 서버가 다시 거른다(매장이 실제로 있는 인증 매장인지) */
export function venueBody(v: Venue | null): { venue: { slug: string; table: number } } | Record<string, never> {
    return v ? { venue: { slug: v.slug, table: v.table } } : {};
}

/** 서버 — 요청의 venue 를 읽는다. 꼴이 틀리면 null(경기는 그대로 만든다, 장소만 비운다) */
export function venueFromBody(v: unknown): { slug: string; table: number } | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const table = typeof o.table === "number" ? o.table : Number(o.table);
    return venueSlugOk(o.slug) && venueTableOk(table) ? { slug: o.slug, table } : null;
}

/** 사장님이 뽑을 테이블 수 — 적어 둔 대대 + 중대, 없으면 6 */
export function tableCountOf(large: number | null | undefined, medium: number | null | undefined): number {
    const n = (Number(large) || 0) + (Number(medium) || 0);
    return Math.max(1, Math.min(VENUE_MAX_TABLE, n > 0 ? n : 6));
}

/** 이달의 에버 왕에 드는 최소 판 수 — 한두 판의 운으로 왕이 되지 않게 */
export const VENUE_KING_MIN_GAMES = 3;
