import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    ACTIVITY_MOUNTAIN_COPY, MOUNTAIN_NAME_MAX, MOUNTAIN_OPTIONS_STEP, MOUNTAIN_QUERY_MAX, MOUNTAIN_SLUG_MAX,
    activityMountainPlace, activityMountainTitle, clearFromMountain, fillFromMountain, mountainFillNote, mountainFoundNote, mountainOptionLabels, mountainOptionWhere,
    pickMountainOptions, readMountainSearch, splitMountainQuery, toActivityMountain, type ActivityMountain,
} from "./crewMountain";
import { hikingList, hikingMountainPath } from "./hikingMountains";
import { mapLink } from "./storeMeta";
import { screenCrewBody } from "../server/utils/crewModeration.js";

// 산악회 일정의 '산 고르기'(2026-10-13) — 고르면 모이는 곳과 비어 있는 모임명이 채워진다. 당구 · 골프 크루의 만들기 창은 그대로여야 한다.
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

describe("받은 값 걸러 읽기(toActivityMountain) — 칸이 생기면 서버의 검사로도 쓴다", () => {
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

describe("화면의 글", () => {
    it("술 · 돈 · 내기를 권하거나 빠르기 · 밤 산행을 부추기는 말이 없다", () => {
        const all = JSON.stringify([ACTIVITY_MOUNTAIN_COPY, mountainFillNote(true), mountainFillNote(false), mountainFoundNote(3), mountainFoundNote(30), mountainFoundNote(1000, true), activityMountainTitle(seorak)]);
        expect(all).not.toMatch(/술|주점|포차|맥주|소주|막걸리|와인|뒤풀이|뒷풀이|회비|참가비|만\s*원|천\s*원|내기|베팅|도박|상금|빨리|빠르|기록 단축|최단|야간|밤|일출 전/);
        for (const v of Object.values(ACTIVITY_MOUNTAIN_COPY)) expect(v, v).toMatch(/[가-힣]/);
    });
});

describe("만들기 창(소스 고정) — 산 고르기는 산악회에만, 당구 · 골프의 칸은 그대로", () => {
    const dialog = read("client/src/components/hiq/CreateActivityDialog.tsx");
    const picker = read("client/src/hiking/crew/ActivityMountainPicker.tsx");

    it("산악회일 때만 그린다 — 등산의 조각은 그때 불러 오고(lazy), 창은 등산의 파일을 타입으로만 안다", () => {
        expect(dialog).toContain('const ActivityMountainPicker = lazy(() => import("@/hiking/crew/ActivityMountainPicker").then((m) => ({ default: m.ActivityMountainPicker })));');
        expect(dialog).toContain("{hiking && (\n                            <Suspense fallback={");
        expect(dialog).toContain("<ActivityMountainPicker picked={pickedMountain} read={readMountainFields} onFill={fillMountainFields} />");
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
    it("고른 글은 창의 두 칸에만 들어간다 — 모이는 곳은 늘, 모임명은 바뀔 때만. 창이 다시 열리면 고른 산을 비운다", () => {
        expect(dialog).toContain('form.setValue("locationName", next.place, { shouldDirty: true });');
        expect(dialog).toContain('if (next.title !== (form.getValues("title") ?? "")) form.setValue("title", next.title, { shouldDirty: true, shouldValidate: next.title !== "" });');
        expect(dialog).toContain("        if (open) {\n            setPickedMountain(null);");
    });
    it("고른 산은 보내지 않는다 — 서버로 가는 값은 예전 그대로다", () => {
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
        expect(code(dialog)).not.toMatch(/mountainSlug|mountainName/);
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
    it("골프 크루의 만들기 창은 산 고르기를 모른다", () => {
        expect(read("client/src/components/hiq/club/activity/CreateGolfActivityModal.tsx")).not.toMatch(/crewMountain|ActivityMountainPicker|hiking/i);
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
        expect(code(picker).match(/<button\b/g)).toHaveLength(2);
        expect(code(picker).match(/type="button"/g)).toHaveLength(2);
        expect(code(picker)).not.toMatch(/type="submit"|<form\b/);
    });
    it("찾기는 공개 목록에 그때그때 묻는다 — 기기에 일주일 남는 조회 캐시를 거치지 않는다(한 글자 검색의 답이 산 천 곳이다)", () => {
        expect(picker).toContain("apiRequest(mountainsKey({ q })[0], { signal: ctl.signal })");
        expect(picker).toContain("}, MOUNTAIN_SEARCH_WAIT_MS);");
        expect(picker).toContain("return () => { clearTimeout(timer); ctl.abort(); };");
        expect(code(picker)).toContain('import { apiRequest } from "@/lib/queryClient";');
        expect(code(picker)).not.toMatch(/useQuery|useInfiniteQuery|@tanstack|\bqueryClient[.,\s}]|localStorage|sessionStorage/);
        expect(read("client/src/lib/queryClient.ts")).toContain("maxAge: 1000 * 60 * 60 * 24 * 7");
    });
    it("채우는 셈은 shared/crewMountain 의 것 — 조각이 따로 글을 짓지 않는다", () => {
        expect(picker).toContain("const next = fillFromMountain(read(), m);");
        expect(picker).toContain("onFill(next.fields, next.picked);");
        expect(picker).toContain("onFill(clearFromMountain(read(), picked), null);");
    });
    it("등산의 색 · 글자 규칙 — 리터럴 색, 12px 이상, semibold 까지, 번역 열쇠 · 다른 종목의 그림 없음", () => {
        expect(code(picker)).not.toMatch(/\b(?:bg|text|border|ring)-(?:white|black|surface-\d|ink-\d|brand)\b/);
        const sizes = Array.from(picker.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g), (x) => Number(x[1]));
        expect(sizes.length).toBeGreaterThan(5);
        expect(sizes.every((n) => n >= 12)).toBe(true);
        expect(code(picker)).not.toMatch(/\btext-(?:xs|\[1[01](?:\.\d+)?px\])/);
        expect(code(picker)).not.toMatch(/font-(?:bold|extrabold|black)\b/);
        expect(code(picker)).not.toMatch(/\bt\(["'`]|useT\b/);
        expect(code(picker)).not.toMatch(/golfStamp|InkStamp|볼마커|MarkerArt|sim\/|TierEmblem|@\/golf\//);
        expect(code(picker)).not.toMatch(/술|막걸리|뒤풀이|회비|내기|빨리|야간/);
    });
});

describe("저장(소스 고정) — 고른 산은 일정에 남지 않는다", () => {
    it("일정 표에 산을 적을 칸이 없다 — 칸이 생기면 toActivityMountain 으로 서버 검사를 걸고, 카드에 '산 정보 보기'를 달고, 이 시험을 고친다", () => {
        const schema = read("shared/schema.ts");
        const from = schema.indexOf('export const hiqCrewActivities = pgTable("hiq_crew_activities", {');
        expect(from).toBeGreaterThan(-1);
        const table = schema.slice(from, schema.indexOf("});", from));
        expect(table).not.toMatch(/mountain|jsonb\(|meta|url|link/i);
        // 서버의 정모 라우트도 산을 모른다(모르는 열쇠는 insert 스키마가 떨어뜨린다)
        const route = read("server/routes/modules/crew.ts");
        expect(route).toContain("const validation = insertHiqCrewActivitySchema.safeParse(data);");
        expect(code(route)).not.toMatch(/crewMountain|mountainSlug/);
        expect(schema).toContain("export const insertHiqCrewActivitySchema = createInsertSchema(hiqCrewActivities).omit({ id: true, createdAt: true });");
    });
});
