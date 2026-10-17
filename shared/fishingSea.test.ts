import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SEA_AREAS, SEA_COLS, parsePre, parsePwn, seaBoard, seaHeadline, seaIssued, seaNotes, seaReadable, seaWord, splitZones } from "./fishingSea";

// 2026-10-14 01:30 발표를 그대로(공공데이터포털 getPwnStatus 의 t6 · t7)
const T6 = "o 강풍주의보 : 서해5도(백령도.대청도), 충청남도(태안, 보령도서), 전라남도(여수, 신안(흑산면제외), 흑산도.홍도, 거문도.초도, 완도여서도), 전북자치도(부안위도면, 군산옥도면(어청도 제외), 군산어청도), 인천(옹진), 울릉도.독도\r\no 풍랑주의보 : 동해중부안쪽먼바다, 동해중부바깥먼바다, 서해남부앞바다(전북북부앞바다, 전북남부앞바다, 전남북부서해앞바다, 전남중부서해앞바다), 서해남부북쪽안쪽먼바다, 서해남부북쪽바깥먼바다, 서해남부남쪽안쪽먼바다, 서해남부남쪽바깥먼바다, 서해중부앞바다(충남북부앞바다, 충남남부앞바다), 서해중부안쪽먼바다, 서해중부바깥먼바다, 남해서부서쪽먼바다, 제주도앞바다(제주도동부앞바다, 제주도서부앞바다), 제주도남쪽바깥먼바다, 제주도남동쪽안쪽먼바다, 제주도남서쪽안쪽먼바다";
const T7 = "(1) 풍랑 예비특보\r\no 10월 14일 새벽(00시~06시) : 동해중부앞바다, 서해남부앞바다(전남남부서해앞바다)\r\no 10월 14일 오전(06시~12시) : 동해남부앞바다(경북남부앞바다, 경북북부앞바다), 동해남부남쪽안쪽먼바다, 동해남부남쪽바깥먼바다, 동해남부북쪽안쪽먼바다, 동해남부북쪽바깥먼바다, 남해동부바깥먼바다";

describe("특보 글 읽기", () => {
    it("괄호 안의 쉼표로는 가르지 않는다(겹친 괄호도)", () => {
        expect(splitZones("가, 나(다, 라(마 제외), 바), 사")).toEqual([{ name: "가", parts: [] }, { name: "나", parts: ["다", "라(마 제외)", "바"] }, { name: "사", parts: [] }]);
        expect(splitZones("")).toEqual([]);
    });
    it("발효 중 — 갈래 · 세기 · 해역", () => {
        const p = parsePwn(T6);
        expect(p.map((l) => [l.kind, l.level, l.zones.length])).toEqual([["강풍", "주의보", 6], ["풍랑", "주의보", 15]]);
        expect(p[1].zones[2]).toEqual({ name: "서해남부앞바다", parts: ["전북북부앞바다", "전북남부앞바다", "전남북부서해앞바다", "전남중부서해앞바다"] });
        expect(parsePwn("o 없음\r\n\r\n")).toEqual([]);
    });
    it("줄이 꺾여 와도 한 줄로 읽는다 · 경보도 읽는다", () => {
        expect(parsePwn("o 풍랑경보 : 동해중부앞바다,\r\n 동해중부안쪽먼바다\r\no 풍랑주의보 : 제주도앞바다")).toEqual([
            { kind: "풍랑", level: "경보", zones: [{ name: "동해중부앞바다", parts: [] }, { name: "동해중부안쪽먼바다", parts: [] }] },
            { kind: "풍랑", level: "주의보", zones: [{ name: "제주도앞바다", parts: [] }] },
        ]);
    });
    it("꼴이 바뀐 글은 읽을 수 없다고 한다 — '특보 없음'으로 보이면 안 된다", () => {
        expect(seaReadable(T6)).toBe(true);
        expect(seaReadable("o 없음\r\n\r\n")).toBe(true);
        for (const bad of ["", null, "풍랑주의보가 서해남부앞바다에 발효 중입니다", "<html>오류</html>"]) expect(seaReadable(bad), String(bad)).toBe(false);
    });
    it("예비특보 — 갈래 아래의 때와 해역", () => {
        const p = parsePre(T7);
        expect(p.map((l) => [l.kind, l.when, l.zones.length])).toEqual([["풍랑", "10월 14일 새벽(00시~06시)", 2], ["풍랑", "10월 14일 오전(06시~12시)", 6]]);
        expect(parsePre("o 없음")).toEqual([]);
    });
});

describe("해역 일곱 곳의 지금", () => {
    const board = seaBoard(T6, T7);
    const of = (id: string) => board.find((a) => a.id === id)!;
    it("세 줄(서해 · 남해와 제주 · 동해)에 일곱 곳이 겹치지 않게 놓인다", () => {
        expect(board.map((a) => a.id)).toEqual(SEA_AREAS.map((a) => a.id));
        expect(new Set(SEA_AREAS.map((a) => a.id)).size).toBe(7);
        expect(SEA_COLS.map((c) => SEA_AREAS.filter((a) => a.col === c.id).length)).toEqual([2, 3, 2]);
    });
    it("앞바다에 걸렸으면 주의보(일부만이면 그 이름들), 강풍 같은 뭍의 특보는 세지 않는다", () => {
        expect(of("west-south")).toMatchObject({ state: "warn", near: { kind: "풍랑", level: "주의보", parts: ["전북북부", "전북남부", "전남북부서해", "전남중부서해"] }, far: { level: "주의보" }, pre: null });
        expect(of("west-mid").state).toBe("warn");
        expect(of("jeju").near?.parts).toEqual(["제주도동부", "제주도서부"]);
    });
    it("먼바다에만 걸렸으면 far, 예비특보만 있으면 pre, 아무것도 없으면 clear", () => {
        expect(of("south-west")).toMatchObject({ state: "far", near: null, far: { kind: "풍랑", level: "주의보" } });
        // 동해중부: 먼바다 주의보 + 앞바다 예비특보 → 먼바다가 앞선다, 예비특보는 줄로 남는다
        expect(of("east-mid")).toMatchObject({ state: "far", pre: { when: "10월 14일 새벽(00시~06시)" } });
        expect(of("east-south")).toMatchObject({ state: "pre", near: null, far: null, pre: { kind: "풍랑", when: "10월 14일 오전(06시~12시)" } });
        // 남해동부: 바깥먼바다의 예비특보뿐 — 앞바다 이야기가 아니다
        expect(of("south-east")).toMatchObject({ state: "clear", near: null, far: null, pre: null });
    });
    it("경보가 주의보를 이긴다 · 특보가 하나도 없으면 전부 clear", () => {
        const b = seaBoard("o 풍랑주의보 : 동해중부앞바다(강원북부앞바다)\r\no 풍랑경보 : 동해중부앞바다(강원남부앞바다), 제주도남쪽바깥먼바다", "o 없음");
        expect(b.find((a) => a.id === "east-mid")).toMatchObject({ state: "alert", near: { level: "경보", parts: ["강원남부"] } });
        expect(b.find((a) => a.id === "jeju")).toMatchObject({ state: "far", far: { level: "경보" } });
        expect(seaBoard("o 없음", "o 없음").every((a) => a.state === "clear")).toBe(true);
    });
    it("말 — 타일 · 한 줄 · 덧붙는 줄. '나가도 된다'는 말은 없다", () => {
        expect(board.map(seaWord)).toEqual(["풍랑주의보", "풍랑주의보", "먼바다만", "특보 없음", "풍랑주의보", "먼바다만", "예비특보"]);
        expect(seaHeadline(of("west-south"))).toBe("앞바다에 풍랑주의보(일부)");
        expect(seaNotes(of("west-south"))).toEqual(["전북북부 · 전북남부 · 전남북부서해 · 전남중부서해 앞바다", "먼바다도 풍랑주의보"]);
        expect(seaHeadline(of("south-west"))).toBe("앞바다는 특보 없음 · 먼바다 풍랑주의보");
        expect(seaHeadline(of("east-south"))).toBe("지금은 특보 없음 · 풍랑 예비특보");
        expect(seaNotes(of("east-south"))).toEqual(["10월 14일 오전(06시~12시)부터 앞바다 풍랑 예비특보"]);
        expect(seaNotes(of("east-mid"))).toEqual(["10월 14일 새벽(00시~06시)부터 앞바다 풍랑 예비특보"]);
        expect(seaHeadline(of("south-east"))).toBe("지금 풍랑특보 없음");
        expect(board.flatMap((a) => [seaWord(a), seaHeadline(a), ...seaNotes(a)]).join(" ")).not.toMatch(/나가도|좋은 날|출조 양호/);
    });
    it("발표 시각", () => {
        expect(seaIssued(202610140130)).toBe("10월 14일 01:30");
        expect(seaIssued("")).toBeNull();
    });
});

describe("지도 꼬리표 늘어놓기(2026-10-17 — 남해서부가 제주 밑에 깔리던 것)", () => {
    const B = { x0: 0, y0: 0, x1: 300, y1: 400 };
    const box = (id: string, cx: number, cy: number, rank = 2) => ({ id, cx, cy, w: 120, h: 38, rank });
    const rects = (m: Map<string, { cx: number; cy: number }>) => [...m.values()].map(({ cx, cy }) => ({ x0: cx - 60, y0: cy - 19, x1: cx + 60, y1: cy + 19 }));
    const anyOverlap = (rs: { x0: number; y0: number; x1: number; y1: number }[]) => rs.some((a, i) => rs.some((b, j) => i < j && a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0));
    it("겹치지 않게 · 틀 안에 · 멀리 튀지 않게(제주는 아래 끝에 묶여 먼저, 남해서부가 비킨다)", async () => {
        const { layoutTags } = await import("./fishingSea");
        const m = layoutTags([box("south-west", 150, 370), box("jeju", 140, 395)], B, 4);
        expect(anyOverlap(rects(m))).toBe(false);
        for (const r of rects(m)) { expect(r.x0).toBeGreaterThanOrEqual(-0.01); expect(r.y1).toBeLessThanOrEqual(400.01); }
        // 제주는 아래 끝 그대로, 남해서부는 한 칸 위쯤(멀리 위로 튀지 않는다)
        expect(m.get("jeju")!.cy).toBeCloseTo(381, 0);
        expect(Math.abs(m.get("south-west")!.cy - 381)).toBeLessThan(60);
    });
    it("센 특보가 먼저 자리를 갖는다 · 이미 그려진 글(구역 이름)은 덮지 않는다", async () => {
        const { layoutTags } = await import("./fishingSea");
        const m = layoutTags([box("a", 150, 200, 1), box("b", 150, 200, 3)], B, 4, [{ x0: 200, y0: 150, x1: 260, y1: 170 }]);
        expect(m.get("b")).toEqual({ cx: 150, cy: 200 });
        const all = [...rects(m), { x0: 200, y0: 150, x1: 260, y1: 170 }];
        expect(anyOverlap(all)).toBe(false);
    });
    it("지도가 꼬리표를 한 번에 늘어놓는다", () => {
        const src = readFileSync(resolve(__dirname, "..", "client/src/fishing/SeaChart.tsx"), "utf8");
        expect(src).toContain("const tagAt = layoutTags(tagDefs.map((t) => t.box)");
        expect(src).toContain("!underTag(v.x + 14 * u, y - 7 * u)");
    });
});

describe("낚시 홈 지도 한 장(2026-10-17 오너 '한 장으로 합치기')", () => {
    it("지점 이름(soft)은 피하되, 피하려고 멀리 튀지는 않는다 · 지도 단추(hard)는 덮지 않는다", async () => {
        const { layoutTags } = await import("./fishingSea");
        const B = { x0: 0, y0: 0, x1: 300, y1: 400 };
        const label = { x0: 140, y0: 190, x1: 180, y1: 205 };
        const btn = { x0: 250, y0: 300, x1: 300, y1: 400 };
        const m = layoutTags([{ id: "a", cx: 160, cy: 200, w: 120, h: 38, rank: 2 }, { id: "b", cx: 260, cy: 350, w: 120, h: 38, rank: 2 }], B, 4, [btn], [label]);
        const a = m.get("a")!, b = m.get("b")!;
        expect(Math.hypot(a.cx - 160, a.cy - 200)).toBeLessThan(80);
        expect(b.cx + 60 <= btn.x0 || b.cy + 19 <= btn.y0 || b.cy - 19 >= btn.y1).toBe(true);
    });
    it("홈에는 지도가 한 장 — 보기 단추(낚시지수 | 특보 · 항구), 아래 '오늘의 바다'는 지도 없이 바다 칩 + 고른 바다", () => {
        const src = readFileSync(resolve(__dirname, "..", "client/src/fishing/FishingPage.tsx"), "utf8");
        expect(src).toContain('data-testid="fishing-map-mode"');
        expect(src).toContain('data-testid="fishing-sea-areas"');
        const board = src.slice(src.indexOf("function SeaBoard("), src.indexOf("function SeaForecast("));
        expect(board).not.toContain("<SeaChart");
        expect(src.match(/<SeaChart /g)!.length).toBe(2); // 한 지도 안의 두 보기
        expect(src).toContain("const seaPicks = useSeaPicks();");
    });
});
