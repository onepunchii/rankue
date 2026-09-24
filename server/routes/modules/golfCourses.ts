/**
 * 골프장 페이지 API(2026-09-24) — **로그인 없이** 읽힌다. 검색으로 들어온 사람이 보는 페이지라서다.
 * (/api/hiq/golf 는 requireGolfAccess 로 막혀 있다 — 그 밑에 두면 검색 방문자에게 401 이 간다.)
 *
 *   GET    /golf-courses                    목록(+ 지금 올라온 부킹·조인·긴급 수) ?region=&city=&intent=
 *   GET    /golf-courses/regions            지역 → 시군 나무(+ 수)
 *   GET    /golf-courses/listings           공개 글 요약 ?intent=&region=&city=
 *   GET    /golf-courses/by-id/:courseId    옛 주소(/golf/course/74) → 슬러그
 *   GET    /golf-courses/watches/mine       내 관심 골프장(로그인)
 *   GET    /golf-courses/:slug              골프장 한 곳(시세·이력·글·가까운 곳·라운드)
 *   PUT    /golf-courses/:slug/watch        관심 등록·조건 바꾸기(로그인)
 *   DELETE /golf-courses/:slug/watch        관심 해제(로그인)
 *
 * 공개 글에는 연락처·글쓴이가 없다. **비공개(isBlind) 글은 아예 싣지 않는다** — 골프장 페이지에
 * 올리는 순간 가려 둔 골프장 이름이 드러난다.
 */
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db.js";
import { storage } from "../../storage/index.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { sendError, sendSuccess } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { isUrgentJoin, listingCapacity, distanceKm } from "../../../shared/golfJoin.js";
import { cityShort, listingIntents, type GolfIntent, type PublicListing } from "../../../shared/golfCourse.js";

const router = Router();

/**
 * golf_bookings.datetime 은 시간대 없는 timestamp 에 **UTC** 가 들어 있다. raw sql 은 "2026-09-27 21:34:00" 문자열로
 * 돌려주므로 Z 를 붙여 읽는다 — 그냥 new Date() 하면 서버 시간대로 읽혀 9시간이 어긋난다(이 저장소의 상습 함정).
 */
function utcIso(v: unknown): string {
    if (v instanceof Date) return v.toISOString();
    const s = String(v).trim().replace(" ", "T");
    return new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).toISOString();
}

/** 서명 쿠키가 있으면 회원 id, 없으면 null — 공개 라우트라 막지는 않는다. */
const viewerId = (req: any): string | null => req.signedCookies?.hiq_user_id ?? null;

// ── 캐시: 골프장 475곳 + 앞으로의 글. 60초면 목록 숫자가 충분히 새롭다. ─────────────
type PageRow = {
    slug: string; name: string; region: string; city: string | null; address: string | null;
    lat: number | null; lng: number | null; courseIds: number[]; clubId: string | null;
    kind: string | null; holes: number | null; parts: any; courses: any; intro: string | null;
    info: any; fees: any; tgmItems: string[]; updatedAt: string;
    logo: string | null; grass: string[]; play: string[]; phone: string | null; website: string | null;
    feeFrom: number | null; popularity: number; aliases: string[];
};
type Summary = { pages: PageRow[]; bySlug: Map<string, PageRow>; byCourseId: Map<number, PageRow>; listings: (PublicListing & { slug: string })[]; top: Map<string, { price: number; change: number | null; label: string; asOf: string | null }>; watchers: Map<string, number>; at: number };
let cache: Summary | null = null;
let inflight: Promise<Summary> | null = null;

async function loadSummary(): Promise<Summary> {
    if (cache && Date.now() - cache.at < 60_000) return cache;
    if (inflight) return inflight;
    inflight = (async () => {
        const q = async (s: any) => { const r: any = await db.execute(s); return (r.rows ?? r) as any[]; };
        const [pagesRaw, bookings, prices, watch] = await Promise.all([
            // 이름·슬러그가 빈 줄은 페이지가 될 수 없다(프리렌더·사이트맵과 같은 기준)
            q(sql`select slug, name, region, city, address, lat, lng, course_ids, club_id, kind, holes, parts, courses, intro, info, fees, tgm_items, updated_at,
                         logo, grass, play, phone, website, fee_from, popularity, aliases
                  from golf_course_pages where slug <> '' and btrim(name) <> ''`),
            // 앞으로의 글만. 비공개·가려진 글은 뺀다. course_id 는 text 라 숫자만 캐스팅한다.
            q(sql`select id, course_id, listing_type, join_type, datetime, green_fee, cost_mode, slots, options, seller_type, join_headcount, join_condition
                  from golf_bookings
                  where datetime > now() and is_blinded = false and coalesce(is_blind, false) = false and course_id ~ '^[0-9]+$'
                  order by datetime asc limit 5000`),
            q(sql`select slug, label, price, change, as_of from golf_membership_prices`),
            q(sql`select slug, count(*)::int n from golf_course_watches group by slug`),
        ]);
        const pages: PageRow[] = pagesRaw.map((r) => ({
            slug: r.slug, name: r.name, region: r.region, city: r.city, address: r.address, lat: r.lat, lng: r.lng,
            courseIds: (r.course_ids ?? []).map(Number), clubId: r.club_id, kind: r.kind, holes: r.holes, parts: r.parts,
            courses: r.courses, intro: r.intro, info: r.info, fees: r.fees, tgmItems: r.tgm_items ?? [], updatedAt: r.updated_at,
            logo: r.logo, grass: r.grass ?? [], play: r.play ?? [], phone: r.phone, website: r.website,
            feeFrom: r.fee_from, popularity: Number(r.popularity) || 0, aliases: r.aliases ?? [],
        }));
        const bySlug = new Map(pages.map((p) => [p.slug, p]));
        const byCourseId = new Map<number, PageRow>(); for (const p of pages) for (const id of p.courseIds) byCourseId.set(id, p);

        const counts = await storage.countJoinRequests(bookings.map((b) => b.id));
        const now = Date.now();
        const listings = bookings.map((b) => {
            const page = byCourseId.get(Number(b.course_id)); if (!page) return null;
            const listingType = b.listing_type === "JOIN" ? "JOIN" as const : "BOOKING" as const;
            const shape = { listingType, slots: b.slots, joinHeadcount: b.join_headcount, joinCondition: b.join_condition };
            const l: PublicListing & { slug: string } = {
                id: b.id, slug: page.slug, listingType, joinType: b.join_type, datetime: utcIso(b.datetime),
                greenFee: b.green_fee, costMode: b.cost_mode, slots: b.slots, options: b.options, sellerType: b.seller_type,
                joinApplied: counts.get(b.id)?.seats ?? 0, joinCapacity: listingCapacity(shape), isUrgent: false,
            };
            l.isUrgent = isUrgentJoin(l, now);
            return l;
        }).filter(Boolean) as (PublicListing & { slug: string })[];

        // 목록에 한 숫자만 보일 때의 대표 시세 — '일반' → '개인' → **가장 싼 것**(회원권 "얼마부터"를 보는 자리다.
        // 가장 비싼 걸 고르면 태광CC 가 무기명 40억으로 보였다 — 2026-09-24)
        const top = new Map<string, { price: number; change: number | null; label: string; asOf: string | null }>();
        const rank = (label: string) => (label === "일반" ? 0 : label === "개인" ? 1 : 2);
        for (const p of prices) {
            const cur = top.get(p.slug);
            if (!cur || rank(p.label) < rank(cur.label) || (rank(p.label) === rank(cur.label) && p.price < cur.price)) {
                top.set(p.slug, { price: p.price, change: p.change, label: p.label, asOf: p.as_of });
            }
        }
        const watchers = new Map(watch.map((w) => [w.slug, w.n]));
        cache = { pages, bySlug, byCourseId, listings, top, watchers, at: Date.now() };
        return cache;
    })().finally(() => { inflight = null; });
    return inflight;
}
/** 관심 등록·해제 뒤엔 숫자가 바로 보여야 한다. */
function dropCache() { cache = null; }
export { loadSummary as loadGolfCourseSummary };

/** "이천" · "이천시" 둘 다 받는다(주소엔 짧은 꼴이 들어간다). */
const cityMatch = (p: { city: string | null }, city?: string) => !city || p.city === city || cityShort(p.city) === city;
const intentOf = (v: unknown): GolfIntent | null => (v === "booking" || v === "join" || v === "urgent" ? v : null);
const countFor = (ls: PublicListing[], now: number) => {
    const c = { booking: 0, join: 0, urgent: 0 };
    for (const l of ls) for (const i of listingIntents(l, now)) c[i]++;
    return c;
};

function listItem(s: Summary, p: PageRow, now: number) {
    const ls = s.listings.filter((l) => l.slug === p.slug);
    const t = s.top.get(p.slug);
    return {
        slug: p.slug, name: p.name, region: p.region, city: p.city, kind: p.kind, holes: p.holes,
        lat: p.lat, lng: p.lng, hasFees: !!p.fees, hasIntro: !!p.intro,
        logo: p.logo, grass: p.grass, play: p.play, feeFrom: p.feeFrom, aliases: p.aliases,
        /** 부킹·조인 글이 붙을 수 있는가 — 정적 목록에 없는 곳(자료로만 만든 새 페이지)은 글도 관심 알림도 붙지 않는다 */
        bookable: p.courseIds.length > 0,
        price: t ? { price: t.price, change: t.change, label: t.label } : null,
        counts: countFor(ls, now),
        nextTee: ls[0]?.datetime ?? null,
        watchers: s.watchers.get(p.slug) ?? 0,
    };
}

// ── 목록 ───────────────────────────────────────────────────────────
router.get("/", asyncHandler(async (req: any, res: any) => {
    const s = await loadSummary(); const now = Date.now();
    const region = typeof req.query.region === "string" ? req.query.region : undefined;
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const intent = intentOf(req.query.intent);
    let pages = s.pages.filter((p) => (!region || p.region === region) && cityMatch(p, city));
    const items = pages.map((p) => listItem(s, p, now));
    // 기본 정렬: 지금 글이 있는 곳 먼저(의도가 있으면 그 의도 수), 그다음 시세·그린피가 있는 곳, 그다음 이름
    // 기본 정렬: 지금 글이 있는 곳 → 인기(자료의 즐겨찾기 수 — 화면엔 안 싣고 정렬에만 쓴다) → 정보가 많은 곳 → 이름
    const live = (x: ReturnType<typeof listItem>) => (intent ? x.counts[intent] : x.counts.booking + x.counts.join);
    const pop = new Map(pages.map((p) => [p.slug, p.popularity]));
    const info = (x: ReturnType<typeof listItem>) => (x.price ? 2 : 0) + (x.hasFees || x.feeFrom ? 1 : 0) + (x.logo ? 1 : 0);
    items.sort((a, b) => live(b) - live(a) || (pop.get(b.slug) ?? 0) - (pop.get(a.slug) ?? 0) || info(b) - info(a) || a.name.localeCompare(b.name, "ko"));
    return sendSuccess(res, items);
}));

router.get("/regions", asyncHandler(async (_req: any, res: any) => {
    const s = await loadSummary(); const now = Date.now();
    const tree = new Map<string, { region: string; courses: number; counts: Record<GolfIntent, number>; cities: Map<string, { city: string; short: string; courses: number; counts: Record<GolfIntent, number> }> }>();
    for (const p of s.pages) {
        if (!tree.has(p.region)) tree.set(p.region, { region: p.region, courses: 0, counts: { booking: 0, join: 0, urgent: 0 }, cities: new Map() });
        const r = tree.get(p.region)!; r.courses++;
        const c = countFor(s.listings.filter((l) => l.slug === p.slug), now);
        for (const k of ["booking", "join", "urgent"] as const) r.counts[k] += c[k];
        if (p.city) {
            if (!r.cities.has(p.city)) r.cities.set(p.city, { city: p.city, short: cityShort(p.city), courses: 0, counts: { booking: 0, join: 0, urgent: 0 } });
            const ci = r.cities.get(p.city)!; ci.courses++;
            for (const k of ["booking", "join", "urgent"] as const) ci.counts[k] += c[k];
        }
    }
    return sendSuccess(res, [...tree.values()].map((r) => ({ ...r, cities: [...r.cities.values()].sort((a, b) => b.courses - a.courses || a.short.localeCompare(b.short, "ko")) })));
}));

router.get("/listings", asyncHandler(async (req: any, res: any) => {
    const s = await loadSummary(); const now = Date.now();
    const region = typeof req.query.region === "string" ? req.query.region : undefined;
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const intent = intentOf(req.query.intent);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const out = s.listings.filter((l) => {
        const p = s.bySlug.get(l.slug)!;
        if (region && p.region !== region) return false;
        if (!cityMatch(p, city)) return false;
        if (intent && !listingIntents(l, now).includes(intent)) return false;
        return true;
    }).slice(0, limit).map((l) => ({ ...l, courseName: s.bySlug.get(l.slug)!.name, region: s.bySlug.get(l.slug)!.region, city: s.bySlug.get(l.slug)!.city }));
    return sendSuccess(res, out);
}));

router.get("/by-id/:courseId", asyncHandler(async (req: any, res: any) => {
    const s = await loadSummary();
    const p = s.byCourseId.get(Number(req.params.courseId));
    if (!p) return sendError(res, 404, "골프장을 찾을 수 없어요");
    return sendSuccess(res, { slug: p.slug });
}));

router.get("/watches/mine", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const r: any = await db.execute(sql`
        select w.slug, w.filters, w.created_at, p.name, p.region, p.city
        from golf_course_watches w join golf_course_pages p on p.slug = w.slug
        where w.member_id = ${req.userId}::uuid order by w.created_at desc`);
    const s = await loadSummary(); const now = Date.now();
    return sendSuccess(res, ((r.rows ?? r) as any[]).map((w) => ({
        slug: w.slug, name: w.name, region: w.region, city: w.city, filters: w.filters ?? {},
        counts: countFor(s.listings.filter((l) => l.slug === w.slug), now),
    })));
}));

// ── 한 곳 ──────────────────────────────────────────────────────────
router.get("/:slug", asyncHandler(async (req: any, res: any) => {
    const s = await loadSummary(); const now = Date.now();
    const slug = String(req.params.slug).normalize("NFC");
    const p = s.bySlug.get(slug);
    if (!p) return sendError(res, 404, "골프장을 찾을 수 없어요");
    const q = async (x: any) => { const r: any = await db.execute(x); return (r.rows ?? r) as any[]; };
    const me = viewerId(req);
    const [prices, hist, rounds, mine] = await Promise.all([
        q(sql`select item_id, label, price, change, year_high, year_low, as_of from golf_membership_prices where slug = ${slug} order by price desc`),
        q(sql`select h.item_id, h.d, h.price from golf_membership_price_history h
              join golf_membership_prices m on m.item_id = h.item_id
              where m.slug = ${slug} and h.d > current_date - interval '400 days' order by h.item_id, h.d`),
        p.clubId ? q(sql`select count(*)::int n from golf_match_sessions where course_id = ${p.clubId} and status = 'finished'`) : Promise.resolve([{ n: 0 }]),
        me ? q(sql`select filters from golf_course_watches where member_id = ${me}::uuid and slug = ${slug}`) : Promise.resolve([]),
    ]);
    // 이력 — 1년치 일간이면 점이 300개를 넘는다. 차트에는 120점이면 충분하다(마지막 점은 반드시 남긴다).
    const byItem = new Map<string, { d: string; p: number }[]>();
    for (const h of hist) { const k = h.item_id; if (!byItem.has(k)) byItem.set(k, []); byItem.get(k)!.push({ d: String(h.d).slice(0, 10), p: h.price }); }
    const thin = (a: { d: string; p: number }[]) => {
        if (a.length <= 120) return a;
        const step = a.length / 119; const out: typeof a = [];
        for (let i = 0; i < 119; i++) out.push(a[Math.floor(i * step)]);
        out.push(a[a.length - 1]); return out;
    };
    const listings = s.listings.filter((l) => l.slug === slug);
    const nearby = p.lat != null
        ? s.pages.filter((x) => x.slug !== slug && x.lat != null).map((x) => ({ x, km: distanceKm(p.lat!, p.lng!, x.lat!, x.lng!) }))
            .sort((a, b) => a.km - b.km).slice(0, 8).map(({ x, km }) => ({ ...listItem(s, x, now), km: Math.round(km * 10) / 10 }))
        : s.pages.filter((x) => x.slug !== slug && x.region === p.region && cityMatch(x, p.city ?? undefined)).slice(0, 8).map((x) => ({ ...listItem(s, x, now), km: null }));
    return sendSuccess(res, {
        slug: p.slug, name: p.name, region: p.region, city: p.city, address: p.address, lat: p.lat, lng: p.lng,
        kind: p.kind, holes: p.holes, parts: p.parts, courses: p.courses, intro: p.intro, info: p.info, fees: p.fees,
        courseIds: p.courseIds, updatedAt: p.updatedAt,
        logo: p.logo, grass: p.grass, play: p.play, phone: p.phone, website: p.website, feeFrom: p.feeFrom, aliases: p.aliases,
        bookable: p.courseIds.length > 0,
        prices: prices.map((m) => ({
            itemId: m.item_id, label: m.label, price: m.price, change: m.change, yearHigh: m.year_high, yearLow: m.year_low,
            asOf: m.as_of ? String(m.as_of).slice(0, 10) : null, history: thin(byItem.get(m.item_id) ?? []),
        })),
        listings,
        counts: countFor(listings, now),
        nearby,
        rounds: Number(rounds[0]?.n ?? 0),
        watchers: s.watchers.get(slug) ?? 0,
        myWatch: mine[0] ? { filters: mine[0].filters ?? {} } : null,
    });
}));

// ── 관심 ───────────────────────────────────────────────────────────
/** 조건은 아는 칸만 받는다 — 모르는 값이 쌓이면 알림 판정이 조용히 틀어진다. */
function cleanFilters(v: any) {
    const pick = <T extends string>(arr: unknown, ok: readonly T[]): T[] | undefined => {
        if (!Array.isArray(arr)) return undefined;
        const out = arr.filter((x): x is T => ok.includes(x as T)); return out.length ? [...new Set(out)] : undefined;
    };
    const f: Record<string, unknown> = {};
    const days = pick(v?.days, ["weekday", "weekend"] as const); if (days) f.days = days;
    const parts = pick(v?.parts, ["1", "2", "3"] as const); if (parts) f.parts = parts;
    const kinds = pick(v?.kinds, ["booking", "join", "urgent"] as const); if (kinds) f.kinds = kinds;
    const maxFee = Math.floor(Number(v?.maxFee)); if (maxFee >= 10000 && maxFee <= 2_000_000) f.maxFee = maxFee;
    const minSeats = Math.floor(Number(v?.minSeats)); if (minSeats >= 1 && minSeats <= 4) f.minSeats = minSeats;
    return f;
}
router.put("/:slug/watch", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const slug = String(req.params.slug).normalize("NFC");
    const s = await loadSummary();
    const page = s.bySlug.get(slug);
    if (!page) return sendError(res, 404, "골프장을 찾을 수 없어요");
    // 글이 붙을 수 없는 골프장(자료로만 만든 새 페이지 — course_ids 가 비어 있다)은 알림이 절대 오지 않는다. 약속하지 않는다.
    if (!page.courseIds.length) return sendError(res, 400, "이 골프장은 아직 티타임이 올라오지 않아요", "NOT_BOOKABLE");
    // 한 사람이 수백 곳을 찍어 알림 폭탄을 만들지 못하게 — 실제로 쓰는 건 많아야 스무 곳이다.
    const r: any = await db.execute(sql`select count(*)::int n from golf_course_watches where member_id = ${req.userId}::uuid and slug <> ${slug}`);
    if (Number((r.rows ?? r)[0]?.n ?? 0) >= 50) return sendError(res, 400, "관심 골프장은 50곳까지예요", "WATCH_LIMIT");
    const filters = cleanFilters(req.body?.filters);
    await db.execute(sql`
        insert into golf_course_watches (member_id, slug, filters) values (${req.userId}::uuid, ${slug}, ${JSON.stringify(filters)}::jsonb)
        on conflict (member_id, slug) do update set filters = excluded.filters`);
    dropCache();
    return sendSuccess(res, { slug, filters });
}));
router.delete("/:slug/watch", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const slug = String(req.params.slug).normalize("NFC");
    await db.execute(sql`delete from golf_course_watches where member_id = ${req.userId}::uuid and slug = ${slug}`);
    dropCache();
    return sendSuccess(res, { slug, watching: false });
}));

export default router;
