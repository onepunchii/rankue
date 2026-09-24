/**
 * 골프 회원권 시세 매일 동기화(2026-09-24).
 *
 * TGM(티지엠파크)은 매일 20시 KST 에 GitHub Actions 로 시세 JSON 을 갱신·재배포한다. 그 판을 읽기 전용 피드
 * (TGM app/api/feed/golf-prices)로 받아 golf_membership_prices · golf_membership_price_history 에 쓴다.
 * 종목 → 골프장은 golf_course_pages.tgm_items(첫 적재 때 짝지은 결과)로 붙인다 — 이름 짝짓기를 매일 다시 하지 않는다.
 *
 * 왜 server/scripts/golf-course-pages.ts 에서 떼어 왔나: 그 스크립트는 client 의 정적 골프장 목록(525곳)과 좌표를
 * 확장자 없이 임포트하고, 파일 끝 CLI 블록에 최상위 await 가 있다. 서버리스 번들(/api/index.ts)이 그걸 끌고 들어가면
 * 크기도 늘고 경로 규칙(./x.js)도 깨진다. 서버가 쓰는 것만 여기 두고, 스크립트는 이 파일을 다시 내보낸다.
 *
 * 데이터 보호: 피드가 죽었거나 종목이 너무 적으면(MIN_FEED_ITEMS) **아무것도 쓰지 않는다** — 반쯤 빈 피드로
 * 덮어쓰면 골프장 페이지의 시세가 통째로 사라진다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";

// ── 라벨(첫 적재와 같은 규칙이어야 한다 — 바뀌면 같은 종목의 이름이 매일 바뀐다) ───────────
const PART_TOKENS = /\s*(회원제|대중제|대중|퍼블릭|public)\s*(골프장)?|\s*9홀\s*(골프장)?/gi;
const raw = (s: string) => s.toLowerCase().replace(/[\s()·.\-_,&㈜]/g, "");
export function normName(s: string): string {
    const n = raw(s.replace(PART_TOKENS, ""))
        .replace(/주식회사|삼성물산|호텔/g, "")
        .replace(/컨트리클럽|컨트리|골프앤리조트|골프리조트|골프클럽|골프장|골프앤|리조트|클럽|club|golf|resort|country|cc|gc|gc|c\.c/g, "");
    return n.length >= 2 ? n : raw(s);
}

/** 만원 → "1억5천" · "4천5백" · "990만" */
export function manText(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "";
    if (n < 1000) return `${Math.round(n)}만`;
    const eok = Math.floor(n / 10000), r = Math.round(n % 10000);
    const cheon = Math.floor(r / 1000), baek = Math.floor((r % 1000) / 100);
    return `${eok ? `${eok}억` : ""}${cheon ? `${cheon}천` : ""}${baek ? `${baek}백` : ""}` || `${n}만`;
}

/** 종목 라벨 — "H1(덕평)cc 개인" 에서 골프장명을 뺀 나머지. 없으면 "일반". */
export function itemLabel(it: { 수집명?: unknown; 골프장명?: unknown }): string {
    const full = String(it.수집명 ?? "").trim(), g = String(it.골프장명 ?? "").trim();
    let rest = full.toLowerCase().startsWith(g.toLowerCase()) ? full.slice(g.length).trim() : full;
    // "여주cc 일반" · "팔팔(88)cc 일반" · "화순(구:클럽900)cc 특별" — 앞에 붙은 다른 표기의 골프장명
    rest = rest.replace(/^\S*?cc(\([^)]*\))?\s+/i, "");
    // "골드레이크 일반" · "한성 법인" — 첫 낱말이 골프장명의 일부
    const toks = rest.split(/\s+/);
    if (toks.length > 1 && toks[0].length >= 2 && normName(g).includes(normName(toks[0]))) rest = toks.slice(1).join(" ");
    // "분15000" = 분양가 1억5천(만원 단위). 사람이 읽는 말로.
    rest = rest.replace(/분(\d+(?:\.\d+)?)(천)?(?![억\d])/g, (_m, n: string, ch?: string) => `분양 ${manText(ch ? Number(n) * 1000 : Number(n))}`);
    return rest.trim() || "일반";
}

/** "3,200" · 3200 · "3200만원" → 3200. 0 이하·이상한 값은 null. */
export const num = (v: unknown): number | null => {
    const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

// ── 피드 ──────────────────────────────────────────────────────────
export interface FeedItem { id: string; 수집명?: string; 골프장명?: string; 회원권시세?: Record<string, unknown> }
export interface Feed { generatedAt: string | null; items: FeedItem[]; history: Record<string, { d: string; p: number }[]> }
export interface PriceRow { itemId: string; slug: string; label: string; price: number; yearHigh: number | null; yearLow: number | null; change: number | null; asOf: string | null }
export interface HistoryRow { itemId: string; d: string; price: number }

/** 피드가 이보다 적으면 쓰지 않는다(지금 234종목). */
export const MIN_FEED_ITEMS = 100;
export const DEFAULT_FEED_URL = "https://www.tgmpark.com/api/feed/golf-prices";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 피드 본문 → Feed. TGM 은 jsonOk 로 `{ data: {...}, timestamp }` 를 싸서 보낸다 — 싼 것·안 싼 것 둘 다 받는다.
 * 모양이 틀리면 null(= 쓰지 않는다).
 */
export function parseFeed(body: unknown): Feed | null {
    const b: any = body && typeof body === "object" && "data" in (body as any) ? (body as any).data : body;
    if (!b || typeof b !== "object" || !Array.isArray(b.items)) return null;
    const items: FeedItem[] = b.items
        .filter((x: any) => x && (typeof x.id === "string" || typeof x.id === "number"))
        .map((x: any) => ({ id: String(x.id), 수집명: x.수집명, 골프장명: x.골프장명, 회원권시세: x.회원권시세 && typeof x.회원권시세 === "object" ? x.회원권시세 : {} }));
    const history: Feed["history"] = {};
    if (b.history && typeof b.history === "object") {
        for (const [id, pts] of Object.entries(b.history as Record<string, unknown>)) {
            if (!Array.isArray(pts)) continue;
            const clean = pts.filter((p: any) => p && typeof p.d === "string" && DAY.test(p.d) && Number(p.p) > 0)
                .map((p: any) => ({ d: p.d, p: Math.round(Number(p.p)) }))
                .sort((a, z) => a.d.localeCompare(z.d));
            if (clean.length) history[id] = clean;
        }
    }
    return { generatedAt: typeof b.generatedAt === "string" ? b.generatedAt : null, items, history };
}

/**
 * 피드 종목을 골프장(slug)에 붙인다(순수 함수).
 *  1. tgm_items 에 그 id 가 있으면 그 골프장.
 *  2. 없으면 **같은 골프장명**의 다른 종목이 붙은 골프장 — TGM 이 기존 골프장에 새 등급(무기명 등)을 올린 경우다.
 *  3. 그래도 없으면 버린다(unmatched) — 새 골프장은 적재 스크립트로 짝을 지어야 한다(이름 짝짓기는 사람이 검토한다).
 * change = 이력 마지막 두 점의 차. 기준일이 없으면 이력 마지막 날.
 */
export function pricesFromFeed(feed: Feed, slugByItem: ReadonlyMap<string, string>): { prices: PriceRow[]; history: HistoryRow[]; unmatched: string[] } {
    const slugByGroup = new Map<string, string>();
    for (const it of feed.items) {
        const s = slugByItem.get(it.id);
        if (s && it.골프장명) slugByGroup.set(String(it.골프장명), s);
    }
    const prices: PriceRow[] = []; const history: HistoryRow[] = []; const unmatched: string[] = [];
    for (const it of feed.items) {
        const slug = slugByItem.get(it.id) ?? (it.골프장명 ? slugByGroup.get(String(it.골프장명)) : undefined);
        if (!slug) { unmatched.push(`${it.id} ${it.수집명 ?? ""}`.trim()); continue; }
        const p = it.회원권시세 ?? {};
        const price = num(p.현재시세); if (!price) continue;
        const h = feed.history[it.id] ?? [];
        const last = h[h.length - 1], prev = h[h.length - 2];
        const asOf = typeof p.기준일 === "string" && DAY.test(p.기준일) ? p.기준일 : last?.d ?? null;
        prices.push({
            itemId: it.id, slug, label: itemLabel(it), price,
            yearHigh: num(p.연간최고가), yearLow: num(p.연간최저가),
            change: last && prev ? last.p - prev.p : null,
            asOf,
        });
        for (const x of h) history.push({ itemId: it.id, d: x.d, price: x.p });
    }
    return { prices, history, unmatched };
}

// ── 쓰기 ──────────────────────────────────────────────────────────
/**
 * 시세·이력 upsert — 첫 적재(스크립트)와 매일 동기화가 같이 쓴다.
 * 한 행씩 넣으면 234종목 + 수천 점이 서버리스 시간 제한에 걸린다 — jsonb_to_recordset 으로 묶어 넣는다
 * (라벨에 쉼표·따옴표가 있어 배열 리터럴은 위험하다).
 */
export async function writePrices(prices: PriceRow[] | any[], history: HistoryRow[] | any[]) {
    for (let i = 0; i < prices.length; i += 500) {
        const chunk = prices.slice(i, i + 500).map((p) => ({
            item_id: p.itemId, slug: p.slug, label: p.label, price: p.price,
            year_high: p.yearHigh ?? null, year_low: p.yearLow ?? null, change: p.change ?? null, as_of: p.asOf ?? null,
        }));
        await db.execute(sql`
            insert into golf_membership_prices (item_id, slug, label, price, year_high, year_low, change, as_of, updated_at)
            select x.item_id, x.slug, x.label, x.price, x.year_high, x.year_low, x.change, x.as_of, now()
            from jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb)
                 as x(item_id text, slug text, label text, price int, year_high int, year_low int, change int, as_of date)
            on conflict (item_id) do update set slug = excluded.slug, label = excluded.label, price = excluded.price,
                year_high = excluded.year_high, year_low = excluded.year_low, change = excluded.change,
                as_of = excluded.as_of, updated_at = now()`);
    }
    for (let i = 0; i < history.length; i += 1000) {
        const chunk = history.slice(i, i + 1000).map((h) => ({ item_id: h.itemId, d: h.d, price: h.price }));
        await db.execute(sql`
            insert into golf_membership_price_history (item_id, d, price)
            select x.item_id, x.d, x.price
            from jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) as x(item_id text, d date, price int)
            on conflict (item_id, d) do update set price = excluded.price`);
    }
}

/** golf_course_pages.tgm_items → { 종목 id → slug } (읽기만). */
export async function loadSlugByItem(): Promise<Map<string, string>> {
    const r: any = await db.execute(sql`select slug, tgm_items from golf_course_pages where cardinality(tgm_items) > 0`);
    const m = new Map<string, string>();
    for (const row of (r.rows ?? r) as any[]) for (const id of row.tgm_items ?? []) m.set(String(id), row.slug);
    return m;
}

export type SyncResult =
    | { ok: true; dryRun: boolean; generatedAt: string | null; feedItems: number; written: number; historyPoints: number; unmatched: string[] }
    | { ok: false; reason: string; feedItems?: number };

/**
 * 피드를 받아 쓴다. `body` 를 주면 fetch 하지 않는다(로컬 TGM 파일로 대조할 때). dryRun 이면 쓰지 않는다.
 */
export async function syncMembershipPrices(opts: { body?: unknown; dryRun?: boolean; url?: string; key?: string } = {}): Promise<SyncResult> {
    let body = opts.body;
    if (body === undefined) {
        const url = opts.url ?? process.env.TGM_FEED_URL ?? DEFAULT_FEED_URL;
        const key = opts.key ?? process.env.TGM_FEED_KEY;
        try {
            const res = await fetch(url, { headers: key ? { "x-feed-key": key } : {}, signal: AbortSignal.timeout(20_000) });
            if (!res.ok) return { ok: false, reason: `피드 응답 ${res.status}` };
            body = await res.json();
        } catch (e) {
            return { ok: false, reason: `피드를 못 받았어요: ${(e as Error)?.message ?? e}` };
        }
    }
    const feed = parseFeed(body);
    if (!feed) return { ok: false, reason: "피드 모양이 달라요" };
    if (feed.items.length < MIN_FEED_ITEMS) return { ok: false, reason: `종목이 ${feed.items.length}개뿐이라 쓰지 않았어요`, feedItems: feed.items.length };

    const { prices, history, unmatched } = pricesFromFeed(feed, await loadSlugByItem());
    // 짝이 거의 안 붙었으면 매핑이 깨진 것이다(tgm_items 가 비었거나 id 체계가 바뀜) — 이때도 쓰지 않는다.
    if (prices.length < MIN_FEED_ITEMS) return { ok: false, reason: `골프장에 붙은 종목이 ${prices.length}개뿐이라 쓰지 않았어요`, feedItems: feed.items.length };

    if (!opts.dryRun) await writePrices(prices, history);
    return { ok: true, dryRun: !!opts.dryRun, generatedAt: feed.generatedAt, feedItems: feed.items.length, written: prices.length, historyPoints: history.length, unmatched };
}
