/**
 * 카카오 지도(2026-10-25 — 유료 0.1원/건). 비용은 사고가 만든다 — 그 길목을 고정한다:
 * 눌렀을 때만 · 한 화면에 한 번만 만들기 · 만들기 전에 기기 · 서버 상한 · 못 띄우면 종이 지도.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KAKAO_KIND, KAKAO_MAP_DAILY_CAP_DEFAULT, KAKAO_MAP_DEVICE_DAILY, deviceAllows, isKakaoKind, kakaoCap, kakaoMapCap, kakaoShareUrl, kstDay } from "./kakaoMap";

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
    it("종류마다 상한 — 근처 장소(2원)가 가장 낮고, 이상한 종류는 받지 않는다", () => {
        expect(KAKAO_KIND.local.won).toBe(2);
        expect(KAKAO_KIND.map.won).toBe(0.1);
        expect(KAKAO_KIND.local.cap * KAKAO_KIND.local.won).toBeLessThanOrEqual(1000);   // 근처 장소 하루 최대 1,000원
        expect(KAKAO_KIND.roadview.cap * KAKAO_KIND.roadview.won).toBeLessThanOrEqual(300);
        expect(isKakaoKind("local")).toBe(true);
        expect(isKakaoKind("share")).toBe(false);
        expect(kakaoCap("", 7)).toBe(7);
        expect(kakaoCap("0", 7)).toBe(0);
    });
    it("카카오톡 공유 링크 — 정본 주소로만", () => {
        expect(kakaoShareUrl("/hiking/mountains/a")).toBe("https://www.rankue.co.kr/hiking/mountains/a");
        expect(kakaoShareUrl("http://localhost:5177/club/1?x=2")).toBe("https://www.rankue.co.kr/club/1?x=2");
        expect(kakaoShareUrl("https://rankue-abc.vercel.app/i/AB12")).toBe("https://www.rankue.co.kr/i/AB12");
        expect(kakaoShareUrl("https://www.rankue.co.kr/golf/booking-list/9?date=2026-10-30")).toBe("https://www.rankue.co.kr/golf/booking-list/9?date=2026-10-30");
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
        expect(make.indexOf('await askKakao("map")')).toBeGreaterThan(-1);
        expect(make.indexOf('await askKakao("map")')).toBeLessThan(make.indexOf("await loadKakaoMaps()"));
    });
    it("상한 — 기기 먼저, 서버(POST map-load · 종류를 실어)가 허락한 뒤에만 기기 수를 올린다", () => {
        const sdk = code(read("client/src/components/kakao/kakaoSdk.ts"));
        const ask = sdk.slice(sdk.indexOf("export async function askKakao("), sdk.indexOf("export function kakaoFailText("));
        expect(ask.indexOf("deviceAllows(")).toBeLessThan(ask.indexOf("apiRequest(KAKAO_MAP_LOAD_API"));
        expect(ask).toContain('body: { kind }');
        expect(ask.indexOf("apiRequest(KAKAO_MAP_LOAD_API")).toBeLessThan(ask.indexOf("localStorage.setItem(DEVICE_KEY[kind]"));
        // 지도 기기 수는 처음 쓰던 칸 그대로
        expect(sdk).toContain('map: "rankue_kmap_day"');
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
    it("POST /hiking/map-load — 꺼짐 스위치(셋 다) · 종류마다 상한, 모르는 종류는 지도로, 캐시 금지", () => {
        const r = code(read("server/routes/modules/hiking.ts"));
        const block = r.slice(r.indexOf('router.post("/map-load"'), r.indexOf('router.get("/featured-photos"'));
        expect(block).toContain('res.set("Cache-Control", "no-store");');
        expect(block.indexOf('process.env.KAKAO_MAP_OFF === "1"')).toBeLessThan(block.indexOf("const kind"));
        expect(block).toContain('const kind = isKakaoKind(req.body?.kind) ? req.body.kind : "map";');
        expect(block).toContain("const cap = kakaoCap(process.env[spec.env], spec.cap);");
        expect(block).toContain('kind === "map" ? await takeKakaoMapLoad(cap) : await takeKakaoCall(kind, cap)');
        expect(r).toContain('from "../../../shared/kakaoMap.js";');
    });
    it("한 질의로 상한 아래일 때만 +1 — 동시에 눌러도 넘지 않는다(지도 · 로드뷰 · 근처 장소)", () => {
        const s = read("server/storage/kakaoMapLoads.ts");
        expect(s).toContain("where kakao_map_loads.loads < ${cap}");
        expect(s).toContain("where kakao_api_calls.calls < ${cap}");
        expect(s.match(/if \(cap <= 0\) return false;/g)).toHaveLength(2);
    });
    it("마이그레이션은 더하기만", () => {
        for (const f of ["migrations/kakao_map_loads.sql", "migrations/kakao_api_calls.sql"]) {
            const m = read(f);
            expect(m, f).toContain("create table if not exists");
            expect(m.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"), f).not.toMatch(/\bdrop\b|\bdelete\s+from\b|\bupdate\s+\w+\s+set\b/i);
        }
    });
});

describe("로드뷰 · 근처 장소(KakaoAround · KakaoRoadviewSheet)", () => {
    const around = code(read("client/src/components/kakao/KakaoAround.tsx"));
    const rv = code(read("client/src/components/kakao/KakaoRoadviewSheet.tsx"));
    it("근처 장소는 스스로 부르지 않는다 — 칩을 눌렀을 때 그 종류 하나, 허락 → SDK → 찾기 차례, 한 번 찾은 것은 다시 안 찾는다", () => {
        expect(around).not.toMatch(/useEffect\(/);
        const find = around.slice(around.indexOf("const find = async"), around.indexOf("const cur = pick"));
        expect(find.indexOf('views[k.id]?.state === "done"')).toBeLessThan(find.indexOf('await askKakao("local")'));
        expect(find.indexOf('await askKakao("local")')).toBeLessThan(find.indexOf("await loadKakaoMaps()"));
        expect(find.indexOf("await loadKakaoMaps()")).toBeLessThan(find.indexOf("places.categorySearch("));
        // 결과는 메모리에만 — 기기 저장소에 넣지 않는다
        expect(around).not.toContain("localStorage");
        expect(around).toContain("const KakaoRoadviewSheet = lazy(");
    });
    it("로드뷰 — 창이 뜰 때 한 번, 허락받고, 가까운 자리가 없으면 만들지 않는다", () => {
        expect(rv).toContain("if (started.current) return;");
        expect(rv.match(/new kakao\.maps\.Roadview\(/g)).toHaveLength(1);
        expect(rv.indexOf('await askKakao("roadview")')).toBeLessThan(rv.indexOf("new kakao.maps.Roadview("));
        expect(rv.indexOf('if (!panoId) { setSt({ s: "none" }); return; }')).toBeLessThan(rv.indexOf("new kakao.maps.Roadview("));
    });
    it("산 화면의 위치 · 들머리와 낚시터 화면의 위치에 붙는다", () => {
        expect(read("client/src/hiking/components/MountainLocation.tsx")).toContain("<KakaoAround lat={head ? head.lat : d.lat!}");
        expect(read("client/src/fishing/spots/SpotsPages.tsx")).toContain('kinds={AROUND_FISHING} place="낚시터 근처"');
    });
});

describe("카카오톡 공유(ShareChooser · lib/kakaoShare)", () => {
    it("웹에서만 — 앱이거나 키가 없으면 고르기 없이 그 화면의 예전 공유", () => {
        const share = code(read("client/src/lib/kakaoShare.ts"));
        expect(share).toContain("return !!KEY && !isNativeApp();");
        const chooser = code(read("client/src/components/share/ShareChooser.tsx"));
        expect(chooser).toContain("if (!kakaoShareAvailable()) { void req.fallback(); return; }");
        // 카카오톡이 안 되면(기기 상한 · 오류) 예전 공유로 넘긴다
        expect(chooser).toContain('if (r === "sent") return;');
        expect(read("client/src/App.tsx")).toContain("<ShareChooserHost />");
    });
    it("다섯 화면 — 산 · 골프장 · 크루 · 친구 초대는 고르는 창, 골프 티타임 창의 '카카오톡'은 진짜 카카오톡 카드", () => {
        for (const [f, fb] of [["client/src/hiking/pages/MountainPage.tsx", "fallback: systemShare"], ["client/src/golf/pages/GolfCoursePage.tsx", "fallback: systemShare"], ["client/src/pages/hiq/club-detail.tsx", "fallback: systemShare"], ["client/src/components/hiq/invite/InvitePanel.tsx", "fallback: systemSendLink"]] as const) {
            const s = read(f);
            expect(s, f).toContain("shareWithKakao({");
            expect(s, f).toContain(fb);
        }
        const golf = read("client/src/golf/components/booking/ShareSheet.tsx");
        expect(golf).toContain("if (!kakaoShareAvailable()) { onExternalShare(shareItem); return; }");
        expect(golf).toContain('then((r) => { if (r === "sent") onOpenChange(false); else onExternalShare(shareItem); })');
    });
});
