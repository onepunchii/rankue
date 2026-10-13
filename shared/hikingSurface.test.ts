import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SURFACE_IDS, SURFACE_LABEL, packSurface, readSurface, surfaceIdOf, surfaceNote, surfaceShares } from "./hikingSurface";
import { HIKING_POI_KINDS, HIKING_POI_NAME, HIKING_POI_ORDER, hikingPoiKindOfGpx, signpostNote } from "./hikingPois";
import { HIKING_SUMMIT_FIXES } from "./hikingSummitFix";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("길의 종류 — 받은 구간 이름을 여덟 가지로", () => {
    it("받은 이름 열세 가지가 전부 갈 곳이 있다 · 모르는 이름은 '그 밖'", () => {
        const seen = { 오솔길: "trail", 야자수매트: "trail", 계단: "stairs", 데크로드: "stairs", 너덜길: "scree", 포장길: "paved", 암릉: "rock", 릿지: "rock", 교량: "bridge", 밧줄: "rope", 사다리: "rope", 철구조물: "rope", 기타: "etc" };
        for (const [name, id] of Object.entries(seen)) expect(surfaceIdOf(name), name).toBe(id);
        for (const v of ["", "  ", "처음 보는 길", null, undefined]) expect(surfaceIdOf(v as string)).toBe("etc");
        expect(Object.keys(SURFACE_LABEL).sort()).toEqual([...SURFACE_IDS].sort());
    });
    it("코스에 싣는 꼴 — 같은 종류는 더하고, 긴 것부터, 0.01km 아래는 뺀다", () => {
        expect(packSurface([["trail", 1.204], ["stairs", 0.3], ["trail", 0.8], ["bridge", 0.004], ["rock", 0], ["rope", NaN]])).toEqual([["trail", 2], ["stairs", 0.3]]);
        expect(packSurface([])).toBeNull();
        expect(packSurface([["etc", 0.001]])).toBeNull();
    });
    it("읽을 때 — 모르는 종류 · 이상한 수는 버린다", () => {
        expect(readSurface([["trail", 2], ["lava", 3], ["stairs", "0.5"], ["rock", -1], "x", null])).toEqual([["trail", 2], ["stairs", 0.5]]);
        for (const v of [null, undefined, {}, "[]", [], [["lava", 1]]]) expect(readSurface(v)).toBeNull();
    });
    it("막대의 몫 — 퍼센트의 합은 100, 1%에 못 미치는 것은 '그 밖'으로, '그 밖'은 맨 뒤", () => {
        const s = surfaceShares([["trail", 4.2], ["stairs", 1.9], ["rock", 0.7], ["bridge", 0.03], ["rope", 0.02], ["etc", 0.5]]);
        expect(s.map((x) => x.id)).toEqual(["trail", "stairs", "rock", "etc"]);
        expect(s.reduce((n, x) => n + x.pct, 0)).toBe(100);
        expect(s[0]).toMatchObject({ label: "흙길", km: 4.2 });
        expect(s[3].km).toBe(0.6);          // 그 밖 0.5 + 다리 0.03 + 밧줄 0.02
        for (const pair of [[[["trail", 1], ["stairs", 1], ["rock", 1]]], [[["trail", 3.33], ["paved", 3.33], ["scree", 3.34]]]] as const) expect(surfaceShares(pair[0] as never).reduce((n, x) => n + x.pct, 0)).toBe(100);
        expect(surfaceShares(null)).toEqual([]);
        expect(surfaceShares([])).toEqual([]);
    });
    it("한마디 — 바위가 먼저, 다음이 계단 · 돌길. 재촉 · 겁주는 말이 없다", () => {
        const of = (l: [string, number][]) => surfaceNote(surfaceShares(l as never));
        expect(of([["trail", 8], ["rock", 1.2], ["rope", 0.8]])).toMatch(/^바위 구간이 길어요/);
        expect(of([["trail", 7], ["stairs", 3]])).toMatch(/^계단이 많은 길이에요/);
        expect(of([["trail", 6], ["scree", 4]])).toMatch(/^돌이 많은 길이에요/);
        expect(of([["trail", 9], ["stairs", 1]])).toBeNull();
        const all = [of([["rock", 1]]), of([["stairs", 1]]), of([["scree", 1]])].join(" ");
        expect(all).not.toMatch(/빨리|서두|위험천만|목숨|기록/);
    });
});

describe("산림청 100대 명산 코스 파일의 지점 — 분류 · 이름 → 우리 종류", () => {
    it("채비에 쓰는 것은 제 종류로", () => {
        expect(hikingPoiKindOfGpx("TOILET", "화장실")).toBe("TOILET");
        expect(hikingPoiKindOfGpx("SPRING", "약수터")).toBe("WATER");
        expect(hikingPoiKindOfGpx("PARK", "공영주차장")).toBe("PARK");
        expect(hikingPoiKindOfGpx("ENTRY", "등산로 입구")).toBe("ENTRY");
        expect(hikingPoiKindOfGpx("TRANS", "버스정류장")).toBe("BUS");
        expect(hikingPoiKindOfGpx("VIEW", "조망점")).toBe("VIEW");
        expect(hikingPoiKindOfGpx("PHOTO", "포토존")).toBe("VIEW");
        expect(hikingPoiKindOfGpx("PEAK", "장인봉")).toBe("PEAK");
        expect(hikingPoiKindOfGpx("REST", "쉼터")).toBe("REST");
        expect(hikingPoiKindOfGpx("SIGN", "갈림길 10")).toBe("SIGN");
    });
    it("구조를 부를 때 쓰는 자리는 유형과 상관없이 꺼낸다 · 진짜 대피소만 대피소", () => {
        for (const c of ["INFO", "NONE", "DANGER", "SHELTER", "SIGN"]) expect(hikingPoiKindOfGpx(c, "국가지점번호"), c).toBe("GRID");
        expect(hikingPoiKindOfGpx("SHELTER", "삿갓재대피소")).toBe("SHELTER");
        expect(hikingPoiKindOfGpx("SHELTER", "목구조목")).toBe("MARK");
        expect(hikingPoiKindOfGpx("SHELTER", "산불진화장비 보관함")).toBe("MARK");
        expect(hikingPoiKindOfGpx("DANGER", "낙석주의")).toBe("DANGER");
        expect(hikingPoiKindOfGpx("DANGER", "철탑")).toBe("MARK");
        expect(hikingPoiKindOfGpx("INFO", "이정표")).toBe("MARK");
        expect(hikingPoiKindOfGpx("NONE", "현위치번호")).toBe("MARK");
    });
    it("싣지 않는 것 — 가게 이름 · 이름뿐인 경관 · 분류 없는 메모 · 표지가 아닌 안내", () => {
        for (const [c, n] of [["FOOD", "식당"], ["STORE", "편의점"], ["CAMP", "야영장"], ["SCENERY", "자연경관"], ["", "오솔길"], ["-", "웨이포인트 17"], ["INFO", "등산로 모습"], ["NONE", "흙먼지털이기"], ["TOILET", "  "]]) {
            expect(hikingPoiKindOfGpx(c, n), `${c}/${n}`).toBeNull();
        }
    });
    it("종류마다 이름이 있고, 화면의 차례에 전부 한 번씩 들어 있다(갈림길이 맨 뒤)", () => {
        expect(Object.keys(HIKING_POI_NAME).sort()).toEqual([...HIKING_POI_KINDS].sort());
        expect([...HIKING_POI_ORDER].sort()).toEqual([...HIKING_POI_KINDS].sort());
        expect(HIKING_POI_ORDER[0]).toBe("DANGER");
        expect(HIKING_POI_ORDER[HIKING_POI_ORDER.length - 1]).toBe("SIGN");
    });
    it("갈림길의 이정표 → '어디 · 어디 방향'(왼쪽 · 오른쪽은 싣지 않는다)", () => {
        expect(signpostNote(["NA", "구병산", "마을", "null"])).toBe("구병산 · 마을 방향");
        expect(signpostNote(["정상", "정상", "주차장", "약수터", "능선"])).toBe("정상 · 주차장 · 약수터 방향");
        expect(signpostNote(["NA", "null", "", undefined, null])).toBeNull();
        expect(signpostNote(["열네 글자를 넘는 아주 긴 이정표의 글"])).toBeNull();
        expect(signpostNote(["가나다라마바사아자차", "가나다라마바사아자카", "가나다라마바사아자타"])!.length).toBeLessThanOrEqual(30);
        expect(signpostNote(["구병산", "마을"])).not.toMatch(/왼쪽|오른쪽/);
    });
});

describe("고정: 코스의 차례 · 번호 · 길의 종류(소스)", () => {
    const store = code(read("server/storage/hiking.ts"));
    it("산림청 100대 명산 코스 파일의 코스가 앞에 놓이고, 번호는 놓인 차례대로 1부터(묶음의 순번을 쓰면 '코스 1'이 겹친다)", () => {
        expect(store).toContain("order by (frtrl_id like 'k100-%') desc, frtrl_id, seq`");
        expect(store).toContain("...own.map((c, i) => ({ ...c, seq: i + 1, via: null })), ...linked.map((c, i) => ({ ...c, seq: own.length + i + 1 }))");
        expect(store).toContain("surface: readSurface(c.surface)");
    });
    it("칸을 더하는 문장 · 화면과 검색용 화면이 같은 숫자를 쓴다", () => {
        expect(read("migrations/hiking_course_surface.sql")).toMatch(/^alter table hiking_courses add column if not exists surface jsonb;$/m);
        const page = read("client/src/hiking/pages/MountainPage.tsx");
        expect(page).toContain("const surface = useMemo(() => surfaceShares(c.surface), [c.surface]);");
        expect(page).toContain("aria-label={surface.map((s) => `${s.label} ${s.pct}%`).join(\", \")}");
        expect(page).toContain("{SURFACE_COPY.source}");
        expect(read("server/seo/hiking.ts")).toContain("const s = surfaceShares(c.surface);");
        // 처음에는 수가 많은 종류(갈림길 · 쉼터 · 표지)를 접어 둔다
        expect(page).toContain('const POI_QUIET: readonly HikingPoiKind[] = ["SIGN", "REST", "MARK", "GRID"];');
    });
    it("적재 — 본선(가장 긴 구간)만 · 같은 길은 다시 싣지 않는다 · 가게 이름을 싣지 않는다 · 산의 이름과 주소는 건드리지 않는다", () => {
        const imp = code(read("server/scripts/hiking-import-kfs100.ts"));
        expect(imp).toContain("sort((a, b) => b.line[b.line.length - 1][3] - a.line[a.line.length - 1][3]);");
        expect(imp).toContain("const dup = (existing.get(m.id) ?? []).find((e) => sameRoute(main.line, s.km, e.line, e.km));");
        expect(imp).toContain("const kind = hikingPoiKindOfGpx(w.category, w.name);");
        expect(imp).toContain("if (s.maxM === 0 && s.minM === 0) { flat++; return; }");
        expect(imp).toContain("const skipFolder = new Set(far.filter((x) => x.km > FOLDER_FAR_KM).map((x) => x.f));");
        expect(imp).not.toMatch(/update hiking_mountains[^`]*\b(name|slug)\s*=/);
        expect(imp).not.toMatch(/delete from/i);
        expect(imp).toContain('if (!apply) { console.log("미리 보기 — 아무것도 쓰지 않았다(--apply 로 싣는다)"); return; }');
    });
    it("청량산의 정상 — 장인봉(받은 파일의 봉우리 지점)", () => {
        const f = HIKING_SUMMIT_FIXES.find((x) => x.name === "청량산")!;
        expect(f).toMatchObject({ id: "Q5091652", lat: 36.79442, lng: 128.90884, by: "peak" });
    });
});
