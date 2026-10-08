import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 골프장 상세 '위치·연락' 둘째 판 + 허브 지도의 점 크기(2026-10-08 오너: "이 골프장이 어디인지 직관적으로 확인이 가능하게 지도를 키워서
 * 좌측으로, 버튼을 우측 배열 … 경계선 및 해당 골프장 점은 다른 색으로" · "요기도 점을 더 축소해서 더 직관적인 느낌으로").
 * 화면은 하니스로 봤다 — 여기는 다시 작아지거나 색이 빠지지 않게 모양의 뼈대를 고정한다.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

describe("LocationCard — 지도 왼쪽 크게, 주소·단추는 오른쪽에 세로로", () => {
    const card = code(root("client/src/golf/components/course/detail/LocationCard.tsx"));

    it("지도가 있으면 한 줄에 [지도 | 주소 + 단추 세로]. 지도는 줄의 맨 앞이다", () => {
        const withMap = card.slice(card.indexOf("{hasMap ? ("), card.indexOf(") : ("));
        expect(withMap).toContain('<Card className="p-3.5 flex items-stretch gap-3.5">');
        expect(withMap.indexOf("<HereMap ")).toBeGreaterThan(0);
        expect(withMap.indexOf("<HereMap ")).toBeLessThan(withMap.indexOf("{addr}"));
        expect(withMap).toContain('<div className="flex flex-col gap-2">{buttons}</div>');
    });

    it("지도를 못 그리는 골프장(좌표 없음·틀 밖)은 예전 모양 — 주소 한 줄 + 단추 두 칸. 핀 그림은 이때만", () => {
        expect(card).toContain("const hasMap = !!herePoint(here?.lat, here?.lng);");
        expect(card).toContain('<div className={cn("grid grid-cols-2 gap-2", full && "mt-4")}>{buttons}</div>');
        expect(card).toContain("{!hasMap && <LucideMapPin ");
    });

    it("단추 넷(카카오맵 · 길찾기 · 전화 · 홈페이지)은 그대로 — 전화번호는 줄바꿈하지 않고, 홈페이지는 넘치면 줄인다", () => {
        expect(card).toContain("href={kakaoMapUrl(name, lat, lng)}");
        expect(card).toContain("href={kakaoRouteUrl(name, lat, lng)}");
        expect(card).toContain('<span className="tabular-nums whitespace-nowrap">{phone}</span>');
        expect(card).toContain('<span className="truncate">{hostOf(site)}</span>');
        expect(card).toContain('rel="noopener noreferrer nofollow"');
    });
});

describe("HereMap — 크게 · 이 지역과 '여기'는 골프 강조색", () => {
    const map = code(root("client/src/golf/components/course/detail/HereMap.tsx"));

    it("세로로 긴 틀(나라가 꽉 차는 비율)에 잘게 찍는다 · 너비는 화면 폭을 따른다", () => {
        expect(map).toContain("const ASPECT = 0.56;");
        expect(map).toContain("const BOX = fitBox(KOREA_CORNERS, ASPECT);");
        expect(map).toContain('const CSS_W = "clamp(118px, 36vw, 148px)";');
        expect(map).toMatch(/box=\{BOX\} aspect=\{ASPECT\} cols=\{26\}/);
    });

    it("이 지역 = 한 덩어리 면 + 라임 테두리(RegionShape), 다른 지역의 선은 아주 옅게", () => {
        expect(map).toContain('<KoreaOutline stroke="#FFFFFF1A" width={0.5} />');
        expect(map).toContain("{region && <RegionShape group={region} face={REGION_FACE} edge={REGION_EDGE} edgeWidth={0.9} />}");
        // 옅은 전국 선 → 그 위에 이 지역의 면(안쪽 선을 덮는다)
        expect(map.indexOf("<KoreaOutline ")).toBeLessThan(map.indexOf("<RegionShape "));
    });

    it("'여기' = 라임 고리(자리) + 가운데 점(상태: 글·내 관심의 색, 없으면 흰 점) — 허브에서 고른 지역의 윤곽선과 같은 라임", () => {
        expect(map).toContain('const ACCENT = "#64DD17";');
        expect(code(root("client/src/golf/components/course/list/KoreaOutline.tsx"))).toContain('activeStroke = "#64DD17"');
        expect(map).toContain('const core = tone ? DOT_COLOR[tone] : "#FFFFFF";');
        expect(map).toContain("<circle cx={here.x} cy={here.y} r={R} fill={BG} stroke={ACCENT} strokeWidth={2 * u} />");
        expect(map).toContain("<circle cx={here.x} cy={here.y} r={2.9 * u} fill={core} />");
        // 숨 쉬는 후광은 글이 올라와 있을 때만(움직임 = '지금 있다')
        expect(map).toContain("{live && !still ? (");
    });

    it("전국 목록은 화면에 들어올 때 받는다 · 자리를 못 잡으면 그리지 않는다", () => {
        expect(map).toContain("const list = useCourseList({}, seen);");
        expect(map).toContain("if (!here) return null;");
    });
});

describe("허브 지도 — 전국은 점을 잘게", () => {
    const hub = code(root("client/src/golf/pages/GolfCourseHub.tsx"));

    it("전국 46칸(의도 허브 60칸), 지역·시군으로 당기면 예전 굵기(30 · 40) — 당긴 화면은 점이 드물어 잘면 안 보인다", () => {
        expect(hub).toContain("const mapCols = region ? (intent ? 40 : 30) : (intent ? 60 : 46);");
        expect(hub).toContain("cols={mapCols}");
        expect(hub).not.toContain("URLSearchParams(window.location.search).get(\"cols\")");
    });
});
