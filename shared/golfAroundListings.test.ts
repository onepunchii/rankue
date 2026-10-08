import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { aroundData, aroundStats, aroundTotal, aroundView, type AroundRow } from "./golfAroundListings";

/**
 * 골프장 상세 '이 근처 조인·부킹' 카드(2026-10-08 오너: "각 개별 CC 페이지에 이 카드 들어가면 어때? 조인·부킹 등 숫자만 나오고 해당 카드
 * 누르면 조인 페이지로 이동되게" → "시안 1 이 좋네"). 아래 골프장·숫자는 시험용으로 지어낸 값이다.
 */
const row = (slug: string, region: string, counts: Partial<AroundRow["counts"]> = {}, at: { lat: number | null; lng: number | null } = { lat: 36.6, lng: 127.4 }): AroundRow =>
    ({ slug, region, ...at, counts: { booking: 0, join: 0, urgent: 0, ...counts } });
const Z = { booking: 0, join: 0, urgent: 0 };
const HERE = { slug: "here", region: "충청" };

describe("aroundData — 무엇을 세는가", () => {
    it("이 골프장의 글은 근처에 넣지 않는다(바로 위 '지금 이 골프장'이 보여 준다) · 같은 지역은 near, 다른 지역은 far", () => {
        const { near, far, own } = aroundData([
            row("here", "충청", { join: 2, booking: 1 }),
            row("a", "충청", { join: 3, urgent: 1 }),
            row("b", "충청", { booking: 2 }),
            row("c", "경기", { join: 5, booking: 4, urgent: 2 }),
            row("d", "제주", { booking: 1 }),
        ], HERE);
        expect(own).toEqual({ join: 2, booking: 1, urgent: 0 });
        expect(near).toEqual({ join: 3, booking: 2, urgent: 1 });
        expect(far).toEqual({ join: 5, booking: 5, urgent: 2 });
    });

    it("점은 전국을 다 찍고 색은 허브와 같은 뜻(긴급 > 조인 > 부킹) — 글이 없으면 이 지역은 흰 점, 지역 밖은 흐린 점. 내 관심(호박색)은 여기 없다", () => {
        const { dots } = aroundData([
            row("here", "충청"), row("a", "충청", { urgent: 1, join: 1, booking: 1 }), row("b", "경기", { join: 1, booking: 1 }), row("c", "전라", { booking: 1 }), row("d", "제주"),
        ], HERE);
        expect(dots.map((d) => [d.key, d.tone])).toEqual([["here", "on"], ["a", "urgent"], ["b", "join"], ["c", "booking"], ["d", "dim"]]);
    });

    it("좌표가 없는 골프장 — 점도 틀도 없지만 글 수에는 들어간다 · 당겨 볼 범위는 같은 지역만", () => {
        const { dots, focus, near } = aroundData([
            row("a", "충청", { join: 2 }, { lat: null, lng: null }),
            row("b", "충청", {}, { lat: 36.1, lng: 127.9 }),
            row("c", "경기", {}, { lat: 37.4, lng: 127.1 }),
        ], HERE);
        expect(dots.map((d) => d.key)).toEqual(["b", "c"]);
        expect(focus).toEqual([{ lat: 36.1, lng: 127.9 }]);
        expect(near.join).toBe(2);
    });

    it("빈 목록 — 전부 0", () => {
        expect(aroundData([], HERE)).toEqual({ dots: [], focus: [], near: Z, far: Z, own: Z });
    });
});

describe("aroundStats · aroundTotal", () => {
    it("조인 · 부킹 · 긴급 순, 0 인 칸은 없다", () => {
        expect(aroundStats({ join: 7, booking: 5, urgent: 2 }).map((s) => `${s.label} ${s.n}`)).toEqual(["조인 7", "부킹 5", "긴급 2"]);
        expect(aroundStats({ join: 0, booking: 3, urgent: 0 }).map((s) => s.key)).toEqual(["booking"]);
        expect(aroundStats(Z)).toEqual([]);
    });
    it("건수는 조인 + 부킹 — 긴급은 조인 안에 이미 들어 있다", () => {
        expect(aroundTotal({ join: 7, booking: 5, urgent: 2 })).toBe(12);
    });
});

describe("aroundView — 상태 셋과 누르면 가는 곳", () => {
    it("near — 근처 건수 · 그 지역 조인 목록으로. 전국 합계는 다른 지역에도 글이 있을 때만(이 골프장 것은 빼고)", () => {
        const v = aroundView("충청", { join: 7, booking: 5, urgent: 2 }, { join: 17, booking: 10, urgent: 3 }, { join: 1, booking: 0, urgent: 0 });
        expect(v).toMatchObject({ state: "near", n: 12, note: "전국 조인 24 · 부킹 15", href: `/golf/join/${encodeURIComponent("충청")}` });
        expect(v.stats.map((s) => s.n)).toEqual([7, 5, 2]);
        expect(v.aria).toBe("충청 조인·부킹 12건 보기");
        expect(aroundView("충청", { join: 1, booking: 0, urgent: 0 }, Z).note).toBeNull();
    });

    it("near 인데 부킹뿐 — 조인 목록(빈 화면)으로 보내지 않고 부킹 목록으로", () => {
        expect(aroundView("강원", { join: 0, booking: 2, urgent: 0 }, Z).href).toBe(`/golf/booking/${encodeURIComponent("강원")}`);
    });

    it("far — 근처엔 없고 다른 지역엔 있다: 전국 목록으로, 숫자는 다른 지역 것", () => {
        const v = aroundView("충청", Z, { join: 17, booking: 10, urgent: 0 });
        expect(v).toMatchObject({ state: "far", n: 0, href: "/golf/join", note: "충청엔 아직 없어요", aria: "다른 지역 조인·부킹 보기" });
        expect(v.stats.map((s) => `${s.label} ${s.n}`)).toEqual(["조인 17", "부킹 10"]);
        expect(aroundView("제주", Z, { join: 0, booking: 3, urgent: 0 }).href).toBe("/golf/booking");
    });

    it("far 인데 이 골프장에는 글이 있다 — '아직 없어요'라고 하지 않는다", () => {
        expect(aroundView("충청", Z, { join: 1, booking: 0, urgent: 0 }, { join: 0, booking: 2, urgent: 0 }).note).toBe("충청엔 이 골프장뿐이에요");
    });

    it("empty — 어디에도 없으면 숫자도 링크도 없다(0 을 늘어놓지 않는다). 이 골프장에만 글이 있어도 같다", () => {
        expect(aroundView("충청", Z, Z)).toEqual({ state: "empty", n: 0, stats: [], note: null, href: null, aria: null });
        expect(aroundView("충청", Z, Z, { join: 2, booking: 0, urgent: 0 }).state).toBe("empty");
    });
});

describe("화면 — AroundListings 와 상세 페이지", () => {
    const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
    const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");
    const card = code(root("client/src/golf/components/course/detail/AroundListings.tsx"));
    const page = root("client/src/golf/pages/GolfCoursePage.tsx");

    it("셈은 shared 것을 쓴다 — 화면에서 따로 세지 않는다", () => {
        expect(card).toContain('import { aroundData, aroundView } from "@shared/golfAroundListings";');
        expect(card).toContain("aroundData(rows ?? [], { slug, region })");
        expect(card).not.toMatch(/counts\.(join|booking|urgent)/);
    });

    it("세 상태와 받기 전 뼈대가 같은 면(같은 최소 높이)을 쓴다 — 목록이 도착할 때 밑의 구역이 밀리지 않는다", () => {
        expect(card).toContain('const FACE = "p-3.5 flex items-center gap-3.5 min-h-[163px]";');
        expect(card.match(/<Card className=\{FACE\}>/g)).toHaveLength(3);
        expect(card.match(/<Card /g)).toHaveLength(3);
    });

    it("전국 목록은 화면에 들어올 때 받는다(HereMap 과 같은 캐시) · 못 받으면 카드를 그리지 않는다", () => {
        expect(card).toContain("const list = useCourseList({}, seen);");
        expect(card).toContain("IntersectionObserver");
        expect(card).toContain("if (list.isError && !rows) return null;");
    });

    it("빈 상태 — '0건'·'없어요'를 적지 않고 올리기(조인 올리기 시트)와 지역 알림으로. 골프를 안 쓰는 회원에게는 올리기 단추가 없다", () => {
        const empty = card.slice(card.indexOf('if (view.state === "empty")'), card.indexOf("<Link href={view.href!}"));
        expect(empty).toContain("남는 자리, 여기 올려 보세요");
        expect(empty).not.toMatch(/없어요|0건/);
        expect(empty).toContain("const canPost = golfOk || !member;");
        expect(empty).toContain("if (golfOk) setLocation(GOLF_POST_PATH); else goLogin(setLocation, GOLF_POST_PATH);");
        expect(empty).toContain('<AreaAlertButton variant="chip" what={region} region={region} city={null} intent={null} regions={undefined} className="h-9 px-3.5 [&>svg]:hidden" />');
        // 링크 안에 단추를 넣지 않는다 — 빈 상태의 카드는 링크가 아니다
        expect(empty).not.toContain("<Link");
    });

    it("글이 있는 상태 — 카드 전체가 링크 하나(안에 다른 링크·단추 없음), 숫자 색은 지도의 점과 같은 색", () => {
        const live = card.slice(card.indexOf("<Link href={view.href!}"));
        expect(live.match(/<Link/g)).toHaveLength(1);
        expect(live).not.toMatch(/<button|<a /);
        expect(live).toContain("style={{ background: DOT_COLOR[s.key] }}");
    });

    it("지도 — 시도 선을 다 긋지 않고 이 지역만 한 덩어리 면으로(안쪽 경계 없음). 색은 불투명(겹친 데가 비치지 않게)", () => {
        expect(card).toContain("under={<RegionShape group={region} face={REGION_FACE} edge={REGION_EDGE} />}>");
        expect(card).not.toContain("<KoreaOutline");
        expect(card).toMatch(/const REGION_FACE = "#[0-9A-F]{6}";/);
        expect(card).toMatch(/const REGION_EDGE = "#[0-9A-F]{6}";/);
        const shape = code(root("client/src/golf/components/course/list/KoreaOutline.tsx"));
        const body = shape.slice(shape.indexOf("export function RegionShape("));
        // 밑에 테두리 색(선 + 면), 위에 면 색으로 다시 — 조각이 맞닿는 안쪽 선은 덮여 사라진다
        expect(body.indexOf("fill={edge} stroke={edge}")).toBeGreaterThan(0);
        expect(body.indexOf("fill={face} stroke={face}")).toBeGreaterThan(body.indexOf("fill={edge} stroke={edge}"));
        expect(body).toContain("OUTLINE_GROUP[id] === group");
    });

    it("골프 화면 규칙 — 글자 12px 이상 · 굵기는 semibold 까지 · 새 색을 지어내지 않는다", () => {
        const sizes = [...card.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]));
        expect(sizes.length).toBeGreaterThanOrEqual(4);
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
        // 제목은 폭에 따라 15~16px
        expect(card).toContain('const TITLE_SIZE = { fontSize: "clamp(15px, 4.1vw, 16px)" } as const;');
        expect(card).not.toMatch(/font-(bold|extrabold|black)/);
        expect(card).not.toMatch(/text-(xs|\[1[01](\.\d+)?px\])/);
        // 색 점은 DOT_COLOR 에서만 — 카드 안에 긴급·조인·부킹 색을 다시 적지 않는다(주황은 '조인 올리기' 단추 하나)
        expect(card).not.toMatch(/#FF3B30|#64DD17/i);
        expect(card.match(/#FF6B00/gi)).toHaveLength(1);
    });

    it("상세 페이지 — 티타임 바로 밑에 하나, key 는 다른 구역과 겹치지 않는다(2026-10-05 같은 key 사고)", () => {
        expect(page.match(/<AroundListings /g)).toHaveLength(1);
        const tee = page.indexOf("<TeeTimes "), around = page.indexOf("<AroundListings "), intro = page.indexOf("<GolfGuestIntro ");
        expect(tee).toBeGreaterThan(0);
        expect(around).toBeGreaterThan(tee);
        expect(intro).toBeGreaterThan(around);
        expect(page).toContain("<AroundListings key={`around:${d.slug}`} slug={d.slug} lat={here?.lat ?? null} lng={here?.lng ?? null} region={d.region}");
        const keys = [...page.matchAll(/key=\{`([a-z]+):\$\{d\.slug\}`\}/g)].map((m) => m[1]);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).toContain("around");
    });
});
