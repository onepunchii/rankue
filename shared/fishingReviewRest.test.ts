/**
 * 낚시 탭 리뷰의 나머지(2026-10-26 오너 "응 나머지 순서도 진행"):
 *   ① 조과 적기 — 사진 칸 한 줄 · 잘 찍는 법 접기 · 어종 줄 '바다 / 민물' 이름표 · 자주 적은 어종 앞
 *   ② 낚시터 화면 둘 → 전국 낚시터 하나(옛 /fishing/points 는 낚시어선만) · 낚시터 페이지의 '조과 적기'가 그 이름으로 열린다
 *   ③ 전국 낚시터 · 바다 물때 '가까운 순'
 *   ④ 조과에 몇 시쯤 · 들물/날물 · 채비
 *   ⑤ 홈의 프로필 띠는 맨 아래 ⑥ 작은 단추의 누르는 자리 44px
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CATCH_RIG_MAX, catchMoreLine, cleanCatch, cleanCatchTime } from "./fishing";
import { fishingCatchPath } from "./fishingPlaces";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const page = read("client/src/fishing/FishingPage.tsx");
const base = { day: "2026-10-26", place: "여수 국동항", species: "감성돔", count: 1 };
const ok = (extra: Record<string, unknown>) => { const r = cleanCatch({ ...base, ...extra }, "2026-10-26"); if (!r.ok) throw new Error(r.error); return r.value; };

describe("④ 몇 시쯤 · 물 · 채비", () => {
    it("시각은 'HH:MM'만, 물은 시각이 있을 때 두 값만, 채비는 30자", () => {
        expect(["06:30", "00:00", "23:59"].map(cleanCatchTime)).toEqual(["06:30", "00:00", "23:59"]);
        expect(["24:00", "6:30", "06:60", "abc", null, undefined].map(cleanCatchTime)).toEqual([null, null, null, null, null, null]);
        expect(ok({ time: "05:40", tideFlow: "들물", rig: "  반유동   1호 " })).toMatchObject({ time: "05:40", tideFlow: "들물", rig: "반유동 1호" });
        expect(ok({ time: "", tideFlow: "들물" })).toMatchObject({ time: null, tideFlow: null });
        expect(ok({ time: "05:40", tideFlow: "정조" }).tideFlow).toBeNull();
        expect(ok({ rig: "가".repeat(40) }).rig).toHaveLength(CATCH_RIG_MAX);
        expect(ok({}).rig).toBeNull();
    });
    it("일지 한 줄 — 적은 것만, 물은 시각과 같이", () => {
        expect(catchMoreLine({ time: "05:40", tideFlow: "날물", rig: "다운샷" })).toBe("05:40쯤 · 날물 · 채비 다운샷");
        expect(catchMoreLine({ time: null, tideFlow: "날물", rig: null })).toBeNull();
        expect(catchMoreLine({ rig: "카드채비" })).toBe("채비 카드채비");
        expect(read("client/src/fishing/CatchJournal.tsx")).toContain("catchMoreLine(c)");
    });
    it("마이그레이션은 칸을 더하기만 · 서버가 셋을 넣고 읽는다", () => {
        const body = read("migrations/fishing_catches_v8.sql").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
        expect(body).toHaveLength(3);
        for (const l of body) expect(l).toMatch(/^alter table fishing_catches add column if not exists (caught_at|tide_flow|rig) text;$/);
        const routes = read("server/routes/modules/fishing.ts");
        expect(routes).toContain("tide_sea, caught_at, tide_flow, rig, lat, lng");
        expect(routes).toContain("${v.time ?? null}, ${v.tideFlow ?? null}, ${v.rig ?? null}");
        expect(routes).toContain('time: r.caught_at ?? null, tideFlow: r.tide_flow === "들물" || r.tide_flow === "날물" ? r.tide_flow : null, rig: r.rig ?? null');
    });
    it("들물 · 날물은 가까운 항구의 그날 조석으로 — 항구 조석은 오늘부터만 받으므로 오늘 적는 바다 조과만", () => {
        const sheet = page.slice(page.indexOf("function CatchSheet("));
        expect(sheet).toContain("const flowPort = fresh || day !== today ? null : placePort;");
        // 고른 곳이 항구 · 낚시터면 물때를 그 바다의 식으로(부산 근처 → 남해 · 동해)
        expect(sheet).toContain("const t = placePort ? SEA_AREAS.find((a) => a.id === fishingPort(placePort.code)?.area)?.tide : null;");
        expect(sheet).toContain("flowBrief?.day === day && flowBrief.port.code === flowPort.code");
        expect(sheet).toContain("tideFlow: flow?.flow ?? null, rig,");
        // 채비는 내 장비의 '채비 조합'에서 고른다
        expect(sheet).toContain('(gearQ.data ?? []).filter((g) => g.kind === "combo")');
    });
});

describe("① 조과 적기 — 첫 화면에 어종 · 길이가 보이게", () => {
    const sheet = page.slice(page.indexOf("function CatchSheet("));
    it("사진은 고르기 전엔 한 줄짜리 단추, 잘 찍는 법은 눌러야 펼친다", () => {
        expect(sheet).toContain('data-testid="fishing-photo-compact"');
        expect(sheet).not.toContain("aspect-[16/9]");
        expect(sheet).toContain("{!shot && tipsOpen && (");
    });
    it("어종 줄마다 '바다 / 민물' 이름표 · 자주 적은 어종이 앞", () => {
        expect(sheet).toContain('{b.id === "sea" ? "바다" : "민물"}</p>');
        expect(sheet).toContain("const order = [...b.fish].sort((x, y) => often(y.id) - often(x.id));");
    });
});

describe("② 낚시터 화면은 하나 — 전국 낚시터", () => {
    it("회원용 낚시터 목록을 걷고, 도구함 · 바다 도구함 탭은 전국 낚시터로 · 낚시어선은 따로", () => {
        expect(page).not.toContain("function Points(");
        expect(page).not.toContain("function PointsAndBoats(");
        expect(page).toContain('[FISHING_SPOTS_PATH, "전국 낚시터"');
        expect(page).toContain('[TAB_PATH.points, "낚시어선 명부"');
        // 옛 주소 /fishing/points 는 낚시어선 + 전국 낚시터로 가는 줄
        const tab = page.slice(page.indexOf('{tab === "points" && ('));
        expect(tab.indexOf('data-testid="fishing-points-to-spots"')).toBeLessThan(tab.indexOf("<Boats today={today} />"));
    });
    it("낚시터 페이지의 '조과 적기' — 그 이름을 넣고 연다(?catch=), 연 뒤 주소에서 지운다", () => {
        expect(fishingCatchPath(" 기장 대변항 방파제 ")).toBe(`/fishing?catch=${encodeURIComponent("기장 대변항 방파제")}`);
        expect(read("client/src/fishing/spots/SpotsPages.tsx")).toContain("member ? setLocation(fishingCatchPath(p.name))");
        const fx = page.slice(page.indexOf('get("catch")'));
        expect(fx.indexOf("window.history.replaceState(")).toBeLessThan(fx.indexOf('setPreset({ place: at.trim().slice(0, 40), spot: "pay" });'));
    });
    it("전국 낚시터의 글자 찾기는 대상 어종까지(옛 화면이 하던 것)", () => {
        expect(read("client/src/fishing/spots/SpotsPages.tsx")).toContain('p.species.some((f) => f.replace(/\\s+/g, "").includes(qq))');
    });
});

describe("③ 가까운 순 — 내 위치는 낚시 홈과 같은 약속", () => {
    const me = read("client/src/fishing/useFishingMe.ts");
    it("훅은 따로(공개 화면이 FishingPage 를 끌어오지 않게) · 좌표는 저장하지 않는다", () => {
        expect(me).not.toMatch(/setItem\([^)]*(lat|lng|fix|JSON)/);
        expect(me).not.toMatch(/from ["'][^"']*FishingPage/);
    });
    it("전국 낚시터 — 켜면 지도보다 먼저 가까운 세 곳, 목록도 가까운 순 + 거리", () => {
        const spots = read("client/src/fishing/spots/SpotsPages.tsx");
        expect(spots).toContain('import { kmFrom, useFishingMe } from "../useFishingMe";');
        expect(spots).toContain("if (me) listed.sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));");
        expect(spots.indexOf('data-testid="spots-near"')).toBeLessThan(spots.indexOf("<PaperMap items={shown}"));
        expect(spots).toContain("<Row p={p} km={kmText(km)} />");
    });
    it("바다 물때 — 가장 가까운 항구 카드가 해도보다 먼저, 만조 · 간조 판은 그 항구의 바다로 열고 맨 위에", () => {
        const sea = read("client/src/fishing/spots/SeaPages.tsx");
        expect(sea.indexOf("<NearPortCard loc={loc} />")).toBeLessThan(sea.indexOf('data-testid="sea-hub-map"'));
        expect(sea).toContain("useEffect(() => { if (nearArea) setArea(nearArea); }, [nearArea]);");
    });
});

describe("⑤ · ⑥ 홈의 순서 · 누르는 자리", () => {
    it("프로필 띠(성별 · 나이대)는 바다 도구함 뒤 — 홈의 맨 아래", () => {
        expect(page.indexOf('<ProfileNudge sport="FISHING" />')).toBeGreaterThan(page.indexOf('testid="fishing-tools"'));
        expect(page.indexOf('<ProfileNudge sport="FISHING" />')).toBeGreaterThan(page.indexOf('<FsSection title="내 수족관"'));
    });
    it("작은 단추는 보이는 크기 그대로, 누르는 자리만 44×44 — position 은 단추가 갖는다", () => {
        const css = read("client/src/index.css");
        const rule = css.slice(css.indexOf(".rk-hit44::after {"));
        expect(rule).toContain("width: max(100%, 44px);");
        expect(rule).toContain("height: max(100%, 44px);");
        expect(rule.slice(0, rule.indexOf("}"))).not.toMatch(/^\s*position: relative/m);
        expect(page).toContain('const chip = "relative h-9 shrink-0 rounded-full px-3 text-[13px] rk-hit44";');
        // 날짜 칩 · 특보 · 항구 · 내 위치
        for (const id of ["fishing-fishmap-day", "fishing-map-mode", "fishing-map-locate"]) {
            const at = page.indexOf(`data-testid="${id}"`);
            expect(page.slice(at, at + 400), id).toContain("rk-hit44");
        }
    });
});
