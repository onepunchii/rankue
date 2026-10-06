import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { summaryForViewer, withoutBlockedListings } from "./golfListingBlock.js";
import { listingIntents } from "../../shared/golfCourse.js";

/**
 * 2026-10-06 — 골프장 공개 페이지의 차단 반영(스토어 심사 1.2). 차단한 사람의 조인·부킹 글이 골프장 페이지 티타임 줄에는 남고
 * 눌러 들어가면 목록에 없던 것을 고쳤다. 거르는 일은 순수 함수라 표로 시험하고, 라우트가 그것을 어떻게 쓰는지는 소스로 지킨다
 * (실제 응답은 routes/modules/golfCourses.blocks.test.ts 가 가짜 DB 로 확인한다).
 *
 *  (가) 거르기: 차단 관계인 회원의 글만 빠진다. 뺄 것이 없으면 **받은 배열·객체 그대로** — 비로그인 응답이 예전과 같다는 근거.
 *  (나) 요약: 새 객체를 주고 받은 것은 고치지 않는다(공용 캐시). 숫자는 걸러진 목록에서 다시 센다.
 *  (다) 라우트: 글 주인은 서버 안에만 있고, 글이 붙은 숫자를 내보내는 길은 모두 보는 사람에게 맞춘 요약을 쓴다.
 */
const ME = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const X = "99999999-9999-4999-8999-999999999999";

type L = { id: string; slug: string; listingType: "JOIN" | "BOOKING"; datetime: string };
const far = new Date(Date.now() + 3 * 86_400_000).toISOString();
const listings: L[] = [
    { id: "l-b-join", slug: "namseoul", listingType: "JOIN", datetime: far },
    { id: "l-c-book", slug: "namseoul", listingType: "BOOKING", datetime: far },
    { id: "l-b-book", slug: "pine", listingType: "BOOKING", datetime: far },
    { id: "l-legacy", slug: "namseoul", listingType: "BOOKING", datetime: far }, // owner_id 가 빈 옛 글
    { id: "l-mine", slug: "pine", listingType: "JOIN", datetime: far },
];
const ownerOf = new Map<string, string>([["l-b-join", B], ["l-c-book", C], ["l-b-book", B], ["l-mine", ME]]);
const ids = (ls: { id: string }[]) => ls.map((l) => l.id);

describe("(가) withoutBlockedListings — 차단 관계인 회원의 글만 뺀다", () => {
    const same: [string, ReadonlySet<string> | null | undefined, ReadonlyMap<string, string>][] = [
        ["비로그인(null)", null, ownerOf],
        ["값 없음(undefined)", undefined, ownerOf],
        ["차단 관계가 하나도 없는 회원(빈 집합)", new Set(), ownerOf],
        ["차단은 있지만 그 사람 글이 없다", new Set([X]), ownerOf],
        ["주인을 아는 글이 한 건도 없다", new Set([B]), new Map()],
    ];
    it.each(same)("뺄 것이 없으면 받은 배열 그대로 — %s", (_name, blocked, owners) => {
        // toBe: 같은 객체다. 복사본조차 만들지 않으니 응답이 달라질 길이 없다.
        expect(withoutBlockedListings(listings, owners, blocked)).toBe(listings);
    });

    const cut: [string, string[], string[]][] = [
        ["한 사람(B)", [B], ["l-c-book", "l-legacy", "l-mine"]],
        ["두 사람(B·C)", [B, C], ["l-legacy", "l-mine"]],
        ["C 만", [C], ["l-b-join", "l-b-book", "l-legacy", "l-mine"]],
        ["대문자로 온 id 도 같은 사람이다", [B.toUpperCase()], ["l-c-book", "l-legacy", "l-mine"]],
        ["글 없는 사람이 섞여 있어도", [X, C], ["l-b-join", "l-b-book", "l-legacy", "l-mine"]],
    ];
    it.each(cut)("차단 관계 %s → 그 사람 글만 빠지고 순서는 그대로", (_name, blocked, expected) => {
        const out = withoutBlockedListings(listings, ownerOf, new Set(blocked));
        expect(ids(out)).toEqual(expected);
        expect(out).not.toBe(listings);
    });

    it("주인을 모르는 옛 글은 누구의 차단으로도 빠지지 않는다", () => {
        expect(ids(withoutBlockedListings(listings, ownerOf, new Set([B, C, ME, X])))).toEqual(["l-legacy"]);
    });

    it("받은 배열과 글 객체를 고치지 않는다 — 공용 캐시에서 꺼낸 것이다", () => {
        const before = JSON.stringify(listings);
        const out = withoutBlockedListings(listings, ownerOf, new Set([B]));
        expect(JSON.stringify(listings)).toBe(before);
        expect(listings).toHaveLength(5);
        // 남은 글은 같은 객체다(복사해 손대지 않는다) — 주인 id 같은 칸이 붙지 않는다
        expect(out[0]).toBe(listings[1]);
        expect(Object.keys(out[0]).sort()).toEqual(["datetime", "id", "listingType", "slug"]);
    });
});

describe("(나) summaryForViewer — 요약을 보는 사람에게 맞춘다", () => {
    const pages = [{ slug: "namseoul" }, { slug: "pine" }];
    const summary = { pages, listings, ownerOf, at: 1 };
    const countFor = (ls: L[], slug: string) => {
        const c = { booking: 0, join: 0, urgent: 0 };
        for (const l of ls) if (l.slug === slug) for (const i of listingIntents(l, Date.now())) c[i]++;
        return c;
    };

    it.each([["비로그인", null], ["차단 없는 회원", new Set<string>()], ["글 없는 사람만 차단", new Set([X])]] as const)(
        "%s — 받은 요약 객체 그대로(공용 캐시 그대로 나간다)", (_name, blocked) => {
            expect(summaryForViewer(summary, blocked)).toBe(summary);
        });

    it("차단 관계가 있으면 글 목록만 바꾼 새 객체 — 받은 요약은 그대로다", () => {
        const mine = summaryForViewer(summary, new Set([B]));
        expect(mine).not.toBe(summary);
        expect(ids(mine.listings)).toEqual(["l-c-book", "l-legacy", "l-mine"]);
        // 나머지는 같은 것을 가리킨다
        expect(mine.pages).toBe(pages);
        expect(mine.ownerOf).toBe(ownerOf);
        expect(mine.at).toBe(1);
        // 캐시(받은 요약)는 다섯 건 그대로 — 다음 사람은 전부 본다
        expect(summary.listings).toBe(listings);
        expect(ids(summary.listings)).toHaveLength(5);
        expect(summaryForViewer(summary, null)).toBe(summary);
    });

    it("숫자는 걸러진 목록에서 센다 — 목록과 'n건'이 어긋나지 않는다", () => {
        expect(countFor(summary.listings, "namseoul")).toEqual({ booking: 2, join: 1, urgent: 0 });
        expect(countFor(summary.listings, "pine")).toEqual({ booking: 1, join: 1, urgent: 0 });
        const mine = summaryForViewer(summary, new Set([B]));
        expect(countFor(mine.listings, "namseoul")).toEqual({ booking: 2, join: 0, urgent: 0 });
        expect(countFor(mine.listings, "pine")).toEqual({ booking: 0, join: 1, urgent: 0 });
        // 줄 수 = 숫자의 합
        for (const slug of ["namseoul", "pine"]) {
            const c = countFor(mine.listings, slug);
            expect(mine.listings.filter((l) => l.slug === slug)).toHaveLength(c.booking + c.join);
        }
    });
});

describe("(다) 라우트 — routes/modules/golfCourses.ts", () => {
    const root = (p: string) => readFileSync(resolve(__dirname, "..", "..", p), "utf8");
    /** 주석만 있는 줄을 뺀다 — 주석 속 낱말이 검사를 통과시키지 않게 */
    const code = (p: string) => root(p).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const src = code("server/routes/modules/golfCourses.ts");
    const between = (s: string, from: string, to: string) => {
        const a = s.indexOf(from); if (a < 0) throw new Error(`시작을 못 찾음: ${from}`);
        const b = s.indexOf(to, a + from.length); if (b < 0) throw new Error(`끝을 못 찾음: ${to}`);
        return s.slice(a, b);
    };
    const routeOf = (head: string) => between(src, head, "\n}));");

    it("글 주인은 요약 안의 표(ownerOf)에만 있다 — 글 객체에는 싣지 않는다", () => {
        const load = between(src, "async function loadSummary(", "function dropCache(");
        expect(load).toContain("join_headcount, join_condition, owner_id");
        expect(load).toContain("for (const b of bookings) if (b.owner_id) ownerOf.set(String(b.id), String(b.owner_id).toLowerCase());");
        // 공개 응답이 되는 글 객체의 칸 목록 — 주인이 없다
        const listing = between(load, "const l: PublicListing & { slug: string } = {", "};");
        expect(listing).not.toMatch(/owner/i);
        // 공개 글 타입에도 주인 칸이 없다
        expect(between(root("shared/golfCourse.ts"), "export interface PublicListing", "\n}\n")).not.toMatch(/owner/i);
        // ownerOf 를 쓰는 곳: 타입 · 만들기(선언 + 채우기) · 캐시에 담기 · '주인을 아는 글이 있나'. 응답으로 가는 길은 없다.
        expect(src.split("ownerOf").length - 1).toBe(5);
        expect(src).not.toMatch(/\.\.\.(s|shared|cache)\b/);
    });

    it("공용 캐시에는 보는 사람별 결과를 넣지 않는다 — 캐시는 loadSummary 만 쓴다", () => {
        expect(src.match(/\bcache = /g)).toEqual(["cache = ", "cache = "]); // 채우기 하나, 비우기(dropCache) 하나
        expect(src).toContain("cache = { pages, bySlug, byCourseId, listings, ownerOf, top, watchers, at: Date.now() };");
        expect(src).toContain("function dropCache() { cache = null; }");
        expect(src).not.toMatch(/cache\.listings\s*=|s\.listings\s*=|shared\.listings\s*=|\.listings\.(splice|push|pop|shift|sort|reverse)\(/);
    });

    it("차단은 로그인한 사람에게만 묻는다 — 비로그인·주인 없는 요약은 질의가 없다", () => {
        const fn = between(src, "async function blockedPeersOf(", "\n}\n");
        expect(fn).toContain("if (!me || s.ownerOf.size === 0) return null;");
        // 회원용 목록·긴급 방송과 같은 양방향 읽기를 쓴다
        expect(fn).toContain("const peers = await storage.golf.blockPeerIds(me);");
        expect(fn).toContain("return peers.size ? peers : null;");
        expect(fn.indexOf("if (!me ||")).toBeLessThan(fn.indexOf("storage.golf.blockPeerIds("));
        // 다른 곳에서는 부르지 않는다
        expect(src.split("blockPeerIds(").length - 1).toBe(1);
        // 보는 사람은 서명 쿠키로만 안다(질의 문자열로는 못 준다)
        expect(src).toContain("const viewerId = (req: any): string | null => req.signedCookies?.hiq_user_id ?? null;");
        expect(src).not.toMatch(/req\.query\.(viewer|member|user)/i);
        const peers = between(code("server/storage/golf.repo.ts"), "async blockPeerIds(", "\n    }\n");
        expect(peers).toContain("or(eq(hiqBlocks.blockerId, memberId), eq(hiqBlocks.blockedId, memberId))");
    });

    it("글이 붙은 숫자를 내보내는 길은 모두 보는 사람에게 맞춘 요약을 쓴다", () => {
        const fn = between(src, "async function summaryFor(", "\n}\n");
        expect(fn).toContain("const s = await loadSummary();");
        expect(fn).toContain("return summaryForViewer(s, await blockedPeersOf(viewerId(req), s));");
        for (const head of ['router.get("/", asyncHandler(', 'router.get("/regions", asyncHandler(', 'router.get("/listings", asyncHandler(', 'router.get("/watches/mine", requireAuth']) {
            const r = routeOf(head);
            expect(r, head).toContain("const s = await summaryFor(req);");
            expect(r, head).not.toContain("loadSummary()");
        }
        // 글 목록은 자르기(limit) 전에 걸러진 것에서 고른다
        const list = routeOf('router.get("/listings", asyncHandler(');
        expect(list.indexOf("summaryFor(req)")).toBeLessThan(list.indexOf(".slice(0, limit)"));
    });

    it("골프장 한 곳: 차단은 다른 질의와 함께 읽고, 줄·그 수·가까운 곳의 수가 같은 요약에서 나온다", () => {
        const r = routeOf('router.get("/:slug", asyncHandler(');
        expect(r).toContain("const [prices, hist, rounds, mine, myTeeRows, blocked] = await Promise.all([");
        expect(r).toContain("blockedPeersOf(me, shared),");
        expect(r).toContain("const s = summaryForViewer(shared, blocked);");
        const at = r.indexOf("const s = summaryForViewer(shared, blocked);");
        // 그 뒤로는 공용 캐시(shared)를 직접 읽지 않는다
        expect(r.slice(at + 10)).not.toMatch(/\bshared\./);
        expect(r.indexOf("const listings = s.listings.filter((l) => l.slug === slug);")).toBeGreaterThan(at);
        expect(r).toContain("counts: countFor(listings, now),");
        expect(r.indexOf("listItem(s, x, now)")).toBeGreaterThan(at);
    });

    it("글과 무관한 길은 그대로 공용 캐시를 읽는다(차단 질의를 늘리지 않는다)", () => {
        for (const head of ['router.get("/by-id/:courseId"', 'router.get("/:slug/nearby"', 'router.get("/:slug/weather"', 'router.get("/:slug/photos"', 'router.put("/:slug/watch"']) {
            const r = routeOf(head);
            expect(r, head).toContain("await loadSummary()");
            expect(r, head).not.toContain("summaryFor(");
        }
        // 검색 로봇용 화면·사이트맵·카드 그림은 공용 요약을 그대로 쓴다(보는 사람이 없다)
        expect(src).toContain("export { loadSummary as loadGolfCourseSummary };");
        for (const p of ["server/prerender.ts", "server/sitemap.ts", "server/ogImage.ts"]) {
            expect(code(p), p).toContain("loadGolfCourseSummary()");
            expect(code(p), p).not.toMatch(/summaryForViewer|blockPeerIds/);
        }
    });
});
