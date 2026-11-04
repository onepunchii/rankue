import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// page() 는 받은 조각을 JSON 으로, entry() 는 옵션 그대로 — 모양만 본다(DB · 프리렌더 전체를 끌고 오지 않게. seo/golfStamps.test.ts 와 같은 방식).
vi.mock("../prerender.js", () => ({
    page: (p: unknown) => JSON.stringify(p),
    esc: (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string)),
}));
vi.mock("../sitemap.js", () => ({ entry: (loc: string, opts?: object) => JSON.stringify({ loc, ...opts }) }));

import { FISHING_SEA_RE, fishingSeaSitemapParts, renderFishingSea, type FishingSeaDeps } from "./fishingSea";
import { FISHING_PORTS } from "../../shared/fishingStations";
import { SEA_AREAS } from "../../shared/fishingSea";
import { fishingPortPath, fishingSeaAreaPath, fishingSeaCardInput, portByName, portsOf, seaAreaSeo, portSeo } from "../../shared/fishingSeaPages";
import type { PublicPlace } from "../../shared/fishingPlaces";

/**
 * 바다 · 항구 물때 공개 페이지(2026-10-18) — 낚시터 1,151곳 다음 갈래. '인천 물때' · '서해중부 해상예보'로 들어오는 사람에게
 * 로그인 없이 같은 공공 자료를 보여 준다. 받지 못한 칸은 적지 않는다(지어 넣지 않는다) — 특보 · 조석이 없어도 항구 목록은 나간다.
 */
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const none: FishingSeaDeps = { sea: async () => null, fcst: async () => null, port: async () => null, places: async () => [] };
const html = (r: { html: string } | null) => (r ? (JSON.parse(r.html) as { title: string; body: string; canonical: string; image?: { url: string } }) : null);
const place = (o: Partial<PublicPlace>): PublicPlace => ({ id: "202234500001000003", name: "선녀바위낚시터", kind: "바다", sido: "인천광역시", sigungu: "중구", address: null, lat: 37.45, lng: 126.6, species: ["우럭"], fee: null, tel: null, dataDate: null, ...o });

describe("바다 · 항구 물때 공개 페이지", () => {
    it("항구 이름은 겹치지 않고 해역마다 하나 이상 — 주소가 이름이라 겹치면 한쪽이 사라진다", () => {
        expect(new Set(FISHING_PORTS.map((p) => p.name)).size).toBe(FISHING_PORTS.length);
        for (const a of SEA_AREAS) expect(portsOf(a.id).length).toBeGreaterThan(0);
        for (const p of FISHING_PORTS) expect(SEA_AREAS.some((a) => a.id === p.area)).toBe(true);
        expect(portByName("인천".normalize("NFD"))?.name).toBe("인천");
        expect(portByName("없는항")).toBeNull();
    });
    it("주소 모양 — 봇 라우트(vercel.json) · 프리렌더 · 앱 라우트가 같은 길", () => {
        for (const p of ["/fishing/sea", "/fishing/sea/west-mid", "/fishing/port/%EC%9D%B8%EC%B2%9C", "/fishing/port/인천/"]) expect(FISHING_SEA_RE.test(p)).toBe(true);
        for (const p of ["/fishing/seas", "/fishing/port", "/fishing/sea/a/b"]) expect(FISHING_SEA_RE.test(p)).toBe(false);
        expect(read("vercel.json")).toContain("|spot/[^/]+|sea(?:/[^/]+)?|port/[^/]+|");
        expect(read("server/prerender.ts")).toContain("app.get(FISHING_SEA_RE, async (req, res, next) => {");
        const app = read("client/src/App.tsx");
        expect(app).toContain('<Route path="/fishing/sea">');
        expect(app).toContain('<Route path="/fishing/sea/:area">');
        expect(app).toContain('<Route path="/fishing/port/:name">');
        // 앱의 공개 길 셋 — 로그인 없이(화면이 쓰는 자료가 막혀 있으면 공개 화면이 빈 판이 된다)
        const r = read("server/routes/modules/fishing.ts");
        expect(r).toContain('router.get("/sea", asyncHandler(');
        expect(r).toContain('router.get("/sea/forecast/:area", asyncHandler(');
        expect(r).toContain('router.get("/ports/:code", asyncHandler(');
        // 화면의 공유 그림도 검색용 화면과 같은 카드 · 항구 화면에는 '여기' 해도
        const sea = read("client/src/fishing/spots/SeaPages.tsx");
        expect(sea).not.toContain("og.png");
        expect(sea).toContain('data-testid="port-map"');
        // 허브의 '오늘 만조 · 간조' — 주요 항구 스물네 곳 한 번에(공개 · CDN 10분), 받아 둔 조석을 먼저 읽는다
        expect(r).toContain('router.get("/sea/turns", asyncHandler(');
        const svc = read("server/services/fishingPort.ts");
        expect(svc).toContain("export async function getMainPortTurns(");
        expect(svc).toContain("const mains = FISHING_PORTS.filter((p) => p.main);");
        // 2026-10-26: 내 위치를 켰으면 가장 가까운 항구의 바다를 열고 그 항구를 맨 위에
        expect(sea).toContain("<PortTurnsBoard near={near} />");
        // 항구 번호는 우리 표에 있는 것만 바깥 자료로 간다
        expect(r).toContain("FISHING_PORTS.some((p) => p.code === code)");
    });
    it("자료를 하나도 못 받아도 허브 · 해역 · 항구는 나간다 — 받지 못한 칸은 없다", async () => {
        const hub = html(await renderFishingSea("/fishing/sea", none));
        expect(hub?.title).toContain("항구 물때표 51곳");
        for (const p of FISHING_PORTS) expect(hub?.body).toContain(`href="${fishingPortPath(p.name)}"`);
        const area = html(await renderFishingSea("/fishing/sea/west-mid", none));
        expect(area?.title).toBe(seaAreaSeo(SEA_AREAS[0]).title);
        expect(area?.body).not.toContain("<h2>지금 특보</h2>");
        expect(area?.body).not.toContain("<h2>반나절 해상예보</h2>");
        const port = html(await renderFishingSea(fishingPortPath("인천"), none, Date.parse("2026-10-18T03:00:00Z")));
        expect(port?.title).toBe(portSeo(portByName("인천")!).title);
        expect(port?.body).not.toContain("<li>만조");
        expect(port?.body).toContain("2026-10-18 인천 물때");
        expect(port?.image?.url).toContain("/og/fishing-sea/%EC%9D%B8%EC%B2%9C.png");
        expect(await renderFishingSea("/fishing/sea/nowhere", none)).toBeNull();
        expect(await renderFishingSea("/fishing/port/%E0%A4%A", none)).toBeNull();
    });
    it("받은 값은 그대로 — 만조 · 간조 · 해 뜸 · 수온 · 바다 낚시터는 가장 가까운 항구로 묶는다", async () => {
        const deps: FishingSeaDeps = {
            ...none,
            port: async (code) => ({ port: { code, name: "인천", area: "west-mid" }, day: "2026-10-18", days: ["2026-10-18"], points: [], turns: [{ min: 312, cm: 812, kind: "high" }, { min: 690, cm: 101, kind: "low" }], sun: { rise: 393, set: 1066, moonrise: null, moonset: null, dawn: null, dusk: null, at: "인천" }, now: { wtemp: 17.24, atemp: null, buoy: null, fog: null }, index: null }),
            places: async () => [place({}), place({ id: "202234500001000004", name: "저수지", kind: "저수지" })],
        };
        const port = html(await renderFishingSea(fishingPortPath("인천"), deps));
        expect(port?.body).toContain("만조 05:12 · 812cm");
        expect(port?.body).toContain("간조 11:30 · 101cm");
        expect(port?.body).toContain("물높이 차 711cm");
        expect(port?.body).toContain("해 뜸 06:33 · 해 짐 17:46");
        expect(port?.body).toContain("지금 수온 17.2°");
        expect(port?.body).toContain("선녀바위낚시터");
        expect(port?.body).not.toContain(">저수지<");
    });
    it("허브에는 앞으로 4주 물때표(서해 7물때 · 남해 동해 제주 8물때) — 음력으로 센 것, 바깥 자료 없이", async () => {
        const hub = html(await renderFishingSea("/fishing/sea", none, Date.parse("2026-10-18T03:00:00Z")));
        expect(hub?.body).toContain("<h2>서해 물때표 — 앞으로 4주(7물때)</h2>");
        expect(hub?.body).toContain("<h2>남해 · 동해 · 제주 물때표 — 앞으로 4주(8물때)</h2>");
        expect(hub?.body).toContain("<li>10월 18일(일) ");
        expect((hub?.body.match(/<li>\d+월 \d+일\(/g) ?? []).length).toBe(56);
        const page = read("client/src/fishing/spots/SeaPages.tsx");
        expect(page).toContain("<TideCalendar />");
        expect(page).toContain('<TideCalendar sea={area?.tide ?? "south"} />');
    });
    it("사이트맵 — 허브 · 해역 일곱 · 항구 51, 모두 카드 그림", () => {
        const parts = fishingSeaSitemapParts("2026-10-18").map((x) => JSON.parse(x) as { loc: string; image: string });
        expect(parts.length).toBe(1 + SEA_AREAS.length + FISHING_PORTS.length);
        expect(parts.every((x) => x.image.includes("/og/fishing-sea/"))).toBe(true);
        expect(parts.some((x) => x.loc.endsWith(fishingSeaAreaPath("jeju")))).toBe(true);
        expect(read("server/sitemap.ts")).toContain("...fishingSeaSitemapParts(");
    });
    it("카드는 우리 표에 있는 key 만 — 그날의 값은 싣지 않는다(메신저가 오래 기억한다)", () => {
        expect(fishingSeaCardInput("all")?.badge).toBe("오늘의 바다");
        expect(fishingSeaCardInput("jeju")?.cover).toBe("sea-jeju");
        expect(fishingSeaCardInput("인천")?.name).toBe("인천 물때");
        expect(fishingSeaCardInput("../etc")).toBeNull();
        for (const a of SEA_AREAS) expect(readFileSync(resolve(root, `server/assets/fishing/sea-${a.id}.png`)).length).toBeLessThan(250_000);
        expect(JSON.stringify(fishingSeaCardInput("인천"))).not.toMatch(/\d{1,2}:\d{2}|cm|°/);
    });
});

describe("물때 지점(2026-11-04) — 포구 · 섬의 이레 물때표", () => {
    const tp = { code: "SO_0326", name: "미조항", lat: 34.70638, lng: 128.04861, area: "south-east", port: { code: FISHING_PORTS.find((p) => p.area === "south-east")!.code, name: FISHING_PORTS.find((p) => p.area === "south-east")!.name, km: 30 } };
    const days = [{ day: "2026-11-04", turns: [{ min: 326, cm: 205, kind: "high" as const }, { min: 671, cm: 87, kind: "low" as const }] }, { day: "2026-11-05", turns: [] }];
    const deps: FishingSeaDeps = { ...none, tidePoints: () => [tp], tide: async () => ({ point: tp, days, near: [{ name: "상주", km: 6.2 }], spots: [{ id: "202234500001000003", name: "미조방파제", km: 1.2, species: ["감성돔"] }] }) };
    it("주소 — 봇 라우트 · 프리렌더가 같은 길", () => {
        for (const p of ["/fishing/tide/%EB%AF%B8%EC%A1%B0%ED%95%AD", "/fishing/tide/미조항/"]) expect(FISHING_SEA_RE.test(p)).toBe(true);
        expect(read("vercel.json")).toContain("|port/[^/]+|tide/[^/]+|");
    });
    it("이레의 만조 · 간조(받은 날만) · 물때 이름 · 가까운 항구 · 이웃 지점 · 낚시터, tag 는 ASCII", async () => {
        const r = await renderFishingSea("/fishing/tide/%EB%AF%B8%EC%A1%B0%ED%95%AD", deps, Date.parse("2026-11-04T03:00:00Z"));
        expect(r!.tag).toBe("fishing:tide:SO_0326");
        expect(r!.tag).toMatch(/^[\x20-\x7e]+$/);
        const h = html(r)!;
        expect(h.title).toBe("미조항 물때표 — 오늘 만조 · 간조 시각 · 이레 물때 · 남해동부 | 랭큐 낚시");
        expect(h.canonical).toBe("https://www.rankue.co.kr/fishing/tide/%EB%AF%B8%EC%A1%B0%ED%95%AD");
        expect(h.body).toContain("만조 05:26 205cm · 간조 11:11 87cm");
        expect(h.body).toContain(`href="${fishingPortPath(tp.port.name)}"`);
        expect(h.body).toContain('href="/fishing/tide/%EC%83%81%EC%A3%BC"');
        expect(h.body).toContain('href="/fishing/spot/202234500001000003"');
        // 받지 못한 날은 시각을 적지 않는다(지어 넣지 않는다)
        expect(h.body).toMatch(/11월 5일\([^)]+\)[^<—]*<\/li>/);
        expect(await renderFishingSea("/fishing/tide/없는곳", deps)).toBeNull();
    });
    it("해역 화면은 그 바다의 지점을, 항구 화면은 가까운 지점을 잇는다 · 사이트맵에 지점", async () => {
        const a = html(await renderFishingSea(`/fishing/sea/south-east`, deps))!;
        expect(a.body).toContain("남해동부의 포구 · 섬 물때표");
        expect(a.body).toContain('href="/fishing/tide/%EB%AF%B8%EC%A1%B0%ED%95%AD"');
        const near = FISHING_PORTS.filter((p) => p.area === "south-east").sort((x, y) => Math.hypot(x.lat - tp.lat, x.lng - tp.lng) - Math.hypot(y.lat - tp.lat, y.lng - tp.lng))[0];
        const pt = html(await renderFishingSea(fishingPortPath(near.name), deps))!;
        expect(pt.body).toContain("가까운 포구 · 섬 물때");
        expect(fishingSeaSitemapParts("2026-11-04", [tp]).some((x) => x.includes("/fishing/tide/%EB%AF%B8%EC%A1%B0%ED%95%AD"))).toBe(true);
    });
});
