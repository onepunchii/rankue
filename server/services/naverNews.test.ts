import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { searchTourNews } from "./naverNews";
import { TOUR_NEWS, TOUR_NEWS_COUNT, hostOf, isTourNewsTopic, naverNewsUrl, newsAgo, newsText } from "../../shared/tourNews";

// 투어 소식(네이버 뉴스 검색). 약관(저장·캐싱·가공 금지)을 코드가 지키는지가 시험의 절반이다.
const ok = (items: any[]) => ({ ok: true, status: 200, json: async () => ({ total: items.length, items }) });
const calls = () => (globalThis.fetch as any).mock.calls;
const ITEMS = [
    { title: "<b>PBA 투어</b> 8차전 &quot;개막&quot;", originallink: "https://www.example-news.co.kr/a/1", link: "https://n.news.naver.com/mnews/article/001/0000001", description: "요약", pubDate: "Mon, 05 Oct 2026 13:00:00 +0900" },
    { title: "둘째 기사", originallink: "https://m.sports-paper.com/b/2", link: "https://m.sports-paper.com/b/2", description: "", pubDate: "bad date" },
    { title: "", originallink: "https://x.com/3", link: "https://x.com/3", pubDate: "Mon, 05 Oct 2026 12:00:00 +0900" },
    { title: "주소가 이상한 기사", originallink: "javascript:alert(1)", link: "javascript:alert(1)", pubDate: "Mon, 05 Oct 2026 11:00:00 +0900" },
];

beforeEach(() => {
    process.env.NAVER_HUB_CLIENT_ID = "id"; process.env.NAVER_HUB_CLIENT_SECRET = "secret";
    vi.stubGlobal("fetch", vi.fn(async () => ok(ITEMS)));
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.NAVER_HUB_CLIENT_ID; delete process.env.NAVER_HUB_CLIENT_SECRET; });

describe("주제표 — 실측으로 고른 검색어", () => {
    it("투어 단위만 — 선수·골프장 이름으로는 찾지 않는다", () => {
        expect(Object.keys(TOUR_NEWS).sort()).toEqual(["carom", "klpga", "kpga", "lpba", "lpga", "pba", "pga"]);
        expect(TOUR_NEWS.pba).toMatchObject({ query: "PBA 투어", sort: "date" });
        expect(TOUR_NEWS.carom.query).toBe("3쿠션 당구"); // "세계3쿠션" 최신순은 1/10 이었다
        // 국내 골프 투어는 최신순이면 한두 매체 단신이 줄을 채워 정확도순으로 받는다
        expect(TOUR_NEWS.kpga.sort).toBe("sim"); expect(TOUR_NEWS.klpga.sort).toBe("sim");
    });
    it("없는 주제·프로토타입 열쇠는 주제가 아니다", () => {
        expect(isTourNewsTopic("pba")).toBe(true);
        for (const v of ["", "PBA", "toString", "constructor", "__proto__", null, 1, "조재호"]) expect(isTourNewsTopic(v)).toBe(false);
    });
    it("'더 보기'는 같은 검색어·같은 정렬로 네이버를 연다", () => {
        expect(naverNewsUrl("pba")).toBe(`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent("PBA 투어")}&sort=1`);
        expect(naverNewsUrl("kpga")).toBe(`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent("KPGA 투어")}`);
    });
});

describe("searchTourNews", () => {
    it("주제의 검색어·정렬로 다섯 건 — 순서를 바꾸지 않고, 제목은 태그·엔티티만 글자로", async () => {
        const r = await searchTourNews("pba");
        const [url, init] = calls()[0];
        const u = new URL(String(url));
        expect(u.origin + u.pathname).toBe("https://naverapihub.apigw.ntruss.com/search/v1/news");
        expect(u.searchParams.get("query")).toBe("PBA 투어");
        expect(u.searchParams.get("display")).toBe(String(TOUR_NEWS_COUNT));
        expect(u.searchParams.get("sort")).toBe("date");
        expect(init.headers).toMatchObject({ "X-NCP-APIGW-API-KEY-ID": "id", "X-NCP-APIGW-API-KEY": "secret" });
        expect(r).toEqual({
            ok: true, query: "PBA 투어",
            items: [
                { title: 'PBA 투어 8차전 "개막"', url: "https://n.news.naver.com/mnews/article/001/0000001", source: "example-news.co.kr", at: "2026-10-05T04:00:00.000Z" },
                { title: "둘째 기사", url: "https://m.sports-paper.com/b/2", source: "sports-paper.com", at: "" },
            ],
        });
    });
    it("제목이 없거나 주소가 http(s) 가 아닌 줄은 내보내지 않는다(누르면 이상한 데로 가는 줄)", async () => {
        const r = await searchTourNews("pba");
        expect(r.ok && r.items.map((x) => x.url).some((u) => !/^https?:\/\//.test(u))).toBe(false);
        expect(r.ok && r.items).toHaveLength(2);
    });
    it("요약(description)은 내보내지 않는다 — 화면에 쓰지 않는 것은 들고 다니지 않는다", async () => {
        const r = await searchTourNews("pba");
        expect(r.ok && Object.keys(r.items[0])).toEqual(["title", "url", "source", "at"]);
    });
    it("정확도순 주제는 sim 으로", async () => {
        await searchTourNews("klpga");
        expect(new URL(String(calls()[0][0])).searchParams.get("sort")).toBe("sim");
    });
    it("키 없음·한도 초과·오류는 이유로 돌려준다(던지지 않는다)", async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
        expect(await searchTourNews("pba")).toEqual({ ok: false, reason: "quota" });
        (globalThis.fetch as any).mockRejectedValueOnce(new Error("timeout"));
        expect(await searchTourNews("pba")).toEqual({ ok: false, reason: "error" });
        (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
        expect(await searchTourNews("pba")).toEqual({ ok: false, reason: "error" });
        delete process.env.NAVER_HUB_CLIENT_ID;
        (globalThis.fetch as any).mockClear();
        expect(await searchTourNews("pba")).toEqual({ ok: false, reason: "nokey" });
        expect(calls()).toHaveLength(0);
    });
});

describe("글자·시각", () => {
    it("newsText · hostOf", () => {
        expect(newsText("<b>A</b>&amp;B&nbsp;&lt;C&gt; &#39;D&#39;")).toBe("A&B <C> 'D'");
        expect(hostOf("https://www.mk.co.kr/news/1")).toBe("mk.co.kr");
        expect(hostOf("https://m.sports.naver.com/x")).toBe("sports.naver.com");
        expect(hostOf("not a url")).toBe("");
    });
    it("newsAgo — 방금·분·시간·어제·날짜(한국 날짜)", () => {
        const now = Date.parse("2026-10-05T04:00:00Z"); // 13:00 KST
        expect(newsAgo("2026-10-05T03:59:40Z", now)).toBe("방금");
        expect(newsAgo("2026-10-05T03:30:00Z", now)).toBe("30분 전");
        expect(newsAgo("2026-10-05T01:00:00Z", now)).toBe("3시간 전");
        expect(newsAgo("2026-10-04T03:00:00Z", now)).toBe("어제");
        expect(newsAgo("2026-10-01T16:00:00Z", now)).toBe("10/2"); // UTC 로는 1일, 한국은 2일 새벽
        expect(newsAgo("", now)).toBe("");
    });
});

describe("약관 — 저장·캐싱·가공 금지를 코드로", () => {
    const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
    it("서비스는 DB 도 메모리도 쓰지 않고, 줄을 다시 세우지 않는다", () => {
        expect(read("server/services/naverNews.ts")).not.toMatch(/from "\.\.\/db\.js"|db\.execute|new Map\(|\.sort\(|\.reverse\(/);
    });
    it("라우트는 no-store 로 답하고 주제표에 있는 것만 받는다(검색어를 손님에게서 받지 않는다)", () => {
        const route = read("server/routes/modules/tourNews.ts");
        expect(route).toContain('res.set("Cache-Control", "no-store")');
        expect(route).toContain("isTourNewsTopic(topic)");
        expect(route).not.toMatch(/req\.query/);
    });
    it("검색엔진용 화면에는 싣지 않는다", () => {
        expect(read("server/prerender.ts")).not.toMatch(/naverNews|tourNews|searchTourNews/);
    });
});
