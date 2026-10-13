import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    ACTIVITY_COURSES_MAX, ACTIVITY_COURSES_STEP, ACTIVITY_MOUNTAIN_COPY, MOUNTAIN_NAME_MAX, MOUNTAIN_OPTIONS_STEP, MOUNTAIN_QUERY_MAX, MOUNTAIN_SLUG_MAX,
    activityCourseChip, activityCourseLine, activityMountainPlace, activityMountainSlug, activityMountainTitle, clearCourseLine, clearFromMountain, fillCourseLine, fillFromMountain,
    mountainFillNote, mountainFoundNote, mountainOptionLabels, mountainOptionWhere,
    pickMountainOptions, readMountainDetail, readMountainSearch, splitMountainQuery, summitTogetherCount, summitTogetherDue, summitTogetherText, SUMMIT_TOGETHER_MIN, toActivityCourse, toActivityMountain,
    type ActivityCourse, type ActivityMountain,
} from "./crewMountain";
import { hikingList, hikingMountainPath } from "./hikingMountains";
import { COURSE_TIME_NOTE, courseFacts, courseShape } from "./hikingPage";
import { kstDay } from "./hikingStamps";
import { hiqCrewActivities, insertHiqCrewActivitySchema } from "./schema";
import { mapLink } from "./storeMeta";
import { screenCrewBody } from "../server/utils/crewModeration.js";

// 산악회 일정의 '산 고르기'(2026-10-13) — 고르면 모이는 곳과 비어 있는 모임명이 채워진다. 당구 · 골프 크루의 만들기 창은 그대로여야 한다.
// 같은 날 이어서: 고른 산의 주소가 일정에 남고(mountain_slug), 카드에 '산 정보 보기'가 달리고, 코스를 고르면 상세 내용에 한 줄이 적히고,
// 지난 일정에 '함께 정상 인증 N명'이 붙는다. 넷 다 산악회에만 — 당구 · 골프 크루로 가는 값과 카드는 그대로여야 한다.
const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
/** 주석을 뺀 코드 — 설명 글의 낱말이 고정 시험에 걸리지 않게 */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const mt = (over: Partial<ActivityMountain> & { name: string }): ActivityMountain => ({ slug: over.name, sido: null, sigungu: null, heightM: null, kfs100: false, ...over });
const seorak = mt({ name: "설악산", sido: "강원특별자치도", sigungu: "양양군", heightM: 1708, kfs100: true });
const baegunGwangyang = mt({ name: "백운산", slug: "백운산", sido: "전라남도", sigungu: "광양시", heightM: 1222, kfs100: true });
const baegunPocheon = mt({ name: "백운산", slug: "백운산-포천", sido: "경기도", sigungu: "포천시", heightM: 903 });
const baegunWonju = mt({ name: "백운산", slug: "백운산-원주", sido: "강원특별자치도", sigungu: "원주시", heightM: 1087 });
const muhak = mt({ name: "무학산", sido: "경상남도", sigungu: "창원시 마산합포구", heightM: 761 });

describe("모이는 곳에 채우는 글", () => {
    it("주소의 순서로 — 시도(짧게) · 시군구 · 산 이름을 빈칸으로만 잇는다", () => {
        expect(activityMountainPlace(seorak)).toBe("강원 양양군 설악산");
        expect(activityMountainPlace(muhak)).toBe("경남 창원시 마산합포구 무학산");
    });
    it("같은 이름의 산은 시군구가 달라 글이 갈린다", () => {
        expect(activityMountainPlace(baegunGwangyang)).toBe("전남 광양시 백운산");
        expect(activityMountainPlace(baegunPocheon)).toBe("경기 포천시 백운산");
        expect(new Set([baegunGwangyang, baegunPocheon, baegunWonju].map(activityMountainPlace)).size).toBe(3);
    });
    it("시군구가 없으면 시도만, 자리를 모르면 산 이름만 — 빈칸이 겹치거나 앞뒤에 남지 않는다", () => {
        expect(activityMountainPlace(mt({ name: "한라산", sido: "제주특별자치도" }))).toBe("제주 한라산");
        expect(activityMountainPlace(mt({ name: "한라산", sido: "제주특별자치도", sigungu: "" }))).toBe("제주 한라산");
        expect(activityMountainPlace(mt({ name: "이름만산" }))).toBe("이름만산");
        // 표에 없는 시도 이름은 받은 그대로
        expect(activityMountainPlace(mt({ name: "어느산", sido: "어느도", sigungu: "어느군" }))).toBe("어느도 어느군 어느산");
    });
    it("일정 카드의 '지도'가 이 글을 통째로 검색어로 쓴다 — 꾸밈 글자가 없고, mapLink 가 한 글자도 잘라 내지 않는다", () => {
        for (const m of [seorak, muhak, baegunGwangyang, baegunPocheon, mt({ name: "한라산", sido: "제주특별자치도" }), mt({ name: "남산" })]) {
            const place = activityMountainPlace(m);
            expect(place, place).not.toMatch(/[·()[\],]/);
            expect(mapLink({ name: place, address: place }), place).toBe(`https://map.kakao.com/link/search/${encodeURIComponent(place)}`);
        }
        // 카드가 지금도 그렇게 부른다(바뀌면 위의 약속을 다시 볼 것)
        expect(read("client/src/components/hiq/view/ClubActivityList.tsx")).toContain("href={mapLink({ name: activity.locationName, address: activity.locationName })}");
    });
    it("채운 글 · 권한 이름은 정모의 서버 필터를 그대로 지난다(가려지거나 거절되지 않는다)", () => {
        for (const m of [seorak, muhak, baegunPocheon]) {
            const body = { title: activityMountainTitle(m), locationName: activityMountainPlace(m) };
            const r = screenCrewBody(body, ["title", "description", "locationName", "cost"] as const);
            expect(r.ok, body.locationName).toBe(true);
            if (r.ok) expect(r.value.fields).toEqual(body);
        }
    });
});

describe("모임명 권하기 · 지우기", () => {
    it("권하는 이름은 '<산> 산행' — 만들기 창의 예시와 같은 꼴이다", () => {
        expect(activityMountainTitle(seorak)).toBe("설악산 산행");
        expect(read("client/src/lib/i18n/ko.ts")).toContain('"createActivity.namePlaceholderHiking": "예: 북한산 백운대 산행"');
    });
    it("모임명이 비어 있으면(빈칸뿐이어도) 채우고, 모이는 곳은 늘 그 산의 자리로 바꾼다", () => {
        for (const title of ["", "   "]) {
            const r = fillFromMountain({ title, place: "" }, seorak);
            expect(r.fields).toEqual({ title: "설악산 산행", place: "강원 양양군 설악산" });
            expect(r.picked).toEqual({ mountain: seorak, titleOurs: true });
        }
        expect(fillFromMountain({ title: "", place: "예전에 적어 둔 곳" }, seorak).fields.place).toBe("강원 양양군 설악산");
    });
    it("회원이 적은 모임명은 건드리지 않는다", () => {
        const r = fillFromMountain({ title: "10월 정기 산행", place: "" }, seorak);
        expect(r.fields).toEqual({ title: "10월 정기 산행", place: "강원 양양군 설악산" });
        expect(r.picked.titleOurs).toBe(false);
    });
    it("고른 산을 지우면 우리가 채운 글 그대로인 칸만 비운다", () => {
        const { fields, picked } = fillFromMountain({ title: "", place: "" }, seorak);
        expect(clearFromMountain(fields, picked)).toEqual({ title: "", place: "" });
        // 회원이 만나는 자리를 이어 적었으면 그 칸은 남긴다
        expect(clearFromMountain({ ...fields, place: "강원 양양군 설악산 오색 탐방지원센터 앞" }, picked)).toEqual({ title: "", place: "강원 양양군 설악산 오색 탐방지원센터 앞" });
        // 모임명을 고쳤으면 그 칸은 남긴다
        expect(clearFromMountain({ ...fields, title: "설악산 가을 산행" }, picked)).toEqual({ title: "설악산 가을 산행", place: "" });
    });
    it("회원이 손수 적은 이름이 우리가 권했을 이름과 같아도 지우지 않는다(우리가 채운 것이 아니다)", () => {
        const { fields, picked } = fillFromMountain({ title: "설악산 산행", place: "" }, seorak);
        expect(picked.titleOurs).toBe(false);
        expect(clearFromMountain(fields, picked)).toEqual({ title: "설악산 산행", place: "" });
    });
    it("다른 산으로 바꾸기(지우고 다시 고르기) — 손대지 않은 칸은 새 산의 것으로 바뀐다", () => {
        const first = fillFromMountain({ title: "", place: "" }, baegunPocheon);
        const cleared = clearFromMountain(first.fields, first.picked);
        expect(fillFromMountain(cleared, baegunGwangyang).fields).toEqual({ title: "백운산 산행", place: "전남 광양시 백운산" });
    });
    it("고른 뒤의 한 줄은 무엇을 채웠는지 말한다 — 칸 이름은 만들기 창의 것 그대로", () => {
        expect(mountainFillNote(true)).toBe("모이는 곳과 모임명을 채웠어요. 만나는 자리(들머리 · 주차장)를 이어서 적어 보세요.");
        expect(mountainFillNote(false)).toBe("모이는 곳을 채웠어요. 만나는 자리(들머리 · 주차장)를 이어서 적어 보세요.");
        const ko = read("client/src/lib/i18n/ko.ts");
        expect(ko).toContain('"createActivity.nameLabel": "모임명"');
        expect(ko).toContain('"createActivity.locationLabelHiking": "모이는 곳"');
    });
});

describe("고르는 줄", () => {
    it("같은 이름의 산이 같이 놓이면 시군을 붙여 가른다 — 겹치지 않는 산은 이름 그대로", () => {
        expect(mountainOptionLabels([baegunGwangyang, baegunPocheon, baegunWonju, seorak])).toEqual(["백운산(광양)", "백운산(포천)", "백운산(원주)", "설악산"]);
        expect(mountainOptionLabels([baegunGwangyang, seorak])).toEqual(["백운산", "설악산"]);
        // 주소에 시군이 붙은 산은 혼자 놓여도 시군을 단다(같은 이름의 으뜸 산이 따로 있다는 뜻이다)
        expect(mountainOptionLabels([baegunPocheon])).toEqual(["백운산(포천)"]);
    });
    it("이름 아래 한 줄 — 시도 · 시군구 · 높이. 없는 것은 빼고 잇는다", () => {
        expect(mountainOptionWhere(seorak)).toBe("강원 양양군 · 1,708m");
        expect(mountainOptionWhere(baegunPocheon)).toBe("경기 포천시 · 903m");
        expect(mountainOptionWhere(mt({ name: "한라산", sido: "제주특별자치도", heightM: 1947 }))).toBe("제주 · 1,947m");
        expect(mountainOptionWhere(mt({ name: "어느산", sido: "경기도", sigungu: "포천시" }))).toBe("경기 포천시");
        expect(mountainOptionWhere(mt({ name: "이름만산" }))).toBe("");
    });
    it("100대 명산 표시는 목록의 짧은 이름과 같다", () => {
        expect(ACTIVITY_MOUNTAIN_COPY.badge).toBe(hikingList("kfs100")!.short);
    });
});

describe("받은 값 걸러 읽기(toActivityMountain · activityMountainSlug) — 주소의 검사는 서버도 쓴다", () => {
    const ok = { id: "Q1", slug: "설악산", name: "설악산", heightM: 1708, lat: 38.1, lng: 128.4, sido: "강원특별자치도", sigungu: "양양군", lists: ["kfs100", "nationalparks"], tier: 1 };
    it("여섯 가지만 옮긴다 — 다른 열쇠는 믿지 않는다", () => {
        expect(toActivityMountain({ ...ok, evil: "<script>", crewId: "x", mountainName: "남의 산" })).toEqual({ slug: "설악산", name: "설악산", sido: "강원특별자치도", sigungu: "양양군", heightM: 1708, kfs100: true });
        expect(Object.keys(toActivityMountain(ok)!).sort()).toEqual(["heightM", "kfs100", "name", "sido", "sigungu", "slug"]);
    });
    it("꼴이 어긋난 값은 받지 않는다 — 객체가 아닌 것 · 주소나 이름이 없는 것 · 글자가 아닌 것", () => {
        for (const bad of [null, undefined, "설악산", 3, true, [], [ok], () => ok]) expect(toActivityMountain(bad), String(bad)).toBeNull();
        for (const bad of [{}, { name: "설악산" }, { slug: "설악산" }, { ...ok, slug: "" }, { ...ok, slug: "   " }, { ...ok, slug: 7 }, { ...ok, slug: ["설악산"] }, { ...ok, slug: { toString: () => "설악산" } }, { ...ok, name: "" }, { ...ok, name: null }, { ...ok, name: 7 }]) {
            expect(toActivityMountain(bad), JSON.stringify(bad)).toBeNull();
        }
    });
    it("주소는 80자 안, 빈칸 · 빗금 · ? · # 이 없어야 한다. 이름은 40자 안", () => {
        expect(toActivityMountain({ ...ok, slug: "가".repeat(MOUNTAIN_SLUG_MAX) })?.slug).toHaveLength(80);
        expect(toActivityMountain({ ...ok, slug: "가".repeat(MOUNTAIN_SLUG_MAX + 1) })).toBeNull();
        for (const slug of ["설악산 양양", "설악산/양양", "..\\설악산", "설악산?x=1", "설악산#top", "설악\n산"]) expect(toActivityMountain({ ...ok, slug }), slug).toBeNull();
        expect(toActivityMountain({ ...ok, name: "가".repeat(MOUNTAIN_NAME_MAX + 1) })).toBeNull();
        // 우리 주소의 꼴(이름-시군-읍면동)은 지난다 — 그 주소로 산 화면 주소를 만든다
        const m = toActivityMountain({ ...ok, slug: "백운산-포천-이동면", name: "백운산" })!;
        expect(hikingMountainPath(m.slug)).toBe(`/hiking/mountains/${encodeURIComponent("백운산-포천-이동면")}`);
    });
    it("서버의 검사(activityMountainSlug) — 주소의 꼴만 본다: 글자 · 비어 있지 않음 · 80자 안 · 빈칸 · 빗금 · ? · # 없음", () => {
        for (const good of ["설악산", "백운산-포천", "백운산-포천-이동면", "가".repeat(MOUNTAIN_SLUG_MAX)]) expect(activityMountainSlug(good), good).toBe(good);
        // 앞뒤의 빈칸은 떼고 본다
        expect(activityMountainSlug("  설악산 ")).toBe("설악산");
        for (const bad of [null, undefined, "", "   ", 7, 0, true, false, NaN, ["설악산"], { slug: "설악산" }, { toString: () => "설악산" }, () => "설악산", "가".repeat(MOUNTAIN_SLUG_MAX + 1),
            "설악산 양양", "설악산/양양", "..\\설악산", "../etc", "설악산?x=1", "설악산#top", "설악\n산", "설악\t산"]) {
            expect(activityMountainSlug(bad), JSON.stringify(bad)).toBeNull();
        }
        // 고르는 줄의 검사와 같은 금이다(따로 놀지 않는다)
        for (const slug of ["설악산", "설악산 양양", "설악산/양양", "", "가".repeat(81)]) expect(toActivityMountain({ ...ok, slug })?.slug ?? null, slug).toBe(activityMountainSlug(slug));
    });
    it("곁의 값이 어긋나면 그 값만 비운다(산은 고를 수 있다)", () => {
        expect(toActivityMountain({ slug: "어느산", name: "어느산", heightM: "높다", sido: 3, sigungu: "  ", lists: "kfs100" })).toEqual({ slug: "어느산", name: "어느산", sido: null, sigungu: null, heightM: null, kfs100: false });
        for (const heightM of [0, -5, NaN, Infinity, null]) expect(toActivityMountain({ ...ok, heightM })?.heightM, String(heightM)).toBeNull();
        expect(toActivityMountain({ ...ok, heightM: 1707.6 })?.heightM).toBe(1708);
        expect(toActivityMountain({ ...ok, lists: ["nationalparks"] })?.kfs100).toBe(false);
    });
    it("검색 답 읽기 — 어긋난 줄 · 두 번 온 주소는 빼고, 서버가 다 주지 못했으면 capped", () => {
        expect(readMountainSearch({ total: 3, items: [ok, { ...ok, name: "다시 온 줄" }, null, { slug: 3 }, { ...ok, slug: "설악산-인제" }] })).toEqual({
            list: [toActivityMountain(ok), toActivityMountain({ ...ok, slug: "설악산-인제" })], capped: false,
        });
        expect(readMountainSearch({ total: 3836, items: [ok] }).capped).toBe(true);
        for (const bad of [null, undefined, "x", [], {}, { items: "x" }, { total: "많다", items: null }]) expect(readMountainSearch(bad), JSON.stringify(bad)).toEqual({ list: [], capped: false });
    });
});

describe("검색어", () => {
    it("첫 낱말이 서버에 묻는 이름, 그 뒤는 시도 · 시군구로 좁히는 낱말", () => {
        expect(splitMountainQuery("백운산")).toEqual({ q: "백운산", rest: [] });
        expect(splitMountainQuery("  백운산   포천  ")).toEqual({ q: "백운산", rest: ["포천"] });
        expect(splitMountainQuery("백운산 경기 포천")).toEqual({ q: "백운산", rest: ["경기", "포천"] });
        for (const v of ["", "   ", null as unknown as string, undefined as unknown as string]) expect(splitMountainQuery(v)).toEqual({ q: "", rest: [] });
    });
    it("한글을 치는 도중의 낱자는 버린다 — 낱자뿐이면 묻지 않는다", () => {
        expect(splitMountainQuery("ㅅ")).toEqual({ q: "", rest: [] });
        expect(splitMountainQuery("설ㅇ")).toEqual({ q: "설", rest: [] });
        expect(splitMountainQuery("설악ㅅ")).toEqual({ q: "설악", rest: [] });
        expect(splitMountainQuery("백운산 ㅍ")).toEqual({ q: "백운산", rest: [] });
        expect(splitMountainQuery("ㅏ")).toEqual({ q: "", rest: [] });
    });
    it("한 글자부터 묻고, 서버가 자르는 길이(30자)에서 자른다 — 서버의 찾기는 이름에 그 글이 든 산이다", () => {
        expect(splitMountainQuery("설").q).toBe("설");
        expect(splitMountainQuery("가".repeat(50)).q).toHaveLength(MOUNTAIN_QUERY_MAX);
        const route = read("server/routes/modules/hiking.ts");
        expect(route).toContain(`const q = String(req.query.q ?? "").trim().toLowerCase().slice(0, ${MOUNTAIN_QUERY_MAX});`);
        expect(route).toContain("if (q) out = out.filter((m) => m.name.toLowerCase().includes(q));");
        expect(read("client/src/hiking/lib/api.ts")).toContain("export const mountainsKey = (q: Record<string, string>) => [`/api/hiq/hiking/mountains?${new URLSearchParams(q).toString()}`] as const;");
    });
    it("순서 — 이름이 같은 산, 그 글로 시작하는 산, 그 밖. 같은 무리에서는 받은 순서(명산 먼저 · 높은 순)를 지킨다", () => {
        const got = [mt({ name: "북한산" }), mt({ name: "남한산" }), mt({ name: "한라산" }), mt({ name: "한산" }), mt({ name: "한우산" }), mt({ name: "설악산" })];
        expect(pickMountainOptions(got, "한").map((m) => m.name)).toEqual(["한라산", "한산", "한우산", "북한산", "남한산"]);
        expect(pickMountainOptions(got, "한산").map((m) => m.name)).toEqual(["한산", "북한산", "남한산"]);
        expect(pickMountainOptions(got, " 한라산 ").map((m) => m.name)).toEqual(["한라산"]);
        expect(pickMountainOptions(got, "")).toEqual([]);
        expect(pickMountainOptions(got, "없는")).toEqual([]);
        // 넘긴 목록은 건드리지 않는다
        expect(got.map((m) => m.name)).toEqual(["북한산", "남한산", "한라산", "한산", "한우산", "설악산"]);
    });
    it("뒤의 낱말로 같은 이름의 산을 좁힌다 — 시도(짧은 이름 · 긴 이름) · 시군구 · 이름 어디에 들어도 된다", () => {
        const got = [baegunGwangyang, baegunPocheon, baegunWonju];
        expect(pickMountainOptions(got, "백운산", ["포천"])).toEqual([baegunPocheon]);
        expect(pickMountainOptions(got, "백운산", ["전남"])).toEqual([baegunGwangyang]);
        expect(pickMountainOptions(got, "백운산", ["강원특별자치도"])).toEqual([baegunWonju]);
        expect(pickMountainOptions(got, "백운산", ["강원", "원주"])).toEqual([baegunWonju]);
        expect(pickMountainOptions(got, "백운산", ["강원", "포천"])).toEqual([]);
        expect(pickMountainOptions([mt({ name: "오대산 노인봉" }), mt({ name: "오대산" })], "오대산", ["노인봉"]).map((m) => m.name)).toEqual(["오대산 노인봉"]);
    });
    it("찾은 뒤의 한 줄 — 한 번에 보이는 수보다 많으면 좁히는 법을, 서버가 다 주지 못했으면 이름을 더 적으라고", () => {
        expect(mountainFoundNote(1)).toBe("1곳을 찾았어요.");
        expect(mountainFoundNote(MOUNTAIN_OPTIONS_STEP)).toBe("8곳을 찾았어요.");
        expect(mountainFoundNote(MOUNTAIN_OPTIONS_STEP + 1)).toBe("9곳을 찾았어요. 이름 뒤에 시군을 적으면 좁혀져요(예: 백운산 포천).");
        expect(mountainFoundNote(1000, true)).toBe("1,000곳 넘게 찾았어요. 이름을 더 적어 보세요.");
    });
});

// 코스 셋 — 정상까지 오르는 길 · 원점 회귀 · 정상을 모르는 능선 길
const up: ActivityCourse = { id: "481-1", seq: 1, km: 7.1, gainM: 1370, loop: false, summitKm: 7.0 };
const loop: ActivityCourse = { id: "481-2", seq: 2, km: 12.34, gainM: 905, loop: true, summitKm: 6.1 };
const ridge: ActivityCourse = { id: "481-3", seq: 3, km: 3, gainM: 0, loop: false, summitKm: null };

describe("코스 고르기 — 상세 내용에 적는 한 줄", () => {
    it("칩은 산 화면의 코스 줄과 같은 글 — 번호 · 거리", () => {
        expect(activityCourseChip(up)).toBe("코스 1 · 7.1km");
        expect(activityCourseChip(loop)).toBe("코스 2 · 12.3km");
        expect(activityCourseChip(ridge)).toBe("코스 3 · 3km");
        expect(read("client/src/hiking/pages/MountainPage.tsx")).toContain("코스 {x.seq} · {courseFacts(x).km}");
    });
    it("한 줄 — 번호 · 길의 모양 · 거리 · 오르막 · 걷는 시간(어림)", () => {
        expect(activityCourseLine(up)).toBe("코스 1 · 정상까지 · 7.1km · 오르막 1,370m · 걷는 시간 약 4시간 5분(어림)");
        expect(activityCourseLine(loop)).toBe("코스 2 · 원점 회귀 · 12.3km · 오르막 905m · 걷는 시간 약 4시간 35분(어림)");
        expect(activityCourseLine(ridge)).toBe("코스 3 · 능선 · 둘레 길 · 3km · 오르막 0m · 걷는 시간 약 45분(어림)");
        expect(activityCourseLine({ ...up, summitKm: 0.4 })).toContain(" · 정상에서 내려오는 길 · ");
        expect(activityCourseLine({ ...up, summitKm: 3.5 })).toContain(" · 정상을 지나는 길 · ");
        // 숫자와 길의 모양은 산 화면의 셈 그대로다(따로 짓지 않는다) — 걷는 시간이 어림이라는 말도 산 화면과 같다
        for (const c of [up, loop, ridge]) {
            const f = courseFacts(c);
            expect(activityCourseLine(c)).toBe(`코스 ${c.seq} · ${courseShape(c)} · ${f.km} · 오르막 ${f.gain} · 걷는 시간 ${f.time}(어림)`);
        }
        expect(COURSE_TIME_NOTE).toContain("어림");
        expect(ACTIVITY_MOUNTAIN_COPY.courseFilled).toContain(COURSE_TIME_NOTE);
    });
    it("그 줄은 정모의 서버 필터를 그대로 지난다(가려지거나 거절되지 않는다)", () => {
        for (const c of [up, loop, ridge]) {
            const body = { title: "설악산 산행", description: activityCourseLine(c) };
            const r = screenCrewBody(body, ["title", "description", "locationName", "cost"] as const);
            expect(r.ok, body.description).toBe(true);
            if (r.ok) expect(r.value.fields).toEqual(body);
        }
    });
    it("받은 코스 걸러 읽기 — 여섯 가지만 옮긴다(길의 선은 들고 있지 않는다). 번호 · 거리가 어긋난 줄은 뺀다", () => {
        const raw = { id: "481-1", seq: 1, km: 7.1, gainM: 1370, lossM: 12, minM: 200, maxM: 1708, loop: false, summitKm: 7.0, line: [[38.1, 128.4, 200]], via: null, evil: "<script>" };
        expect(toActivityCourse(raw)).toEqual(up);
        expect(Object.keys(toActivityCourse(raw)!).sort()).toEqual(["gainM", "id", "km", "loop", "seq", "summitKm"]);
        for (const bad of [null, undefined, "코스", 3, [], [raw], { ...raw, id: "" }, { ...raw, id: null }, { ...raw, id: "가".repeat(MOUNTAIN_SLUG_MAX + 1) }, { ...raw, seq: 0 }, { ...raw, seq: 1.5 }, { ...raw, seq: "1" },
            { ...raw, km: 0 }, { ...raw, km: -1 }, { ...raw, km: "7.1" }, { ...raw, km: NaN }, { ...raw, km: Infinity }]) {
            expect(toActivityCourse(bad), JSON.stringify(bad)).toBeNull();
        }
        // 곁의 값이 어긋나면 그 값만 비운다(코스는 고를 수 있다)
        expect(toActivityCourse({ ...raw, gainM: "많다", loop: "yes", summitKm: -3 })).toEqual({ ...up, gainM: 0, loop: false, summitKm: null });
        expect(toActivityCourse({ ...raw, gainM: 1369.6 })?.gainM).toBe(1370);
        expect(toActivityCourse({ ...raw, id: 4811 })?.id).toBe("4811");
    });
    it("산 한 곳의 답 읽기 — 그 산과 코스들. 같은 코스가 두 번 오면 한 번만(형제 key), 상한까지만", () => {
        const one = { id: "481-1", seq: 1, km: 7.1, gainM: 1370, loop: false, summitKm: 7.0, line: [[38.1, 128.4, 200]] };
        const two = { id: "481-2", seq: 2, km: 12.34, gainM: 905, loop: true, summitKm: 6.1, line: [] };
        const res = { id: "Q1", slug: "설악산", name: "설악산", heightM: 1708, sido: "강원특별자치도", sigungu: "양양군", lists: ["kfs100"], courseList: [one, { ...one, km: 99 }, null, two, { id: 3 }] };
        expect(readMountainDetail(res)).toEqual({ mountain: seorak, courses: [up, loop] });
        for (const bad of [null, undefined, "x", 3, [], {}, { courseList: "x" }]) expect(readMountainDetail(bad), JSON.stringify(bad)).toEqual({ mountain: null, courses: [] });
        // 산의 꼴이 어긋나도 코스는 읽고, 코스가 없어도 산은 읽는다(고치기 창이 '고른 산'을 되살릴 때 쓴다)
        expect(readMountainDetail({ courseList: [one] })).toEqual({ mountain: null, courses: [up] });
        expect(readMountainDetail({ ...res, courseList: undefined })).toEqual({ mountain: seorak, courses: [] });
        const many = Array.from({ length: ACTIVITY_COURSES_MAX + 5 }, (_, i) => ({ ...one, id: `c-${i}`, seq: i + 1 }));
        expect(readMountainDetail({ ...res, courseList: many }).courses).toHaveLength(ACTIVITY_COURSES_MAX);
        expect(ACTIVITY_COURSES_STEP).toBeLessThan(ACTIVITY_COURSES_MAX);
    });
    it("상세 내용이 비어 있을 때만 적는다 — 빈칸뿐이어도 빈 것이다", () => {
        const line = activityCourseLine(up);
        for (const now of ["", "   ", "\n", null, undefined]) expect(fillCourseLine(now, line, null), JSON.stringify(now)).toEqual({ description: line, filled: true });
    });
    it("우리가 앞서 적은 줄 그대로면 새 코스의 줄로 바꾼다", () => {
        const a = activityCourseLine(up), b = activityCourseLine(loop);
        expect(fillCourseLine(a, b, a)).toEqual({ description: b, filled: true });
        expect(fillCourseLine(` ${a}\n`, b, a)).toEqual({ description: b, filled: true });
    });
    it("회원이 적은 글은 건드리지 않는다 — 우리 줄에 한 글자라도 보탰으면 회원의 글이다", () => {
        const a = activityCourseLine(up), b = activityCourseLine(loop);
        expect(fillCourseLine("오색 주차장에서 모여요", a, null)).toEqual({ description: "오색 주차장에서 모여요", filled: false });
        expect(fillCourseLine(`${a}\n아이젠 챙기기`, b, a)).toEqual({ description: `${a}\n아이젠 챙기기`, filled: false });
        // 회원이 손수 같은 글을 적어 둔 것도 우리 것이 아니다(우리가 적은 적이 없다 — 고치기 창에서 다시 연 일정이 그렇다)
        expect(fillCourseLine(a, b, null)).toEqual({ description: a, filled: false });
    });
    it("고른 코스를 풀거나 산을 지우면 우리가 적은 줄만 비운다", () => {
        const a = activityCourseLine(up);
        expect(clearCourseLine(a, a)).toBe("");
        expect(clearCourseLine(`${a} `, a)).toBe("");
        expect(clearCourseLine(`${a}\n아이젠 챙기기`, a)).toBe(`${a}\n아이젠 챙기기`);
        expect(clearCourseLine("오색 주차장에서 모여요", a)).toBe("오색 주차장에서 모여요");
        expect(clearCourseLine(a, null)).toBe(a);
        expect(clearCourseLine(null, a)).toBe("");
    });
    it("코스 고르기(지우고 다시 고르기)를 이어 해도 회원의 글은 남는다", () => {
        const a = activityCourseLine(up), b = activityCourseLine(loop);
        // 코스 1 → 코스 2 로 바꾸고 → 산을 지운다: 칸은 처음처럼 빈다
        const first = fillCourseLine("", a, null);
        const second = fillCourseLine(first.description, b, a);
        expect(second).toEqual({ description: b, filled: true });
        expect(clearCourseLine(second.description, b)).toBe("");
        // 코스 1 을 적은 뒤 회원이 말을 보탰다 → 코스 2 를 골라도, 산을 지워도 그대로
        const mine = `${a}\n하산은 오색으로`;
        expect(fillCourseLine(mine, b, a).filled).toBe(false);
        expect(clearCourseLine(mine, a)).toBe(mine);
    });
});

describe("함께 정상 인증 — 사람 수만", () => {
    const route = read("server/routes/modules/crew.ts");

    it("셀 일정 — 고른 산이 있고 모이는 시각이 지난 일정만", () => {
        const now = Date.UTC(2026, 9, 13, 3);
        const at = (h: number) => new Date(now + h * 3600_000);
        expect(summitTogetherDue({ mountainSlug: "설악산", activityDate: at(-1) }, now)).toBe(true);
        expect(summitTogetherDue({ mountainSlug: "설악산", activityDate: at(0) }, now)).toBe(true);
        expect(summitTogetherDue({ mountainSlug: "설악산", activityDate: at(1) }, now)).toBe(false);
        expect(summitTogetherDue({ mountainSlug: "설악산", activityDate: at(-24 * 400).toISOString() }, now)).toBe(true);
        for (const mountainSlug of [null, undefined, "", "  ", "설악산 양양"]) expect(summitTogetherDue({ mountainSlug, activityDate: at(-1) }, now), String(mountainSlug)).toBe(false);
        for (const activityDate of [null, undefined, "언젠가"]) expect(summitTogetherDue({ mountainSlug: "설악산", activityDate }, now), String(activityDate)).toBe(false);
    });
    it("칩의 글 — 한 명부터. 0 · 없는 값 · 어긋난 값은 빈 글(칩을 그리지 않는다)", () => {
        // 한 명이면 싣지 않는다 — 참석자가 한 명뿐인 일정에서는 수가 곧 그 사람이다(함께 오른 산과 같은 기준: 둘 이상)
        expect(SUMMIT_TOGETHER_MIN).toBe(2);
        expect(summitTogetherText(1)).toBe("");
        expect(summitTogetherText(2)).toBe("함께 정상 인증 2명");
        expect([0, 1, 1.9, 2, 7, NaN, undefined, "4"].map(summitTogetherCount)).toEqual([0, 0, 0, 2, 7, 0, 0, 0]);
        expect(summitTogetherText(12)).toBe("함께 정상 인증 12명");
        expect(summitTogetherText(3.9)).toBe("함께 정상 인증 3명");
        for (const v of [0, -1, 0.5, NaN, Infinity, null, undefined, "3", [3], {}]) expect(summitTogetherText(v), String(v)).toBe("");
    });
    it("그날은 한국 날짜 — 정상 인증을 적을 때와 같은 셈(kstDay)으로 맞춘다", () => {
        // 한국 10/18 07:00 에 모이는 일정은 UTC 로 10/17 22:00 이다 — 인증은 10/18 의 것을 센다
        expect(kstDay(new Date("2026-10-17T22:00:00.000Z"))).toBe("2026-10-18");
        expect(route).toContain("if (m) keys.push({ activityId: a.id, mountainId: m.id, day: kstDay(a.activityDate) });");
        expect(read("server/storage/hikingStamps.ts")).toContain("${input.bucket}, ${kstDay(input.atMs)})");
    });
    it("세는 질의 — 일정 여러 개를 한 번에, 참석한 사람의 인증만, 같은 산 · 같은 날. 누구인지는 싣지 않는다", () => {
        const repo = read("server/storage/hikingStamps.ts");
        const fn = repo.slice(repo.indexOf("export async function activitySummitCounts"));
        expect(fn).toContain("select w.activity_id::text as activity_id, count(distinct s.member_id)::int as n");
        expect(fn).toContain("from (values ${wanted}) as w(activity_id, mountain_id, day)");
        expect(fn).toContain("join hiq_crew_activity_participants p on p.activity_id = w.activity_id and p.status = 'joined'");
        expect(fn).toContain("join hiking_summits s on s.member_id = p.member_id and s.mountain_id = w.mountain_id and s.day = w.day and s.verified");
        expect(fn).toContain("group by w.activity_id");
        // 한 번의 질의 — 일정마다 돌지 않는다. 셀 것이 없으면 묻지도 않는다. 표가 없으면 빈 값
        expect(fn.match(/await rows</g)).toHaveLength(1);
        expect(fn.indexOf("if (items.length === 0) return out;")).toBeLessThan(fn.indexOf("await rows<"));
        expect(fn).toContain("if (missingTable(e)) return out;");
        // 답은 일정 → 수뿐
        expect(fn).toContain("for (const x of r) out.set(String(x.activity_id), Number(x.n));");
        expect(fn).not.toMatch(/member_id as|name as|nickname|hiq_members/);
    });
    it("목록 — 산을 고른 지난 일정이 없으면(당구 · 골프 크루는 늘 그렇다) 아무것도 묻지 않고, 산악회일 때만 붙인다", () => {
        const fn = route.slice(route.indexOf("async function withSummitTogether"), route.indexOf("// GET /activities"));
        expect(fn).toContain("const due = activities.filter((a) => summitTogetherDue(a, now));");
        expect(fn.indexOf("if (due.length === 0) return activities;")).toBeGreaterThan(0);
        expect(fn.indexOf("if (due.length === 0) return activities;")).toBeLessThan(fn.indexOf("crewSportCategory"));
        expect(fn).toContain('if (await storage.crews.crewSportCategory(crewId) !== "HIKING") return activities;');
        expect(fn.match(/activitySummitCounts\(/g)).toHaveLength(1);
        expect(fn).toContain("{ ...a, summitTogether: summitTogetherCount(counts.get(a.id)) }");
        // 곁들이는 숫자 — 실패해도 목록은 그대로 나간다
        expect(fn).toContain("    } catch (e) {\n        console.error(\"[CrewActivities] 함께 정상 인증:\", e);\n        return activities;\n    }");
        // 답에 싣는 것은 수 하나 — 참석자의 인증 여부를 사람마다 싣지 않는다
        expect(fn).not.toMatch(/participants|memberId|member_id/);
        const get = route.slice(route.indexOf('router.get("/:id/activities"'), route.indexOf("const ACTIVITY_TEXT_KEYS"));
        expect(get.match(/sendSuccess\(res, await withSummitTogether\(req\.params\.id, (?:past|activities)\)\);/g)).toHaveLength(2);
    });
});

describe("화면의 글", () => {
    it("술 · 돈 · 내기를 권하거나 빠르기 · 밤 산행을 부추기는 말이 없다", () => {
        const all = JSON.stringify([
            ACTIVITY_MOUNTAIN_COPY, mountainFillNote(true), mountainFillNote(false), mountainFoundNote(3), mountainFoundNote(30), mountainFoundNote(1000, true), activityMountainTitle(seorak),
            activityCourseChip(up), activityCourseLine(up), activityCourseLine(loop), activityCourseLine(ridge), summitTogetherText(3),
        ]);
        expect(all).not.toMatch(/술|주점|포차|맥주|소주|막걸리|와인|뒤풀이|뒷풀이|회비|참가비|만\s*원|천\s*원|내기|베팅|도박|상금|빨리|빠르|기록 단축|최단|야간|밤|일출 전/);
        for (const v of Object.values(ACTIVITY_MOUNTAIN_COPY)) expect(v, v).toMatch(/[가-힣]/);
    });
    it("칸의 이름은 만들기 창의 것 그대로 — 상세 내용", () => {
        expect(read("client/src/lib/i18n/ko.ts")).toContain('"createActivity.descLabel": "상세 내용"');
        for (const v of [ACTIVITY_MOUNTAIN_COPY.courseAside, ACTIVITY_MOUNTAIN_COPY.courseFilled, ACTIVITY_MOUNTAIN_COPY.courseKept]) expect(v).toContain("상세 내용");
        expect(ACTIVITY_MOUNTAIN_COPY.link).toBe("산 정보 보기");
    });
});

/** 화면이 서버로 보내는 값의 열쇠 — `const payload = { … }` 의 줄 머리 */
const payloadKeys = (src: string): string[] => {
    const from = src.indexOf("const payload = {");
    return Array.from(src.slice(from, src.indexOf("};", from)).matchAll(/^\s+([A-Za-z]+)[,:]/gm), (x) => x[1]);
};
const PAYLOAD_KEYS = ["crewId", "title", "description", "locationName", "cost", "maxParticipants", "activityDate", "category", "sportCategory"];

describe("만들기 창(소스 고정) — 산 고르기는 산악회에만, 당구 · 골프의 칸은 그대로", () => {
    const dialog = read("client/src/components/hiq/CreateActivityDialog.tsx");
    const picker = read("client/src/hiking/crew/ActivityMountainPicker.tsx");
    const golf = read("client/src/components/hiq/club/activity/CreateGolfActivityModal.tsx");

    it("산악회일 때만 그린다 — 등산의 조각은 그때 불러 오고(lazy), 창은 등산의 파일을 타입으로만 안다", () => {
        expect(dialog).toContain('const ActivityMountainPicker = lazy(() => import("@/hiking/crew/ActivityMountainPicker").then((m) => ({ default: m.ActivityMountainPicker })));');
        expect(dialog).toContain("{hiking && (\n                            <Suspense fallback={");
        expect(dialog).toContain("<ActivityMountainPicker picked={pickedMountain} storedSlug={storedMountainSlug} read={readMountainFields} onFill={fillMountainFields} onRestore={setPickedMountain} readNote={readMountainNote} onNote={fillMountainNote} />");
        expect(dialog.match(/<ActivityMountainPicker\b/g)).toHaveLength(1);
        expect(dialog.match(/\{hiking && \(/g)).toHaveLength(1);
        // 등산의 파일을 곧바로 임포트하지 않는다(공용 묶음에 실린다) — shared/crewMountain 도 타입만
        expect(code(dialog)).not.toMatch(/^import .*from "@\/hiking/m);
        expect(dialog).toContain('import type { ActivityFields, PickedMountain } from "@shared/crewMountain";');
        expect(code(dialog).match(/from "@shared\/crewMountain"/g)).toHaveLength(1);
        expect(code(dialog)).not.toMatch(/hikingMountains|hikingMountainPath/);
    });
    it("자리는 '모이는 곳' 바로 위 — 날짜 · 시간 줄과 장소 줄 사이", () => {
        const at = dialog.indexOf("<ActivityMountainPicker picked=");
        expect(at).toBeGreaterThan(dialog.indexOf('name="time"'));
        expect(at).toBeLessThan(dialog.indexOf('name="locationName"'));
        expect(dialog.slice(at, dialog.indexOf('name="locationName"'))).toContain('<div className="grid grid-cols-[1.5fr_1fr] gap-4">');
    });
    it("고른 글은 창의 칸에만 들어간다 — 모이는 곳은 늘, 모임명은 바뀔 때만, 상세 내용은 조각이 정한 글로. 창이 다시 열리면 고른 산을 비운다", () => {
        expect(dialog).toContain('form.setValue("locationName", next.place, { shouldDirty: true });');
        expect(dialog).toContain('if (next.title !== (form.getValues("title") ?? "")) form.setValue("title", next.title, { shouldDirty: true, shouldValidate: next.title !== "" });');
        expect(dialog).toContain('const readMountainNote = (): string => form.getValues("description") ?? "";');
        expect(dialog).toContain('const fillMountainNote = (next: string) => form.setValue("description", next, { shouldDirty: true });');
        expect(dialog).toContain("        if (open) {\n            setPickedMountain(null);");
    });
    it("고른 산은 주소만 보낸다 — 산악회일 때만. 당구 크루로 가는 값은 예전 그대로다", () => {
        expect(dialog).toContain([
            "        const payload = {",
            "            crewId,",
            "            title: data.title,",
            "            description: data.description,",
            "            locationName: data.locationName,",
            "            cost: data.cost,",
            "            maxParticipants: Number(data.maxParticipants),",
            "            activityDate: dateTime.toISOString(),",
            "            category: data.category,",
            "            sportCategory: data.sportCategory",
            "        };",
        ].join("\n"));
        expect(payloadKeys(dialog)).toEqual(PAYLOAD_KEYS);
        // 산악회가 아니면 그 값 그대로(payload), 산악회면 주소 하나를 더한다(지웠으면 null)
        expect(dialog).toContain("const body = hiking ? { ...payload, mountainSlug: pickedMountain?.mountain.slug ?? storedMountainSlug } : payload;");
        // 만들기 · 고치기 두 요청이 다 그 값을 보낸다
        expect(dialog.match(/^ +body,$/gm)).toHaveLength(2);
        expect(code(dialog)).not.toMatch(/body: payload/);
        // 창이 아는 것은 주소 하나뿐 — 산의 이름 · 고른 코스는 보내지 않는다(코스는 상세 내용의 글로만 남는다)
        expect(code(dialog)).not.toMatch(/mountainName|mountainId|course/i);
    });
    it("고치기 창 — 저장해 둔 주소를 조각에 넘겨 '고른 산'을 되살린다. 되살리지 못해도 그 주소를 그대로 보낸다(다른 칸만 고쳐도 산이 지워지지 않는다)", () => {
        expect(dialog).toContain('setStoredMountainSlug(hiking && typeof initialData?.mountainSlug === "string" && initialData.mountainSlug ? initialData.mountainSlug : null);');
        // 산을 고르거나 지우면 저장해 둔 주소는 잊는다(지웠으면 null 이 간다)
        expect(dialog).toContain("        setPickedMountain(picked);\n        setStoredMountainSlug(null);");
        expect(picker).toContain("const restoreSlug = chosen ? null : activityMountainSlug(storedSlug);");
        expect(picker).toContain("if (restoredMountain) onRestore({ mountain: restoredMountain, titleOurs: false, restored: true });");
        // 되살린 산에는 '채웠어요'라고 말하지 않는다(아무 칸도 채우지 않았다)
        expect(picker).toContain("{picked?.restored ? COPY.restored : mountainFillNote(!!picked?.titleOurs)}");
        expect(picker).toContain('data-state={chosen ? "chosen" : restoring ? "restoring" : "search"}');
    });
    it("당구 크루의 칸은 그대로다 — 종류 고르기 · 비용 · 번역 열쇠. 새 번역 열쇠를 만들지 않았다", () => {
        expect(dialog.match(/\{!hiking && \(/g)).toHaveLength(2);
        expect(dialog).toContain("<BilliardsCategorySelector");
        expect(dialog).toContain('<LucideCoins className="w-3 h-3" /> {t("createActivity.costLabel")}');
        expect(dialog).toContain('{hiking ? t("createActivity.locationLabelHiking") : t("createActivity.locationLabel")}');
        expect(dialog).toContain('placeholder={hiking ? t("createActivity.locationPlaceholderHiking") : t("createActivity.locationPlaceholder")}');
        expect(dialog).toContain('placeholder={hiking ? t("createActivity.namePlaceholderHiking") : t("createActivity.namePlaceholder")}');
        expect(dialog).toContain('const blankTime = hiking ? "07:00" : "19:00";');
        const ko = read("client/src/lib/i18n/ko.ts");
        const keys = Array.from(new Set(Array.from(dialog.matchAll(/\bt\("([^"]+)"\)/g), (x) => x[1])));
        expect(keys.length).toBeGreaterThan(20);
        for (const k of keys) expect(ko, k).toContain(`"${k}": `);
        // 창에 새로 적은 한국어 글이 없다(등산의 글은 조각과 shared/crewMountain 에 있다)
        expect(code(dialog).replace(/\{\/\*[\s\S]*?\*\/\}/g, "")).not.toMatch(/[가-힣]/);
    });
    it("골프 크루의 만들기 창은 산 고르기를 모른다 — 보내는 값의 열쇠도 예전 그대로다", () => {
        expect(golf).not.toMatch(/crewMountain|ActivityMountainPicker|hiking|mountain/i);
        expect(payloadKeys(golf)).toEqual(PAYLOAD_KEYS);
        expect(golf.match(/body: payload,/g)).toHaveLength(2);
    });

    it("조각 — 구역 이름 · 시험용 이름 · 고르는 줄의 역할", () => {
        expect(picker).toContain('data-track-as="hiking-activity-mountain"');
        expect(picker).toContain('data-testid="activity-mountain-search"');
        expect(picker).toContain("data-testid={`activity-mountain-option-${m.slug}`}");
        expect(picker).toContain('data-testid="activity-mountain-chosen"');
        expect(picker).toContain('role="combobox" aria-autocomplete="list"');
        expect(picker).toContain('role="listbox"');
        expect(picker).toContain('role="option" aria-selected={i === active}');
        // 형제 key 는 산의 주소 — 받은 답에서 겹치는 주소는 이미 뺐다(readMountainSearch)
        expect(picker).toContain("key={m.slug}");
    });
    it("조각은 만들기 창의 form 안에 있다 — Enter 가 일정을 올리지 않고, 단추는 전부 type=\"button\" 이다", () => {
        expect(picker).toContain('if (e.key === "Enter") {');
        const enter = picker.slice(picker.indexOf('if (e.key === "Enter") {'));
        expect(enter.indexOf("e.preventDefault();")).toBeLessThan(enter.indexOf("isComposing"));
        expect(enter).toContain("if (e.nativeEvent.isComposing || e.keyCode === 229) return;");
        // 고른 산 지우기 · 코스 칩 · 코스 더 보기 · 산 더 보기
        expect(code(picker).match(/<button\b/g)).toHaveLength(4);
        expect(code(picker).match(/type="button"/g)).toHaveLength(4);
        expect(code(picker)).not.toMatch(/type="submit"|<form\b/);
    });
    it("찾기 · 산 한 곳 읽기는 공개 주소에 그때그때 묻는다 — 기기에 일주일 남는 조회 캐시를 거치지 않는다(한 글자 검색의 답이 산 천 곳, 산 한 곳의 답에는 코스의 선이 통째로 있다)", () => {
        expect(picker).toContain("apiRequest(mountainsKey({ q })[0], { signal: ctl.signal })");
        expect(picker).toContain("}, MOUNTAIN_SEARCH_WAIT_MS);");
        expect(picker).toContain("return () => { clearTimeout(timer); ctl.abort(); };");
        expect(picker).toContain("apiRequest(mountainKey(detailSlug)[0], { signal: ctl.signal })");
        expect(picker).toContain("return () => ctl.abort();");
        expect(read("client/src/hiking/lib/api.ts")).toContain("export const mountainKey = (slug: string) => [`/api/hiq/hiking/mountains/${encodeURIComponent(slug)}`] as const;");
        expect(code(picker)).toContain('import { apiRequest } from "@/lib/queryClient";');
        expect(code(picker)).not.toMatch(/useQuery|useInfiniteQuery|@tanstack|\bqueryClient[.,\s}]|localStorage|sessionStorage/);
        expect(read("client/src/lib/queryClient.ts")).toContain("maxAge: 1000 * 60 * 60 * 24 * 7");
        // 받은 답에서 칩에 쓸 값만 추린다 — 코스의 선은 들고 있지 않는다
        expect(picker).toContain('setDetail({ slug: detailSlug, state: "done", ...readMountainDetail(res) });');
        expect(code(picker)).not.toMatch(/courseList|LinePoint/);
    });
    it("채우는 셈은 shared/crewMountain 의 것 — 조각이 따로 글을 짓지 않는다", () => {
        expect(picker).toContain("const next = fillFromMountain(read(), m);");
        expect(picker).toContain("onFill(next.fields, next.picked);");
        expect(picker).toContain("onFill(clearFromMountain(read(), picked), null);");
    });
    it("코스 고르기 — 고르면 상세 내용에 한 줄, 다시 누르면 푼다. 산을 지우면 그 줄도(우리가 적은 그대로일 때만)", () => {
        expect(picker).toContain("const line = activityCourseLine(c);");
        expect(picker).toContain("const next = fillCourseLine(readNote(), line, course?.line ?? null);");
        expect(picker).toContain("if (next.filled) writeNote(next.description);");
        expect(picker).toContain("setCourse(next.filled ? { id: c.id, line } : null);");
        expect(picker).toContain("setCourseKept(!next.filled);");
        expect(picker.match(/writeNote\(clearCourseLine\(readNote\(\), course\.line\)\);/g)).toHaveLength(2);
        // 칸의 글이 바뀔 때만 창에 넘긴다
        expect(picker).toContain("const writeNote = (next: string) => { if (next !== readNote()) onNote(next); };");
        // 칩 — 산 화면과 같은 글, 눌린 표시, 형제 key 는 코스의 id(겹치는 id 는 이미 뺐다 — readMountainDetail)와 '더 보기' 하나
        expect(picker).toContain("{activityCourseChip(c)}");
        expect(picker).toContain("aria-pressed={course?.id === c.id}");
        expect(picker).toContain("<li key={`course-${c.id}`}>");
        expect(picker.match(/<li key="more">/g)).toHaveLength(1);
        expect(picker).toContain("data-testid={`activity-mountain-course-${c.id}`}");
        // 코스가 있는 산에서만 그린다. 산이 바뀌면 고른 코스를 잊는다
        expect(picker).toContain("{courses.length > 0 && (");
        expect(picker).toContain("useEffect(() => { setCourse(null); setCourseKept(false); setAllCourses(false); }, [chosenSlug]);");
        expect(picker).toContain("{course ? COPY.courseFilled : COPY.courseKept}");
    });
    it("등산의 색 · 글자 규칙 — 리터럴 색, 12px 이상, semibold 까지, 번역 열쇠 · 다른 종목의 그림 없음", () => {
        expect(code(picker)).not.toMatch(/\b(?:bg|text|border|ring)-(?:white|black|surface-\d|ink-\d|brand)\b/);
        const sizes = Array.from(picker.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g), (x) => Number(x[1]));
        expect(sizes.length).toBeGreaterThan(5);
        expect(sizes.every((n) => n >= 12)).toBe(true);
        expect(code(picker)).not.toMatch(/\btext-(?:xs|sm|\[1[01](?:\.\d+)?px\])/);
        expect(code(picker)).not.toMatch(/font-(?:bold|extrabold|black)\b/);
        expect(code(picker)).not.toMatch(/\bt\(["'`]|useT\b/);
        expect(code(picker)).not.toMatch(/golfStamp|InkStamp|볼마커|MarkerArt|sim\/|TierEmblem|@\/golf\//);
        expect(code(picker)).not.toMatch(/술|막걸리|뒤풀이|회비|내기|빨리|야간/);
        // 조각에 적은 한국어 글이 없다 — 글은 전부 shared/crewMountain(ACTIVITY_MOUNTAIN_COPY · 셈)에 있다
        expect(code(picker).replace(/\{\/\*[\s\S]*?\*\/\}/g, "")).not.toMatch(/[가-힣]/);
    });
});

describe("일정 카드(소스 고정) — '산 정보 보기'와 '함께 정상 인증'은 산악회 일정에만", () => {
    const list = read("client/src/components/hiq/view/ClubActivityList.tsx");
    const picker = read("client/src/hiking/crew/ActivityMountainPicker.tsx");

    it("카드는 등산의 조각을 불러 그린다 — 산악회이고 고른 산이 있을 때만", () => {
        expect(list).toContain('const ActivityMountainMarks = lazy(() => import("@/hiking/crew/ActivityMountainPicker").then((m) => ({ default: m.ActivityMountainMarks })));');
        expect(list).toContain("{hiking && activity.mountainSlug && (");
        expect(list).toContain("<ActivityMountainMarks slug={activity.mountainSlug} together={activity.summitTogether} />");
        // 자리는 카드의 글(시각 · 장소 · 설명) 아래, 참석자 줄 위
        const at = list.indexOf("{hiking && activity.mountainSlug && (");
        expect(at).toBeGreaterThan(list.indexOf("{activity.description && ("));
        expect(at).toBeLessThan(list.indexOf('aria-label={`${t("clubActivityListView.attendLabel")} ${countText}`}'));
    });
    it("지난 일정의 줄에는 칩만 — 줄이 통째로 단추라 링크를 두지 않는다. 한 명도 없으면 조각을 부르지도 않는다", () => {
        expect(list).toContain("<PastRow key={a.id} activity={a} hiking={sportType === 'HIKING'} onShowPeople={() => setPeopleOf(a)} />");
        expect(list).toContain("{hiking && Number(activity.summitTogether) >= 1 && (");
        expect(list).toContain("<ActivityMountainMarks together={activity.summitTogether} />");
        expect(list.match(/<ActivityMountainMarks\b/g)).toHaveLength(2);
    });
    it("공용 카드는 등산의 파일을 곧바로 임포트하지 않고, 등산의 글 · 주소 짓기를 모른다. 새 번역 열쇠도 없다", () => {
        expect(code(list)).not.toMatch(/^import .*from "@\/hiking/m);
        expect(code(list)).not.toMatch(/crewMountain|hikingMountains|hikingMountainPath|summitTogetherText/);
        expect(code(list).replace(/\{\/\*[\s\S]*?\*\/\}/g, "")).not.toMatch(/[가-힣]/);
        const ko = read("client/src/lib/i18n/ko.ts");
        const keys = Array.from(new Set(Array.from(list.matchAll(/\bt\("([^"]+)"\)/g), (x) => x[1])));
        expect(keys.length).toBeGreaterThan(40);
        for (const k of keys) expect(ko, k).toContain(`"${k}": `);
    });
    it("당구 · 골프의 카드는 그대로다 — 등산의 줄은 hiking 일 때만 그려지고, 지도 · 비용 · 팀 편성은 예전 줄 그대로", () => {
        expect(list).toContain("const hiking = sportType === 'HIKING';");
        expect(list.match(/\{hiking && /g)).toHaveLength(2);
        expect(list).toContain("href={mapLink({ name: activity.locationName, address: activity.locationName })}");
        expect(list).toContain('<span className="text-ink-3">{t("clubActivityListView.costLabel")}</span> {activity.cost}');
        expect(list.match(/\{canManage && !hiking && /g)).toHaveLength(2);
    });
    it("조각 — 링크는 그 산의 화면으로(구역 이름 · 시험용 이름), 칩은 한 명부터. 받는 것은 주소와 수뿐이다", () => {
        const marks = picker.slice(picker.indexOf("export function ActivityMountainMarks"));
        expect(marks).toContain("export function ActivityMountainMarks({ slug, together }: { slug?: string | null; together?: unknown }) {");
        expect(marks).toContain('<Link href={hikingMountainPath(to)} data-track-as="hiking-activity-mountain-link" data-testid="activity-mountain-link"');
        expect(marks).toContain("{COPY.link}");
        expect(marks).toContain('data-testid="activity-summit-together"');
        expect(marks).toContain("const to = activityMountainSlug(slug);");
        expect(marks).toContain("const count = summitTogetherText(together);");
        expect(marks).toContain("if (!to && !count) return null;");
        expect(hikingMountainPath("백운산-포천")).toBe(`/hiking/mountains/${encodeURIComponent("백운산-포천")}`);
        // 사람을 그리지 않는다 — 이름 · 사진 · 참석자 목록을 받지 않는다
        expect(code(marks)).not.toMatch(/participants|member|avatar|\.name\b/i);
    });
});

describe("저장(소스 고정) — 고른 산의 주소는 산악회의 일정에만 남는다", () => {
    const route = read("server/routes/modules/crew.ts");
    const schema = read("shared/schema.ts");

    it("일정 표에 산의 주소 한 칸 — 글자 칸 하나를 더하기만 하는 이관이다", () => {
        const from = schema.indexOf('export const hiqCrewActivities = pgTable("hiq_crew_activities", {');
        expect(from).toBeGreaterThan(-1);
        const table = schema.slice(from, schema.indexOf("});", from));
        expect(table).toContain('  mountainSlug: text("mountain_slug"),');
        // 산에 닿는 칸은 그 하나뿐이고, 자유 칸 · 링크 칸은 여전히 없다(설명 끝에 붙여 두는 길도 쓰지 않는다)
        const columns = table.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
        expect(columns.match(/mountain/gi)).toHaveLength(2);
        expect(columns).not.toMatch(/jsonb\(|meta|url|link/i);
        expect(hiqCrewActivities.mountainSlug.name).toBe("mountain_slug");
        expect(hiqCrewActivities.mountainSlug.notNull).toBe(false);
        expect(hiqCrewActivities.mountainSlug.hasDefault).toBe(false);
        const sql = read("migrations/crew_activity_mountain.sql").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
        expect(sql).toEqual(["alter table hiq_crew_activities add column if not exists mountain_slug text;"]);
    });
    it("insert 스키마가 이 열쇠를 알게 됐다 — 그래서 만들기 라우트가 산악회가 아니면 꼭 비운다", () => {
        expect(schema).toContain("export const insertHiqCrewActivitySchema = createInsertSchema(hiqCrewActivities).omit({ id: true, createdAt: true });");
        const base = { crewId: "c0000000-0000-4000-8000-000000000001", creatorId: "00000000-0000-4000-8000-000000000001", title: "정모", activityDate: new Date("2026-10-18T22:00:00.000Z") };
        const parsed = insertHiqCrewActivitySchema.safeParse({ ...base, mountainSlug: "설악산" });
        expect(parsed.success && parsed.data.mountainSlug).toBe("설악산");
        expect(insertHiqCrewActivitySchema.safeParse({ ...base, mountainSlug: null }).success).toBe(true);
        expect(insertHiqCrewActivitySchema.safeParse(base).success).toBe(true);
        // 화면이 보낸 값(...req.body)이 그대로 지나가지 않게 — 종목을 정한 뒤, 검사(safeParse) 앞에서 서버가 정한다
        const post = route.slice(route.indexOf('router.post("/:id/activities"'), route.indexOf('router.post("/:id/activities/:activityId/join"'));
        expect(post).toContain([
            '    data.mountainSlug = crewSport === "HIKING"',
            '        ? await activityMountainSlugOf(req.body.mountainSlug).catch((e) => { console.error("[CrewActivities] 고른 산 확인:", e); return null; })',
            "        : null;",
        ].join("\n"));
        expect(post.indexOf("const crewSport = await storage.crews.crewSportCategory(req.params.id);")).toBeGreaterThan(0);
        expect(post.indexOf("const crewSport = await storage.crews.crewSportCategory(req.params.id);")).toBeLessThan(post.indexOf("data.mountainSlug = "));
        expect(post.indexOf("data.mountainSlug = ")).toBeLessThan(post.indexOf("const validation = insertHiqCrewActivitySchema.safeParse(data);"));
        expect(code(post).match(/mountainSlug/g)).toHaveLength(2);
    });
    it("주소는 꼴을 보고(shared/crewMountain) 있는 산인지 본다(mountainBySlug) — 둘 다 맞아야 적는다", () => {
        expect(route).toContain('import { activityMountainSlug, summitTogetherCount, summitTogetherDue } from "../../../shared/crewMountain.js";');
        expect(route).toContain('import { mountainBySlug } from "../../storage/hiking.js";');
        const fn = route.slice(route.indexOf("async function activityMountainSlugOf"), route.indexOf("async function withSummitTogether"));
        expect(fn).toContain("const slug = activityMountainSlug(raw);");
        expect(fn).toContain("if (!slug) return null;");
        expect(fn).toContain("const m = await mountainBySlug(slug);");
        expect(fn).toContain("return m ? m.slug : null;");
        // 부르는 곳은 산악회 갈래 둘(만들기 · 고치기)뿐
        expect(code(route).match(/activityMountainSlugOf\(/g)).toHaveLength(3);
    });
    it("고치기 — 산악회의 일정만 받는다. 보내지 않으면 그대로, null · 없는 산이면 지운다. 당구 · 골프 크루는 보내도 건드리지 않는다", () => {
        const patch = route.slice(route.indexOf('router.patch("/:id/activities/:activityId"'), route.indexOf('router.delete("/:id/activities/:activityId"'));
        expect(patch).toContain('if (req.body.mountainSlug !== undefined && await storage.crews.crewSportCategory(req.params.id) === "HIKING") {');
        expect(patch).toContain("try { updateData.mountainSlug = await activityMountainSlugOf(req.body.mountainSlug); }");
        expect(patch.match(/updateData\.mountainSlug/g)).toHaveLength(1);
        // 고칠 값은 열쇠마다 손으로 옮긴다(...req.body 를 쓰지 않는다) — 그래서 다른 길로는 이 칸에 닿지 않는다
        expect(code(patch)).not.toMatch(/\.\.\.req\.body/);
        expect(read("server/storage/crew.repo.ts")).toContain("        mountainSlug: string | null;\n    }>) {");
    });
    it("읽기는 칸이 아직 없는 DB 에서도 버틴다 — 그 칸만 빼고 다시 읽어 산 없는 일정으로 돌려준다", () => {
        const repo = read("server/storage/crew.repo.ts");
        expect(repo).toContain('const missingMountainColumn = (e: any) => (e?.code ?? e?.cause?.code) === "42703" && /mountain_slug/.test(`${e?.message ?? ""} ${e?.cause?.message ?? ""}`);');
        expect(repo).toContain("const { mountainSlug: _activityMountainSlug, ...ACTIVITY_COLUMNS_BEFORE_MOUNTAIN } = ACTIVITY_COLUMNS;");
        expect(repo).toContain("        if (!missingMountainColumn(e)) throw e;");
        expect(repo).toContain("return before.map((a) => ({ ...a, mountainSlug: null }));");
        // 다가오는 목록 · 지난 목록 · 한 줄 읽기
        expect(repo.match(/await readActivityRows\(\(cols\) => db\.select\(cols\)\.from\(hiqCrewActivities\)/g)).toHaveLength(3);
    });
});
