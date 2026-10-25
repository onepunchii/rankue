/**
 * 카카오 지도(2026-10-25 — 유료 0.1원/건). 비용은 사고가 만든다 — 그 길목을 고정한다:
 * 눌렀을 때만 · 한 화면에 한 번만 만들기 · 만들기 전에 기기 · 서버 상한 · 못 띄우면 종이 지도.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KAKAO_MAP_DAILY_CAP_DEFAULT, KAKAO_MAP_DEVICE_DAILY, deviceAllows, kakaoMapCap, kstDay } from "./kakaoMap";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("숫자", () => {
    it("하루 상한 — 비었거나 이상하면 기본값, 0 이하는 0(막힘)", () => {
        expect(kakaoMapCap(undefined)).toBe(KAKAO_MAP_DAILY_CAP_DEFAULT);
        expect(kakaoMapCap("")).toBe(KAKAO_MAP_DAILY_CAP_DEFAULT);
        expect(kakaoMapCap("abc")).toBe(KAKAO_MAP_DAILY_CAP_DEFAULT);
        expect(kakaoMapCap("500")).toBe(500);
        expect(kakaoMapCap("0")).toBe(0);
        expect(kakaoMapCap("-3")).toBe(0);
        // 기본 상한의 하루 최대 비용은 300원
        expect(KAKAO_MAP_DAILY_CAP_DEFAULT * 0.1).toBe(300);
    });
    it("한국 날짜 — UTC 15시가 넘으면 다음 날", () => {
        expect(kstDay(new Date("2026-10-25T14:59:00Z"))).toBe("2026-10-25");
        expect(kstDay(new Date("2026-10-25T15:00:00Z"))).toBe("2026-10-26");
    });
    it("기기 하루 상한 — 같은 날만 세고, 날이 바뀌거나 깨진 값이면 0 부터", () => {
        let stored: string | null = null;
        for (let i = 0; i < KAKAO_MAP_DEVICE_DAILY; i++) {
            const r = deviceAllows(stored, "2026-10-25");
            expect(r.ok).toBe(true);
            stored = r.next;
        }
        expect(deviceAllows(stored, "2026-10-25").ok).toBe(false);
        expect(deviceAllows(stored, "2026-10-26").ok).toBe(true);
        expect(deviceAllows("{broken", "2026-10-25").ok).toBe(true);
    });
});

describe("화면 — 실제 지도(KakaoCourseMap)", () => {
    const src = code(read("client/src/hiking/components/KakaoCourseMap.tsx"));
    it("지도는 한 번만 만든다 — 만드는 곳이 하나, 깃발로 막고, 이미 있으면 다시 만들지 않는다", () => {
        expect(src.match(/new kakao\.maps\.Map\(/g)).toHaveLength(1);
        expect(src).toContain("if (started.current) return;");
        expect(src).toContain("started.current = true;");
        expect(src).toContain("if (!mounted.current || !box.current || map.current) return;");
        // 만드는 effect 는 처음 한 번만(빈 의존)
        const make = src.slice(src.indexOf("if (started.current) return;"), src.indexOf("new kakao.maps.Map("));
        expect(src.slice(src.indexOf("new kakao.maps.Map("), src.indexOf("new kakao.maps.Map(") + 600)).toContain("}, []);");
        // 만들기 전에 기기 · 서버 상한을 묻고, 그다음에 SDK 를 받는다
        expect(make.indexOf("await askToOpen()")).toBeGreaterThan(-1);
        expect(make.indexOf("await askToOpen()")).toBeLessThan(make.indexOf("await loadSdk()"));
    });
    it("상한 — 기기 먼저, 서버(POST /hiking/map-load)가 허락한 뒤에만 기기 수를 올린다", () => {
        const ask = src.slice(src.indexOf("async function askToOpen("), src.indexOf("function tag("));
        expect(ask.indexOf("deviceAllows(")).toBeLessThan(ask.indexOf("apiRequest(KAKAO_MAP_LOAD_API"));
        expect(ask.indexOf("apiRequest(KAKAO_MAP_LOAD_API")).toBeLessThan(ask.indexOf("localStorage.setItem(DEVICE_KEY"));
    });
    it("코스를 바꾸면 얹은 것만 갈아 끼운다(지도는 그대로) · 다시 그리는 기준은 값으로(종이 지도와 오갈 때마다 다시 맞추지 않게 — 화면 확인 10/25)", () => {
        expect(src).toContain("drawn.current.forEach((o) => o.setMap(null));");
        expect(src).toContain("}, [ready, at, courses, pois, summitKey, extrasKey]);");
        expect(src).toContain("extras = NO_EXTRAS");
        expect(code(read("client/src/hiking/components/CourseMap.tsx"))).toContain("extras = NO_EXTRAS");
    });
});

describe("화면 — 코스 지도의 전환(CourseMap)", () => {
    const src = code(read("client/src/hiking/components/CourseMap.tsx"));
    it("실제 지도는 눌렀을 때만 받는다(lazy) · 한 번 열면 붙여 두고 보이기만 바꾼다", () => {
        expect(src).toContain('const KakaoCourseMap = lazy(() => import("./KakaoCourseMap"));');
        expect(src).not.toMatch(/import KakaoCourseMap|import \{[^}]*KakaoCourseMap[^}]*\} from/);
        expect(src).toContain('const [mode, setMode] = useState<"paper" | "real">("paper");');
        expect(src).toContain("visible={mode === \"real\"}");
        // 종이 지도로 돌아갈 때 realOn 을 끄지 않는다(끄면 다음에 또 만든다) — 끄는 곳은 실패뿐
        expect(src.match(/setRealOn\(false\)/g)).toHaveLength(1);
        expect(src).toContain("onFail={(why) => { setRealOn(false); setMode(\"paper\"); setRealNote(REAL_FAIL[why]); }}");
    });
});

describe("서버 — 하루 전체 상한", () => {
    it("POST /hiking/map-load — 꺼짐 스위치 · 상한, 캐시 금지", () => {
        const r = code(read("server/routes/modules/hiking.ts"));
        const block = r.slice(r.indexOf('router.post("/map-load"'), r.indexOf('router.get("/featured-photos"'));
        expect(block).toContain('res.set("Cache-Control", "no-store");');
        expect(block).toContain('process.env.KAKAO_MAP_OFF === "1"');
        expect(block).toContain("takeKakaoMapLoad(kakaoMapCap(process.env.KAKAO_MAP_DAILY_CAP))");
        expect(r).toContain('from "../../../shared/kakaoMap.js";');
    });
    it("한 질의로 상한 아래일 때만 +1 — 동시에 눌러도 넘지 않는다", () => {
        const s = read("server/storage/kakaoMapLoads.ts");
        expect(s).toContain("where kakao_map_loads.loads < ${cap}");
        expect(s).toContain("if (cap <= 0) return false;");
    });
    it("마이그레이션은 더하기만", () => {
        const m = read("migrations/kakao_map_loads.sql");
        expect(m).toContain("create table if not exists kakao_map_loads");
        expect(m.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")).not.toMatch(/\bdrop\b|\bdelete\s+from\b|\bupdate\s+\w+\s+set\b/i);
    });
});
