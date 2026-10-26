import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    HIKING_GROUPS, HIKING_LISTS, HIKING_REGIONS, ISLAND_SIGUNGU, assignMountainSlugs, heightText, hikingGroup, hikingListPath, hikingMountainPath, hikingRegionOf, hikingTraits, duplicateNames, mountainLabel,
    inHikingGroup, mountainPlace, sigunguShort,
} from "./hikingMountains";
import { courseStats, distM, durationText, eleAtKm, nearestOnLine, packLine, thinLine, walkMinutes, withKm } from "./hikingGeo";
import { HIKING_GUIDE_BLOCK, cleanHikingText, cleanMountainGuide, hasMountainGuide } from "./hikingGuide";
import { gridNumber, hikingPoiKind, hikingPoiTitle } from "./hikingPois";
import { courseFacts, courseShape, courseViaNote, hikingHubSeo, hikingListSeo, hikingMountainCardInput, hikingRegionSeo, kmRange, mountainSeo, HIKING_CTA } from "./hikingPage";
import { HIKING_PUBLIC } from "./hikingAccess";
import { isPrimarySport, isStartSport } from "./primarySport";
import { HUB_CARD_NAMES, HUB_CARD_VERSION, HUB_HIKING_REGIONS, hubCard, hubCardName, HUB_HIKING_LISTS, HUB_HIKING_LIST_NAMES, HUB_HIKING_REGION_NAMES } from "./ogCards";

/**
 * 등산의 뿌리 규칙(2026-10-13 오너: "산은 지역으로도 특성으로도 묶고 … 산 정보 페이지를 골프처럼 사이트맵 + 가입 유도").
 * 권역 · 묶음 · 주소 · 코스 선의 셈 · 소개 글 거르기 · 길 위의 지점 · 화면의 글, 그리고 당구 · 골프와 섞이지 않는지를 본다.
 */
const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("권역 · 묶음 · 주소", () => {
    it("권역 여덟 — 받은 자료의 시도 이름이 다 어느 권역에 든다", () => {
        expect(HIKING_REGIONS.map((r) => r.id)).toEqual(["capital", "gangwon", "chungcheong", "jeonbuk", "jeonnam", "gyeongbuk", "gyeongnam", "jeju"]);
        for (const [sido, id] of [["서울특별시", "capital"], ["강원특별자치도", "gangwon"], ["세종특별자치시", "chungcheong"], ["전북특별자치도", "jeonbuk"], ["전남광주통합특별시", "jeonnam"], ["대구광역시", "gyeongbuk"], ["울산광역시", "gyeongnam"], ["제주특별자치도", "jeju"]] as const) {
            expect(hikingRegionOf(sido), sido).toBe(id);
        }
        expect(hikingRegionOf(null)).toBeNull();
        expect(mountainPlace({ sido: "강원특별자치도", sigungu: "양양군" })).toBe("강원 양양군");
    });

    it("이름을 걸고 내는 목록은 공식 목록뿐 — 다른 회사의 인증 프로그램 · 사설 순위는 없다", () => {
        expect(HIKING_LISTS.map((l) => l.id)).toEqual(["kfs100", "kfs100plus", "nationalparks", "provincialparks", "highest50"]);
        expect(JSON.stringify(HIKING_GROUPS)).not.toMatch(/블랙야크|blackyak|산하|sanha/i);
        // 묶음 = 목록 + 특성. 주소 하나(/hiking/lists/<id>)를 같이 쓴다 — 이름표가 겹치면 안 된다
        expect(new Set(HIKING_GROUPS.map((g) => g.id)).size).toBe(HIKING_GROUPS.length);
        expect(hikingGroup("island")?.kind).toBe("trait");
        expect(inHikingGroup(hikingGroup("kfs100")!, { lists: ["kfs100"], traits: [] })).toBe(true);
        expect(inHikingGroup(hikingGroup("island")!, { lists: ["kfs100"], traits: [] })).toBe(false);
    });

    it("특성은 자료로 판정되는 것만 — 높이와 섬(시군구 전체가 섬인 곳만)", () => {
        expect(hikingTraits({ heightM: 1708, sigungu: "양양군" })).toEqual(["over1500", "over1000"]);
        expect(hikingTraits({ heightM: 1947, sigungu: "서귀포시" })).toEqual(["over1500", "over1000", "island"]);
        expect(hikingTraits({ heightM: 320, sigungu: "여수시" })).toEqual(["under500"]);
        expect(hikingTraits({ heightM: null, sigungu: "울릉군" })).toEqual(["island"]);
        // 일부만 섬인 시군은 넣지 않는다 — 그 시군의 뭍 산이 '섬의 산'이 되면 안 된다
        for (const no of ["여수시", "통영시", "고흥군", "태안군"]) expect(ISLAND_SIGUNGU).not.toContain(no);
    });

    it("주소 — 넘기는 순서가 우선순위. 같은 이름의 첫 산이 이름 그대로, 나머지는 시군을 붙인다. 이미 정한 주소는 그대로", () => {
        const rows = [
            { id: "a", name: "지리산", sigungu: "산청군" }, { id: "b", name: "지리산", sigungu: "통영시" }, { id: "c", name: "설악산", sigungu: "양양군" },
            { id: "d", name: "백운산", sigungu: "광양시", dong: "옥룡면" }, { id: "e", name: "백운산", sigungu: "광양시", dong: "봉강면" }, { id: "f", name: "백운산", sigungu: "광양시", dong: "봉강면" },
        ];
        const s = assignMountainSlugs(rows);
        expect([...s.values()]).toEqual(["지리산", "지리산-통영", "설악산", "백운산", "백운산-광양", "백운산-광양-봉강면"]);
        expect(new Set(s.values()).size).toBe(rows.length);
        // 다시 적재 — 이미 실린 산은 그 주소 그대로(순서가 바뀌어도)
        const again = assignMountainSlugs([rows[1], rows[0], { id: "g", name: "지리산", sigungu: "구례군" }], new Map([["a", "지리산"], ["b", "지리산-통영"]]));
        expect([again.get("a"), again.get("b"), again.get("g")]).toEqual(["지리산", "지리산-통영", "지리산-구례"]);
        expect(sigunguShort("창원시 마산합포구")).toBe("창원");
        expect(sigunguShort("중구")).toBe("중구");
        expect(hikingMountainPath("지리산-통영")).toBe(`/hiking/mountains/${encodeURIComponent("지리산-통영")}`);
        expect(hikingListPath("kfs100")).toBe("/hiking/lists/kfs100");
        expect(heightText(1708.4)).toBe("1,708m");
        expect(heightText(null)).toBe("");
    });
});

describe("같은 이름의 산", () => {
    it("주소에 시군이 붙은 산은 그 시군을, 이름 그대로인 산은 겹칠 때만 제 시군을 붙인다", () => {
        const big = { name: "지리산", slug: "지리산", sigungu: "산청군" }, small = { name: "지리산", slug: "지리산-통영", sigungu: "통영시" };
        const dup = duplicateNames([big, small, { name: "설악산" }]);
        expect(Array.from(dup)).toEqual(["지리산"]);
        expect(mountainLabel(small, dup)).toBe("지리산(통영)");
        expect(mountainLabel(big, dup)).toBe("지리산(산청)");
        // 겹치지 않는 화면에서는 이름 그대로
        expect(mountainLabel(big)).toBe("지리산");
        expect(mountainLabel({ name: "설악산", slug: "설악산", sigungu: "양양군" }, dup)).toBe("설악산");
    });
});

describe("코스 선의 셈", () => {
    // 북쪽으로 곧게 1km 쯤(위도 0.009°) — 300m 올랐다가 100m 내려온다
    const raw: [number, number, number][] = [[37, 127, 100], [37.003, 127, 250], [37.006, 127, 401], [37.009, 127, 300]];
    const line = withKm(raw);

    it("거리 · 오르막 · 내리막 · 가장 낮고 높은 곳. 높이의 잔떨림은 오르막으로 치지 않는다", () => {
        const s = courseStats(line);
        expect(s.km).toBeCloseTo(distM(37, 127, 37.009, 127) / 1000, 3);
        expect(s).toMatchObject({ gainM: 301, lossM: 101, minM: 100, maxM: 401, loop: false });
        const flat = withKm(Array.from({ length: 50 }, (_, i): [number, number, number] => [37 + i * 0.0001, 127, 100 + (i % 2 ? 1.5 : 0)]));
        expect(courseStats(flat).gainM).toBe(0);
        expect(courseStats(withKm([[37, 127, 100], [37.004, 127, 300], [37.0005, 127, 110]])).loop).toBe(true);
        expect(courseStats([])).toMatchObject({ km: 0, gainM: 0 });
    });

    it("점을 줄여도 처음 · 끝 · 가장 높은 곳 · 가장 낮은 곳은 남는다", () => {
        const many = withKm(Array.from({ length: 2000 }, (_, i): [number, number, number] => [37 + i * 0.00005, 127, i === 777 ? 999 : i === 1500 ? 5 : 300 + Math.sin(i / 40) * 80]));
        const thin = thinLine(many, 160);
        expect(thin.length).toBeLessThanOrEqual(165);
        expect(thin[0]).toEqual(many[0]);
        expect(thin[thin.length - 1]).toEqual(many[many.length - 1]);
        expect(Math.max(...thin.map((p) => p[2]))).toBe(999);
        expect(Math.min(...thin.map((p) => p[2]))).toBe(5);
        expect(thinLine(line, 160)).toHaveLength(line.length);
        expect(packLine(line)[1]).toEqual([37.003, 127, 250, Math.round(line[1][3] * 1000) / 1000]);
    });

    it("선 위의 자리 · 거리에서의 높이 · 걷는 시간 어림", () => {
        const on = nearestOnLine(line, 37.0061, 127.0001)!;
        expect(on.index).toBe(2);
        expect(on.offM).toBeLessThan(20);
        expect(on.ele).toBe(401);
        expect(nearestOnLine([], 37, 127)).toBeNull();
        expect(eleAtKm(line, 0)).toBe(100);
        expect(eleAtKm(line, line[1][3] / 2)).toBeCloseTo(175, 0);
        expect(eleAtKm(line, 99)).toBe(300);
        // 평지 4km/h + 오르막 600m 마다 한 시간
        expect(walkMinutes(8, 600)).toBe(180);
        expect(durationText(185)).toBe("3시간 5분");
        expect(durationText(60)).toBe("1시간");
        expect(durationText(42)).toBe("40분");
        expect(durationText(119)).toBe("2시간");
    });
});

describe("소개 글 거르기", () => {
    it("전화번호 · 돈 · 교통편 횟수 · 글쓴이의 메모 · 술이 든 문장은 뺀다. 기계가 남긴 영어는 고친다", () => {
        const keep = "화강암 봉우리가 이어지는 산이다.";
        for (const bad of ["안내소 전화는 033-123-4567이다.", "입장료는 3,000원이다.", "주차비를 받는다.", "속초에서 버스가 하루 12회 운행한다.", "버스는 30분 간격으로 다닌다.", "source 문서에는 높이가 나오지 않는다.", "설계자는 확인하지 못했다.", "하산 뒤 막걸리 집이 많다."]) {
            expect(cleanHikingText(`${keep} ${bad}`), bad).toBe(keep);
        }
        expect(cleanHikingText("summit 높이는 1,947m이며 남한에서 가장 높다.")).toBe("정상 높이는 1,947m이며 남한에서 가장 높다.");
        expect(cleanHikingText(null)).toBeNull();
        expect(HIKING_GUIDE_BLOCK.map(([n]) => n)).toEqual(["전화번호", "돈", "교통편 횟수", "글쓴이의 메모", "술"]);
    });

    it("받은 글 한 편 → 실을 값. 소개가 남지 않으면 싣지 않는다. 코스 안내는 경유지가 둘 이상일 때만", () => {
        const g = cleanMountainGuide({
            intro: "설악산은 강원도에 있는 산이다. 입장료는 없다.", subtitle: "섬세한 비경 두루 갖춘 팔방미인", thin: false,
            sections: [{ heading: "지형과 봉우리", body: "대청봉이 주봉이다." }, { heading: "교통", body: "버스가 하루 3회 운행한다." }],
            highlights: [{ name: "대청봉", note: "주봉이다." }, { name: "", note: "x" }],
            faq: [{ q: "몇 번째로 높은가?", a: "세 번째로 높다." }, { q: "요금은?", a: "무료다." }],
            courses: [{ route: "설악동-비선대-마등령", waypoints: ["설악동", "비선대", "마등령"], duration: "11시간" }, { route: "x", waypoints: ["한 곳"], duration: null }],
            sources: [{ url: "https://example.com/a", title: "공식" }, "javascript:alert(1)", "https://example.com/b"],
        }, "2026-10-13")!;
        expect(g).toMatchObject({ v: 1, at: "2026-10-13", subtitle: "섬세한 비경 두루 갖춘 팔방미인", intro: "설악산은 강원도에 있는 산이다.", thin: false });
        expect(g.sections.map((s) => s.heading)).toEqual(["지형과 봉우리"]);
        expect(g.highlights).toEqual([{ name: "대청봉", note: "주봉이다." }]);
        expect(g.faq.map((f) => f.q)).toEqual(["몇 번째로 높은가?"]);
        expect(g.officialCourses).toEqual([{ route: "설악동-비선대-마등령", waypoints: ["설악동", "비선대", "마등령"], duration: "11시간" }]);
        expect(g.sources.map((s) => s.url)).toEqual(["https://example.com/a", "https://example.com/b"]);
        expect(hasMountainGuide(g)).toBe(true);
        expect(cleanMountainGuide({ intro: "입장료는 3,000원이다." }, "2026-10-13")).toBeNull();
        expect(hasMountainGuide({ v: 2, intro: "x" })).toBe(false);
    });
});

describe("길 위의 지점", () => {
    it("국가지점번호 · 초소 · 헬기장은 위험 · 대피소가 아니라 따로다", () => {
        expect(hikingPoiKind("DANGER", "국가지점번호")).toBe("GRID");
        expect(hikingPoiKind("SHELTER", "국가지점번호")).toBe("GRID");
        expect(hikingPoiKind("DANGER", "산불감시초소")).toBe("MARK");
        expect(hikingPoiKind("SHELTER", "헬기장")).toBe("MARK");
        expect(hikingPoiKind("SHELTER", "희운각 대피소")).toBe("SHELTER");
        expect(hikingPoiKind("DANGER", "급경사")).toBe("DANGER");
        expect(hikingPoiKind("SIGN", "갈림길")).toBe("SIGN");
        expect(hikingPoiKind("WILD", "야생화")).toBe("WILD");
        expect(hikingPoiKind("ETC", "무엇")).toBe("MARK");
    });

    it("보여 줄 한 줄 — 이름이 유형 이름 그대로면 설명을 앞세운다. 국가지점번호는 번호를", () => {
        expect(hikingPoiTitle({ kind: "SIGN", name: "갈림길", note: "돌탑삼거리" })).toBe("돌탑삼거리");
        expect(hikingPoiTitle({ kind: "SIGN", name: "갈림길", note: null })).toBe("갈림길");
        expect(hikingPoiTitle({ kind: "DANGER", name: "위험지역", note: null })).toBe("위험 구간");
        expect(hikingPoiTitle({ kind: "WILD", name: "야생화", note: "담배풀" })).toBe("야생화 · 담배풀");
        expect(hikingPoiTitle({ kind: "SHELTER", name: "중청대피소", note: "정상 옆" })).toBe("중청대피소");
        expect(hikingPoiTitle({ kind: "GRID", name: "국가지점번호", note: "다마 9902 3171" })).toBe("다마 9902 3171");
        expect(gridNumber("다마99023171")).toBe("다마 9902 3171");
        expect(gridNumber("이정표")).toBeNull();
    });
});

describe("화면의 글 · 따로 선 세계", () => {
    it("제목 · 설명 — 등산객이 찾는 말로 연다(등산코스 · 최단 · 높이), 없는 것은 적지 않는다", () => {
        const m = { slug: "설악산", name: "설악산", heightM: 1708, sido: "강원특별자치도", sigungu: "양양군", courses: 3, minKm: 5.12, maxKm: 11.44, lists: ["kfs100", "nationalparks"] };
        const seo = mountainSeo(m);
        // 2026-10-13 오너: "키워드 관심사로 사이트맵 메타 제목이랑 해야 돼" — 사람들이 치는 말은 '○○산 등산코스'(붙여 쓴다)
        expect(seo.title).toBe("설악산 등산코스 3개 · 최단 5.1km · 높이 1,708m | 랭큐 등산");
        expect(seo.desc).toContain("강원 양양군의 설악산(1,708m)");
        expect(seo.desc).toContain("등산코스 3개(5.1~11.4km)의 코스 지도와 높낮이");
        expect(seo.desc).toContain("산림청 100대 명산 · 국립공원의 산");
        // 채비 지점 · 길의 종류는 그 자료가 있는 산(산림청 100대 명산)에만 적는다
        expect(seo.desc).toContain("들머리 · 주차장 · 화장실 · 약수터 같은 길 위의 지점과 어떤 길인지(계단 · 바위)");
        const plain = mountainSeo({ ...m, lists: ["nationalparks"] });
        expect(plain.desc).not.toMatch(/주차장|화장실|약수터|계단/);
        expect(plain.desc).toContain("길 위의 갈림길 · 위험 구간 · 대피소");
        // 코스가 하나면 그 길이만, 없으면 '등산코스'라는 말을 쓰지 않는다
        expect(mountainSeo({ ...m, courses: 1, minKm: 7.13, maxKm: 7.13 }).title).toBe("설악산 등산코스 · 7.1km · 높이 1,708m | 랭큐 등산");
        const bare = mountainSeo({ ...m, courses: 0, minKm: null, maxKm: null, lists: [] });
        expect(bare.title).toBe("설악산 등산 · 높이 1,708m · 위치 · 날씨 | 랭큐 등산");
        expect(`${bare.title} ${bare.desc}`).not.toMatch(/등산코스|코스 지도/);
        // 우리가 보증하지 않는 말은 쓰지 않는다
        for (const g of HIKING_GROUPS) expect(hikingListSeo(g, 10).title, g.id).not.toMatch(/추천|초보|베스트|BEST|인기/);
        expect(hikingListSeo({ id: "kfs100", name: "산림청 100대 명산" }, 100).title).toBe("100대 명산 리스트 · 지도 — 산림청 100대 명산 100곳 등산코스 | 랭큐 등산");
        expect(hikingListSeo({ id: "maple", name: "단풍 산" }, 27).title).toBe("단풍 명산 27곳 — 가을 단풍 산행 등산코스 | 랭큐 등산");
        expect(hikingListSeo({ id: "처음-보는-묶음", name: "새 묶음" }, 5).title).toBe("새 묶음 5곳 — 높이 · 등산코스 | 랭큐 등산");
        expect(hikingRegionSeo(HIKING_REGIONS[1], 447).title).toBe("강원 명산 · 등산코스 — 강원의 산 447곳 | 랭큐 등산");
        // 카드에 싣는 것 — 100대 명산이면 와펜, 아니면 속한 묶음 하나를 이름표로
        expect(hikingMountainCardInput({ ...m, region: "gangwon" })).toEqual({ name: "설악산", height: "1,708m", place: "강원 양양군", region: "gangwon", kfs100: true, badge: null, courses: "등산코스 3개 · 5.1~11.4km" });
        expect(hikingMountainCardInput({ ...m, lists: ["nationalparks"], courses: 0 })).toMatchObject({ kfs100: false, badge: "국립공원의 산", courses: "", region: null });
        expect(kmRange(7.12, 7.14)).toBe("7.1km");
        expect(hikingHubSeo({ total: 3836, famous: 307, courses: 5434 }).title).toContain("5,434개");
        expect(hikingListSeo({ id: "island", name: "섬의 산", note: "섬에 있는 산" }, 142).title).toBe("섬 산행 142곳 — 섬의 산 등산코스 · 높이 | 랭큐 등산");
        expect(courseFacts({ km: 7.12, gainM: 1370 })).toEqual({ km: "7.1km", gain: "1,370m", time: "약 4시간 5분" });
        expect(courseShape({ loop: true, summitKm: 3, km: 6 })).toBe("원점 회귀");
        expect(courseShape({ loop: false, summitKm: 6.9, km: 7.1 })).toBe("정상까지");
        expect(courseShape({ loop: false, summitKm: null, km: 7.1 })).toBe("능선 · 둘레 길");
    });

    it("등산은 등산의 자리에만 산다 — 주소 · 라우트 · 표 · 폴더. 골프의 도장첩 · 볼마커를 가져다 쓰지 않는다", () => {
        expect(read("server/routes/index.ts")).toContain('router.use("/hiking", hikingRouter);');
        const sql = read("migrations/hiking_base.sql").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
        expect(sql.match(/create table if not exists hiking_/g)).toHaveLength(3);
        expect(sql).not.toMatch(/alter table|drop |golf_|hiq_/i);
        for (const f of ["client/src/hiking/pages/HikingHub.tsx", "client/src/hiking/pages/HikingListPage.tsx", "client/src/hiking/pages/MountainPage.tsx", "client/src/hiking/components/MountainParts.tsx", "client/src/hiking/components/HikingShell.tsx", "client/src/hiking/stamps/SummitStamp.tsx"]) {
            const src = read(f);
            expect(src, f).not.toMatch(/golfStamp|InkStamp|볼마커|MarkerArt|sim\/|TierEmblem/);
            // 리터럴 색만 · 12px 아래 글자 없음
            expect(src.replace(/\/\*[\s\S]*?\*\//, ""), f).not.toMatch(/\b(?:bg|text|border|ring)-(?:white|black)\b/);
            expect([...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].every((x) => Number(x[1]) >= 12), f).toBe(true);
        }
    });

    it("등산으로 시작하기 — 주 종목 둘과 따로 선 값이고, 등산을 쓸 수 있는 회원만 고른다", () => {
        expect(isStartSport("HIKING")).toBe(true);
        expect(isStartSport("GOLF")).toBe(true);
        expect(isStartSport("TENNIS")).toBe(false);
        // 주 종목을 추정하는 식 · 문의 화면은 당구 · 골프만 안다
        expect(isPrimarySport("HIKING")).toBe(false);
        const member = read("server/routes/modules/member.ts");
        const route = member.slice(member.indexOf('router.post("/me/primary-sport"'));
        expect(route.slice(0, 900)).toContain('if (sport === "HIKING") {');
        expect(route.slice(0, 900)).toContain("if (!hikingAllowed(me,");
        expect(read("client/src/contexts/SportContext.tsx")).toContain('!(primary === "HIKING" && hikingOk) && !(primary === "FISHING" && fishingOk)) return;');
    });

    it("코스가 없는 명산 — 이웃 봉우리의 코스를 옮기지 않고 이어서 보여 준다", () => {
        expect(courseViaNote("노적봉")).toBe("노적봉 쪽에서 이 산의 정상을 지나는 길이에요.");
        expect(courseViaNote(null)).toBe("");
        const repo = read("server/storage/hiking.ts");
        expect(repo).toContain("from hiking_course_links l join hiking_courses c on c.id = l.course_id");
        const script = read("server/scripts/hiking-link-courses.ts");
        // 정상 인증이 되는 거리 안을 지나는 코스만, 제 코스가 없는 명산에만
        expect(script).toContain("const LINK_NEAR_M = SUMMIT_RADIUS_M;");
        expect(script).toContain("Number(m.tier) === 1 && Number(m.own) === 0");
        expect(read("migrations/hiking_course_links.sql")).toContain("primary key (mountain_id, course_id)");
    });

    it("산악회가 함께 오른 산 — 누가 올랐는지는 싣지 않고, 산악회일 때만 그 조각을 받는다", () => {
        const repo = read("server/storage/hikingStamps.ts");
        expect(repo).toContain("having count(distinct s.member_id) >= ${CREW_TOGETHER}");
        expect(repo).toContain("cm.role <> 'pending'");
        expect(repo).toContain("c.sport_category = 'HIKING'");
        const fn = repo.slice(repo.indexOf("export async function crewSummits"));
        expect(fn).not.toMatch(/member_id as|name as|nickname/);
        const tab = read("client/src/components/hiq/tabs/CrewHomeTab.tsx");
        expect(tab).toContain('const CrewSummits = lazy(() => import("@/hiking/crew/CrewSummits")');
        expect(tab).toContain("{isHiking && <Suspense fallback={null}><CrewSummits");
    });

    it("검색 · 공유에 뜨는 그림 — 등산 화면은 등산의 카드를 단다(당구의 공용 그림이 아니다)", () => {
        const O = "https://www.rankue.co.kr";
        expect([...HUB_HIKING_REGIONS]).toEqual(HIKING_REGIONS.map((r) => r.id));
        expect([...HUB_HIKING_LISTS].sort()).toEqual(HIKING_GROUPS.map((g) => g.id).sort());
        const cases: [string, string][] = [
            ["/hiking", "hiking"], ["/hiking/mountains/설악산", "hiking"], ["/hiking/regions/gangwon", "hiking-gangwon"], ["/hiking/regions/nowhere", "hiking"],
            // 묶음마다 제 카드(2026-10-13 — 100대 명산 · 단풍 · 억새 …가 미리보기에서 서로 갈린다). 모르는 묶음은 허브 카드
            ["/hiking/lists/kfs100", "hiking-list-kfs100"], ["/hiking/lists/maple", "hiking-list-maple"], ["/hiking/lists/over1500", "hiking-list-over1500"], ["/hiking/lists/nowhere", "hiking"],
            ["/hiking/stamps", "hiking-stamps"], ["/hiking/pack", "hiking-stamps"], ["/hiking/terms", "hiking-terms"], ["/hiking/terms/alba", "hiking-terms"], ["/hiking/checklist", "hiking-checklist"],
        ];
        for (const [path, name] of cases) expect(hubCardName(path), path).toBe(name);
        expect(hubCard(O, "/hiking/regions/jeju")!.url).toBe(`${O}/og-hub/hiking-jeju.jpg?v=${HUB_CARD_VERSION}`);
        // 그림의 설명은 카드마다 — 권역 · 묶음의 이름이 들어간다(공통 문구 "권역의 산" · "묶어서 찾는 산"이 아니다)
        expect(hubCard(O, "/hiking/regions/jeju")!.alt).toBe("제주의 산 · 등산코스 — 랭큐 등산");
        expect(hubCard(O, "/hiking/lists/maple")!.alt).toBe("단풍 명산 · 등산코스 — 랭큐 등산");
        expect(hubCard(O, "/hiking/lists/kfs100")!.alt).toBe("산림청 100대 명산 · 등산코스 — 랭큐 등산");
        expect(HUB_HIKING_REGION_NAMES).toEqual(Object.fromEntries(HIKING_REGIONS.map((r) => [r.id, r.name])));
        expect(Object.keys(HUB_HIKING_LIST_NAMES).sort()).toEqual(HIKING_GROUPS.map((g) => g.id).sort());
        // 목록(산림청 · 공원)은 이름 그대로, 특성 묶음은 찾는 말로
        for (const l of HIKING_LISTS) expect(HUB_HIKING_LIST_NAMES[l.id], l.id).toBe(l.name);
        // 당구 · 골프의 주소는 그대로다
        expect(hubCardName("/golf/terms")).toBe("golf-terms");
        expect(hubCardName("/hikingx")).toBeNull();
        for (const n of HUB_CARD_NAMES.filter((x) => x.startsWith("hiking"))) expect(existsSync(resolve(root, `client/public/og-hub/${n}.jpg`)), n).toBe(true);
    });

    it("등산은 열려 있다 — 가입 안내는 '기다리기'가 아니라 바로 시작(2026-10-13 오너: \"응 등산 열고 추천한 대로 진행\")", () => {
        expect(HIKING_PUBLIC).toBe(true);
        expect(HIKING_CTA.button).toBe("가입하고 산 도장 모으기");
        expect(`${HIKING_CTA.title} ${HIKING_CTA.body} ${HIKING_CTA.button}`).not.toMatch(/곧 열려요|기다리|준비 중/);
        // 돈 · 경품 · 빠르기를 말하지 않는다
        expect(`${HIKING_CTA.title} ${HIKING_CTA.body}`).not.toMatch(/원\b|상금|경품|빨리|최단 시간/);
        // 검색용 화면의 단추도 같은 글
        expect(read("server/seo/hiking.ts")).toContain('<p><a href="/?login=1">${esc(HIKING_CTA.button)}</a></p>');
    });

    it("가입 직후 한 번 묻는 창에 등산 칸이 있다 — 등산 화면에서 가입했으면 등산이 미리 골라진다", () => {
        // 오너: "등산으로 와서 가입했을 때 로직의 문제는 없지?" — 창에 당구 · 골프뿐이라 등산객이 둘 중 하나를 골라야 했고 다음에 열면 당구 홈이었다
        const gate = read("client/src/components/hiq/sport/PrimarySport.tsx");
        expect(gate).toContain("const hiking = m?.hikingAccess === true;");
        expect(gate).toContain('...(hiking ? [{ id: "HIKING" as const, title: t("primarySport.hiking"), sub: t("primarySport.hikingSub") }] : []),');
        expect(gate).toContain('const suggested: StartSport = hiking && (here === "HIKING" || /^\\/hiking(\\/|$|\\?)/.test(location)) ? "HIKING"');
        expect(gate).toContain('HIKING: "primarySport.startHiking"');
        expect(gate).toContain("{t(START_KEY[picked])}");
        // 고른 값은 서버가 확인하고 받는다(등산을 쓸 수 있는 회원만) · 다섯 언어에 글이 다 있다
        expect(read("server/routes/modules/member.ts")).toContain('const { isStartSport } = await import("../../../shared/primarySport.js");');
        for (const l of ["ko", "en", "tr", "vi", "es"]) { const dict = read(`client/src/lib/i18n/${l}.ts`); for (const k of ["primarySport.hikingSub", "primarySport.startHiking", "primarySport.noteThree"]) expect(dict, `${l}:${k}`).toContain(`"${k}":`); }
    });

    it("등산의 알림함 — 산악회의 알림만 모이고, 당구 알림함에는 섞이지 않는다", () => {
        const repo = read("server/storage/notification.repo.ts");
        expect(repo).toContain('if (sport === "GOLF" || sport === "HIKING" || sport === "FISHING") return eq(hiqNotifications.category, sport);');
        expect(repo).toContain('and(ne(hiqNotifications.category, "GOLF"), ne(hiqNotifications.category, "HIKING"), ne(hiqNotifications.category, "FISHING"))');
        expect(read("server/routes/modules/notification.ts")).toContain("const sportOf = (req: AuthRequest) => crewSportOf(req.query.sport);");
        expect(read("client/src/components/hiq/menu/NotificationInbox.tsx")).toContain("const { sport: currentSport } = useSport();");
    });

    it("새 공개 주소의 네 곳 — 봇 경로 · 검색용 화면 · 화면 라우트 · 사이트맵과 허브 내비", () => {
        expect(read("vercel.json")).toContain("|hiking(?:/(?:regions|lists|mountains)/[^/]+|/stamps|/pack|/terms(?:/[^/]+)?|/checklist|/abroad(?:/[^/]+)?)?|fishing(?:/(?:");
        const pre = read("server/prerender.ts");
        expect(pre).toContain("app.get(HIKING_RE, async (req, res, next) => {");
        expect(pre).toContain("[[HIKING_HUB_PATH, HIKING_NAV_LABEL] as [string, string]]");
        const app = read("client/src/App.tsx");
        for (const p of ["/hiking", "/hiking/regions/:id", "/hiking/lists/:id", "/hiking/mountains/:slug", "/hiking/stamps", "/hiking/pack", "/hiking/terms", "/hiking/terms/:id", "/hiking/checklist"]) expect(app, p).toContain(`<Route path="${p}"`);
        // 도장첩 · 배낭도 검색용 화면이 있다
        const seo = read("server/seo/hiking.ts");
        expect(seo).toContain("if (p === HIKING_STAMPS_PATH) return all.length ? stamps(all) : null;");
        expect(seo).toContain("if (p === HIKING_PACK_PATH) return all.length ? pack(all) : null;");
        const map = read("server/sitemap.ts");
        expect(map).toContain('"pba-records", "hiking", "fishing"] as const;');
        expect(map).toContain("return hikingSitemapParts(all, await mountainUpdatedDays().catch(() => new Map<string, string>()));");
        // 표지 그림 아홉 장
        for (const n of ["hero", ...HIKING_REGIONS.map((r) => `cover-${r.id}`)]) expect(existsSync(resolve(root, `client/public/hiking/art/${n}.webp`)), n).toBe(true);
    });
});

describe("산 화면 리뷰(2026-10-17) — 겹친 지점 · 같은 정상 · 같은 이름의 명산", () => {
    it("같은 자리의 같은 지점은 하나 — 종류 · 이름 · 150m 안", async () => {
        const { dedupeCoursePois } = await import("./hikingPois");
        const p = (kind: "PEAK" | "TOILET" | "SIGN", name: string, km: number, note: string | null = null) => ({ kind, name, note, km });
        const out = dedupeCoursePois([p("TOILET", "남설악화장실", 0.3), p("PEAK", "대청봉", 5.1), p("PEAK", "대청봉", 5.12), p("PEAK", "중청봉", 5.2), p("PEAK", "대청봉", 7.4)]);
        expect(out.map((x) => `${x.name}@${x.km}`)).toEqual(["남설악화장실@0.3", "대청봉@5.1", "중청봉@5.2", "대청봉@7.4"]);
        // 이름이 같은 유형 이름이어도 설명이 다르면 다른 지점
        expect(dedupeCoursePois([p("SIGN", "갈림길", 1, "돌탑삼거리"), p("SIGN", "갈림길", 1.05, "희운각")])).toHaveLength(2);
        expect(read("client/src/hiking/pages/MountainPage.tsx")).toContain("dedupeCoursePois(pois.filter((p) => p.courseId === c.id");
    });
    it("가까운 산은 300m 밖부터 — 같은 정상(0km)을 늘어놓지 않는다", () => {
        expect(read("server/storage/hiking.ts")).toContain("if (km >= NEARBY_SAME_PEAK_KM && km <= withinKm)");
    });
    it("산 한 줄의 이름 — 주소에 시군이 붙은 명산은 시군을 같이(지리산(통영)) · 사실은 덩어리 사이에서만 줄을 바꾼다", async () => {
        const { mountainLabel } = await import("./hikingMountains");
        expect(mountainLabel({ name: "지리산", slug: "지리산-통영", sigungu: "통영시" })).toBe("지리산(통영)");
        expect(mountainLabel({ name: "지리산", slug: "지리산", sigungu: "산청군" })).toBe("지리산");
        const row = read("client/src/hiking/components/MountainParts.tsx");
        expect(row).toContain("{mountainLabel(m)}</span>");
        expect(row).toContain('className="max-w-full truncate whitespace-nowrap">{f}{i < facts.length - 1 ? " ·" : ""}</span>');
    });
});
