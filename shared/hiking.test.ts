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
import { courseFacts, courseShape, hikingHubSeo, hikingListSeo, kmRange, mountainSeo } from "./hikingPage";

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
    it("제목 · 설명 — 산 이름 · 코스 수 · 높이가 들어간다", () => {
        const m = { slug: "설악산", name: "설악산", heightM: 1708, sido: "강원특별자치도", sigungu: "양양군", courses: 3, minKm: 5.12, maxKm: 11.44, lists: ["kfs100", "nationalparks"] };
        const seo = mountainSeo(m);
        expect(seo.title).toBe("설악산 · 등산 코스 3개 · 높이 1,708m | 랭큐 등산");
        expect(seo.desc).toContain("강원 양양군의 설악산(1,708m)");
        expect(seo.desc).toContain("등산 코스 3개(5.1~11.4km)");
        expect(seo.desc).toContain("산림청 100대 명산 · 국립공원의 산");
        expect(mountainSeo({ ...m, courses: 0, minKm: null, maxKm: null, lists: [] }).title).toBe("설악산 · 등산 · 높이 1,708m | 랭큐 등산");
        expect(kmRange(7.12, 7.14)).toBe("7.1km");
        expect(hikingHubSeo({ total: 3836, famous: 307, courses: 5434 }).title).toContain("5,434개");
        expect(hikingListSeo({ id: "island", name: "섬의 산", note: "섬에 있는 산" }, 142).title).toBe("섬의 산 142곳 — 높이 · 등산 코스 | 랭큐 등산");
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

    it("등산의 알림함 — 산악회의 알림만 모이고, 당구 알림함에는 섞이지 않는다", () => {
        const repo = read("server/storage/notification.repo.ts");
        expect(repo).toContain('if (sport === "GOLF" || sport === "HIKING") return eq(hiqNotifications.category, sport);');
        expect(repo).toContain('and(ne(hiqNotifications.category, "GOLF"), ne(hiqNotifications.category, "HIKING"))');
        expect(read("server/routes/modules/notification.ts")).toContain("const sportOf = (req: AuthRequest) => crewSportOf(req.query.sport);");
        expect(read("client/src/components/hiq/menu/NotificationInbox.tsx")).toContain("const { sport: currentSport } = useSport();");
    });

    it("새 공개 주소의 네 곳 — 봇 경로 · 검색용 화면 · 화면 라우트 · 사이트맵과 허브 내비", () => {
        expect(read("vercel.json")).toContain("|hiking(?:/(?:regions|lists|mountains)/[^/]+|/stamps|/pack|/terms(?:/[^/]+)?|/checklist)?)/?");
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
        expect(map).toContain('"pba-records", "hiking"] as const;');
        expect(map).toContain("hiking: async () => hikingSitemapParts(");
        // 표지 그림 아홉 장
        for (const n of ["hero", ...HIKING_REGIONS.map((r) => `cover-${r.id}`)]) expect(existsSync(resolve(root, `client/public/hiking/art/${n}.webp`)), n).toBe(true);
    });
});
