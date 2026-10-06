// 스토어 스크린샷 1.3 — 골프 5장(06~10). 원본 화면만 찍는다(틀·문구는 generate3 가 입힌다).
//
//   npx tsx store/screenshots/capture3-golf.mts            다섯 장 전부 → raw3/ko/06-golf-home · 07-join-booking · 08-courses · 09-scorecard · 10-passport
//   ONLY=08,10 npx tsx store/screenshots/capture3-golf.mts 고른 장만
//   SHOT_CACHE=<폴더>                                      운영 공개 자료 두 개를 그 폴더에 받아 두고 다시 쓴다(없으면 실행마다 받는다)
//
// 로컬 Vite(5177)에 /api/** 를 전부 가짜로 답한다(capture3-lib). 운영에 로그인하지 않고 아무것도 쓰지 않는다.
// 운영에서 읽는 것은 **공개 GET 둘뿐**이고 쿠키를 싣지 않는다: 골프장 목록 · 지역별 수(/api/hiq/golf-courses[/regions]).
//
// 무엇이 진짜이고 무엇이 지어낸 것인가
//   진짜(운영 공개 API 그대로)  골프장 490곳의 이름·지역·좌표, 지역별 골프장 수
//   지어낸 것                   회원(초록큐)과 동반자 별명, 라운드·타수, 조인·부킹 글, 그 글이 올라온 골프장 이름
//
// 지키는 것(store/1.3-제출-메모 · reports/resume-1006/scout/prep-shots.md (5))
//   · 조인·부킹 글의 골프장은 **없는 이름**이다(FICTION — 운영 목록·옛 이름과 겹치지 않는지 실행할 때마다 검사한다).
//     지어낸 그린피를 실제 골프장 이름에 붙이지 않으려는 것이다.
//   · 골프장 로고(/img/golf-logos)는 막는다 — 글자판으로 바뀐다.
//   · 스코어카드는 스트로크(gameMode "stroke")다 — 포인트 단추·금액이 없다.
//   · 실제 프로 이름이 나오는 골프 랭킹 카드는 비운다(자료 없음 → 이름 없는 안내 한 줄, 그것도 찍는 범위 밖).
//   · 사람 이름은 전부 지어낸 별명. 전화번호·사진 없음.
//
// HUB_COUNTS (08 전국 골프장의 '지금 올라온 글' 수)
//   sample(기본)  실제 회원 글 수를 지우고 예시 수를 얹는다 — 지도에 색 점으로만 보인다(이름 없는 점). 07 의 예시 글과 같은 결.
//   real          운영의 실제 수 그대로 → 08-courses-asis.png 로 따로 찍힌다.
//   none          글 수를 전부 0 으로(회원 글을 숨긴다) → 08-courses-nocounts.png.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASE, ME, ME_ID, PASS, VIEW, capture, chromium, openShot, report, type Handler, type Shot } from "./capture3-lib.mts";

const PROD = "https://www.rankue.co.kr";
/** 공개 자료를 받아 둘 곳(없으면 매번 받는다) */
const CACHE = process.env.SHOT_CACHE || "";
// 기본은 real — 스토어에 거는 그림의 "지금 티타임 n건"은 서비스 현황으로 읽힌다. 지어낸 수(sample)를 기본으로 두지 않는다(2026-10-07).
const HUB_COUNTS = (process.env.HUB_COUNTS || "real") as "sample" | "real" | "none";
const ONLY = (process.env.ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
const want = (n: string) => ONLY.length === 0 || ONLY.some((o) => n.startsWith(o));

/* ── 운영 공개 자료(읽기만 · 쿠키 없음) ─────────────────────────────────── */

interface Counts { booking: number; join: number; urgent: number }
interface Course {
    slug: string; name: string; region: string; city: string | null; lat: number | null; lng: number | null;
    aliases?: string[]; counts: Counts; nextTee: string | null; [k: string]: unknown;
}
interface RegionNode { region: string; courses: number; counts: Counts; cities: { city: string; short: string; courses: number; counts: Counts }[] }

async function publicGet<T>(path: string, file: string): Promise<T> {
    const cached = CACHE ? resolve(CACHE, file) : "";
    if (cached && existsSync(cached)) { const j = JSON.parse(readFileSync(cached, "utf8")); return (j?.data ?? j) as T; }
    const r = await fetch(PROD + path, { method: "GET", headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`공개 자료를 못 받았다: ${path} → ${r.status}`);
    const j: any = await r.json();
    if (cached) { mkdirSync(CACHE, { recursive: true }); writeFileSync(cached, JSON.stringify(j)); }
    return (j?.data ?? j) as T;
}

/* ── 날짜(한국 시각) ─────────────────────────────────────────────────── */

const DAY = 86_400_000;
const kstKey = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
const TODAY = kstKey(Date.now());
/** 오늘에서 n일 뒤(앞)의 한국 날짜 */
const dayKey = (n: number) => kstKey(Date.parse(`${TODAY}T00:00:00+09:00`) + n * DAY);
/** 그 날 한국 시각 hh:mm 의 ISO */
const kstAt = (n: number, hm: string) => new Date(`${dayKey(n)}T${hm}:00+09:00`).toISOString();

/* ── 지어낸 것 ────────────────────────────────────────────────────────── */

const GOLF_ME = { ...ME, primarySport: "GOLF", sportCategory: "GOLF" };
const FRIENDS = [
    { memberId: "00000000-0000-4000-8000-000000000002", name: "페어웨이단골" },
    { memberId: "00000000-0000-4000-8000-000000000003", name: "버디수집가" },
    { memberId: "00000000-0000-4000-8000-000000000004", name: "새벽티오프" },
];

/** 없는 골프장 — 조인·부킹 글과 진행 중 라운드에만 쓴다. 좌표는 적어 둔 시군 안의 아무 자리(거리 표시용). */
const FICTION = {
    hill: { id: "fx-hill", name: "초록언덕CC", region: "경기 용인", lat: 37.203, lng: 127.262 },
    cloud: { id: "fx-cloud", name: "구름마루CC", region: "경기 여주", lat: 37.301, lng: 127.612 },
    moon: { id: "fx-moon", name: "달빛호수CC", region: "강원 춘천", lat: 37.812, lng: 127.741 },
    leaf: { id: "fx-leaf", name: "풀잎소리CC", region: "경기 포천", lat: 37.952, lng: 127.231 },
    dusk: { id: "fx-dusk", name: "노을정원GC", region: "인천 중구", lat: 37.471, lng: 126.492 },
    dew: { id: "fx-dew", name: "새벽이슬CC", region: "충북 충주", lat: 37.012, lng: 127.893 },
    wind: { id: "fx-wind", name: "바람개비힐스", region: "경기 이천", lat: 37.243, lng: 127.471 },
} as const;
type Fx = (typeof FICTION)[keyof typeof FICTION];

/** 지어낸 이름이 운영 목록(이름·슬러그·옛 이름)과 겹치면 멈춘다 */
function assertFictional(courses: Course[]) {
    const bare = (s: string) => s.replace(/\s|컨트리클럽|골프클럽|골프장|골프앤리조트|리조트|힐스|C\.?C|G\.?C|&/gi, "");
    for (const f of Object.values(FICTION)) {
        const key = bare(f.name);
        const hit = courses.find((c) => [c.name, c.slug, ...(c.aliases ?? [])].some((n) => { const b = bare(String(n)); return b.length >= 2 && (b.includes(key) || key.includes(b)); }));
        if (hit) throw new Error(`지어낸 이름 '${f.name}' 이 실제 골프장 '${hit.name}' 과 겹친다 — 이름을 바꿔라`);
    }
}

type Slot = { role: "HOST" | "GUEST" | "OPEN"; gender: "M" | "F" | "ANY" };
const S = (role: Slot["role"], gender: Slot["gender"] = "ANY"): Slot => ({ role, gender });

/** 조인 글 한 건(GET /api/hiq/golf/joins 의 한 줄 — server withJoinCounts 가 얹는 칸까지) */
function join(n: number, at: { day: number; hm: string }, c: Fx, fee: number, slots: Slot[], applied: number, options: string[], comment = "") {
    return {
        id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
        ownerId: `00000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`,
        courseId: c.id, courseName: c.name, region: c.region, regionCode: null, lat: c.lat, lng: c.lng,
        datetime: kstAt(at.day, at.hm), greenFee: fee, isHotDeal: false, options, comment,
        isBlind: false, blindName: null, policyType: "POLICY_STANDARD", policyCustomText: null,
        listingType: "JOIN", joinType: "FIELD", costMode: "FIXED", sellerType: null, slots,
        joinHeadcount: slots.filter((s) => s.role === "OPEN").length, joinCondition: null,
        joinCapacity: slots.filter((s) => s.role === "OPEN").length, joinApplied: applied, joinPending: 0,
        joinedByMe: false, myJoinStatus: null, isUrgent: false, managerPhone: null, wx: null,
        isBlinded: false, createdAt: kstAt(-1, "21:10"),
    };
}
function booking(n: number, at: { day: number; hm: string }, c: Fx, fee: number, options: string[]) {
    return {
        ...join(n, at, c, fee, [], 0, options), listingType: "BOOKING", joinType: null, costMode: null, slots: null,
        sellerType: "STORE", joinHeadcount: null, joinCapacity: 1,
    };
}

/** 사흘 뒤(토요일 2026-10-10)의 조인 목록 — 07 */
const TEE_DAY = 3;
const JOINS = [
    // 접힌 줄의 "n명 모집 · 성별무관"은 자리 점이 넷이면 440px 에서 잘린다("성별…") — 그 글은 자리 셋으로, 나머지는 남성·여성으로 둔다
    join(1, { day: TEE_DAY, hm: "06:28" }, FICTION.hill, 145_000, [S("HOST", "M"), S("GUEST", "M"), S("OPEN", "M"), S("OPEN", "M")], 1, ["solo_ok", "beginner_ok"], "1부 첫 팀이에요. 편하게 치실 분 환영합니다."),
    join(2, { day: TEE_DAY, hm: "07:12" }, FICTION.cloud, 128_000, [S("HOST", "F"), S("GUEST", "F"), S("OPEN", "F"), S("OPEN", "F")], 0, ["beginner_ok"]),
    join(3, { day: TEE_DAY, hm: "08:05" }, FICTION.moon, 109_000, [S("HOST", "M"), S("OPEN"), S("OPEN")], 1, ["no_caddie", "three_ok"]),
    join(4, { day: TEE_DAY, hm: "11:36" }, FICTION.leaf, 119_000, [S("HOST", "M"), S("GUEST", "F"), S("OPEN", "F"), S("OPEN", "F")], 1, ["solo_ok"]),
    join(5, { day: TEE_DAY, hm: "12:48" }, FICTION.dusk, 152_000, [S("HOST", "M"), S("GUEST", "M"), S("GUEST", "M"), S("OPEN", "M")], 1, ["caddie_prepaid"]),
    join(6, { day: TEE_DAY, hm: "13:20" }, FICTION.dew, 98_000, [S("HOST", "F"), S("OPEN"), S("OPEN")], 1, ["no_caddie", "solo_ok"]),
    join(7, { day: TEE_DAY, hm: "17:04" }, FICTION.wind, 89_000, [S("HOST", "M"), S("GUEST", "M"), S("OPEN"), S("OPEN")], 0, ["three_ok"]),
];
const BOOKINGS = [
    booking(21, { day: TEE_DAY, hm: "06:52" }, FICTION.leaf, 132_000, ["no_caddie"]),
    booking(22, { day: TEE_DAY, hm: "07:40" }, FICTION.hill, 168_000, ["meal_inc"]),
    booking(23, { day: TEE_DAY, hm: "12:10" }, FICTION.wind, 115_000, ["couple_2", "cart_free"]),
    booking(24, { day: TEE_DAY, hm: "13:02" }, FICTION.cloud, 124_000, ["player_3"]),
];
/** 날짜 띠의 건수(오늘부터) — 고른 날(TEE_DAY)은 목록과 같은 수 */
const STRIP = { JOIN: [2, 4, 5, JOINS.length, 9, 3, 2, 4, 3, 6, 8, 2, 1, 3, 2, 5, 6], BOOKING: [1, 3, 2, BOOKINGS.length, 6, 2, 1, 2, 2, 4, 5, 1, 0, 2, 1, 3, 4] };
const counts = (view: string) => (view === "JOIN" ? STRIP.JOIN : STRIP.BOOKING).map((count, i) => ({ date: dayKey(i), count })).filter((c) => c.count > 0);

/** 홈 맨 위 긴급티 자리 — 긴급(당일 떨이)은 찍는 시각에 따라 글이 달라져서 비우고, 그다음 순서인 가까운 글 셋을 준다 */
const DEALS = [
    { ...join(31, { day: 1, hm: "07:12" }, FICTION.cloud, 128_000, [S("HOST", "F"), S("GUEST", "F"), S("OPEN"), S("OPEN")], 0, []) },
    { ...join(32, { day: 2, hm: "06:44" }, FICTION.leaf, 119_000, [S("HOST", "M"), S("OPEN"), S("OPEN"), S("OPEN")], 1, []) },
    { ...JOINS[0] },
];

/** 진행 중 라운드 — 09 스코어카드와 06 홈의 '진행 중 라운드' 카드가 같은 경기다 */
const MATCH_ID = "00000000-0000-4000-8000-0000000000a1";
const PARS = [4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4];
const HOLE_NOW = 7;
const card = (first: number[]) => [...first, ...Array(18 - first.length).fill(0)];
const MATCH = {
    id: MATCH_ID, hostId: ME_ID, status: "playing", pinCode: "4827",
    courseId: FICTION.hill.id, courseName: FICTION.hill.name, frontCourseName: "레이크", backCourseName: "밸리",
    // 스트로크 — rulesFor 가 판돈·보너스를 전부 0 으로 본다(포인트 단추가 그려지지 않는다)
    gameMode: "stroke", strokeMode: "group", stake: 0, useDouble: false, doublingMode: "none", birdieAmount: 0, eagleAmount: 0,
    currentHole: HOLE_NOW, pars: PARS, parKnown: PARS.map(() => true),
    players: [
        { memberId: ME_ID, name: ME.nickname, isGuest: false, scores: card([5, 4, 3, 4, 4, 5, 3]), penalties: [] },
        { ...FRIENDS[0], isGuest: false, scores: card([4, 5, 4, 4, 6, 4, 2]), penalties: [] },
        { ...FRIENDS[1], isGuest: false, scores: card([4, 3, 3, 4, 5, 5, 4]), penalties: [] },
        { ...FRIENDS[2], isGuest: false, scores: card([5, 5, 4, 5, 6, 5, 3]), penalties: [] },
    ],
    createdAt: new Date(Date.now() - 105 * 60_000).toISOString(), updatedAt: new Date(Date.now() - 60_000).toISOString(),
};
const CHECKIN = { status: "playing", courseKnown: true, verified: true, byCompanion: false, mine: { verified: true, bucket: "near", at: new Date(Date.now() - 100 * 60_000).toISOString() }, stamp: null, reason: null, retryUntil: null };
const HOLE_STATS = {
    mine: {
        putts: [2, 2, 2, 2, 1, 3, 2, ...Array(11).fill(null)],
        fairway: ["M", "H", null, "H", "H", "M", null, ...Array(11).fill(null)],
        penaltyTags: Array.from({ length: 18 }, () => []),
    },
    lastTime: Array(18).fill(null),
};

/**
 * 지난 라운드 — 옛 → 최근. where 는 운영 공개 목록에 있는 **실제 골프장 이름**이다(이름·지역·좌표를 거기서 찾는다 — place()).
 * 여권 도장·발자국은 실제 골프장이라야 지도에 찍힌다. 그 이름에 붙는 것은 '내가 간 날·내 타수'뿐이고 값(그린피·시세)은 붙이지 않는다.
 * 가장 최근 라운드를 제주에 둔 것은 10번 화면의 말풍선이 다른 번호를 가리지 않게 하려는 것이다.
 */
const ROUNDS = [
    { ago: 200, score: 92, where: "써닝포인트CC" },
    { ago: 179, score: 90, where: "파주CC" },
    { ago: 164, score: 88, where: "라비에벨CC" },
    { ago: 144, score: 89, where: "천안상록CC" },
    { ago: 123, score: 86, where: "보문GC" },
    { ago: 95, score: 85, where: "페럼CC" },
    { ago: 53, score: 84, where: "써닝포인트CC" },
    { ago: 32, score: 83, where: "군산CC" },
    { ago: 11, score: 81, where: "중문CC" },
];
/** 내 관심 골프장(08 지도의 호박색 점) */
const WATCHING = ["설해원CC", "사우스케이프CC", "중문CC", "군산CC"];

/* ── 자료 묶음 ────────────────────────────────────────────────────────── */

interface Data { courses: Course[]; regions: RegionNode[]; realSums: Counts }

/** 08 의 글 수 — sample 이면 실제 회원 글 수를 지우고 지역마다 몇 곳에 예시 수를 얹는다(어느 골프장인지는 화면에 이름으로 나오지 않는다) */
function withHubCounts(real: Course[], mode: typeof HUB_COUNTS): Course[] {
    if (mode === "real") return real;
    const out = real.map((c) => ({ ...c, counts: { booking: 0, join: 0, urgent: 0 }, nextTee: null }));
    if (mode === "none") return out;
    const plan: Record<string, { join: number; booking: number }> = {
        경기: { join: 4, booking: 3 }, 강원: { join: 2, booking: 1 }, 충청: { join: 1, booking: 1 }, 경상: { join: 1, booking: 1 }, 전라: { join: 1, booking: 0 },
    };
    let urgentLeft = 1;
    for (const [region, p] of Object.entries(plan)) {
        const pool = out.filter((c) => c.region === region && c.lat != null && c.lng != null);
        const n = p.join + p.booking;
        for (let i = 0; i < n && pool.length; i++) {
            const c = pool[Math.floor(((i + 0.5) / n) * pool.length)];
            if (i < p.join) { c.counts.join += 1; if (urgentLeft > 0) { c.counts.urgent += 1; urgentLeft--; } }
            else c.counts.booking += 1;
            c.nextTee = kstAt(1 + (i % 4), "07:30");
        }
    }
    return out;
}
const sum = (rows: { counts: Counts }[]): Counts => rows.reduce((a, c) => ({ booking: a.booking + c.counts.booking, join: a.join + c.counts.join, urgent: a.urgent + c.counts.urgent }), { booking: 0, join: 0, urgent: 0 });

async function loadData(mode: typeof HUB_COUNTS): Promise<Data> {
    const real = await publicGet<Course[]>("/api/hiq/golf-courses", "courses.json");
    const realRegions = await publicGet<RegionNode[]>("/api/hiq/golf-courses/regions", "regions.json");
    assertFictional(real);
    const courses = withHubCounts(real, mode);
    // 지역 응답의 글 수도 목록과 맞춘다(골프장 수는 운영 값 그대로)
    const regions = realRegions.map((r) => ({
        ...r,
        counts: sum(courses.filter((c) => c.region === r.region)),
        cities: r.cities.map((ct) => ({ ...ct, counts: sum(courses.filter((c) => c.region === r.region && c.city === ct.city)) })),
    }));
    return { courses, regions, realSums: sum(real) };
}

function place(d: Data, name: string): Course {
    const c = d.courses.find((x) => x.name === name);
    if (!c || c.lat == null || c.lng == null) throw new Error(`운영 목록에 '${name}'(좌표 포함)이 없다 — ROUNDS·WATCHING 을 고쳐라`);
    return c;
}

/** GET /api/hiq/history?sport=GOLF — shared/guestSample 의 골프 기록과 같은 모양에 id·날짜·골프장을 보탰다(최신순) */
function history(d: Data) {
    return [...ROUNDS].reverse().map((r, i) => {
        const at = kstAt(-r.ago, "13:40");
        return {
            id: `00000000-0000-4000-8000-0000000003${String(i).padStart(2, "0")}`, memberId: ME_ID,
            sportCategory: "GOLF", gameMode: "match", gameType: "golf", isRanked: true, isWinner: false,
            score: r.score, innings: 18, average: (r.score / 18).toFixed(2), highRun: 0, onSite: true,
            locationName: place(d, r.where).name, subType: null, inningData: null, createdAt: at, playedAt: at,
        };
    });
}

/** 도장 — 골프장당 하나, 처음 간 순서(server/storage/golfStamps 와 같은 셈) */
function stamps(d: Data) {
    const by = new Map<string, { c: Course; first: string; last: string; best: number; visits: number }>();
    for (const r of ROUNDS) {
        const c = place(d, r.where), at = kstAt(-r.ago, "13:40");
        const s = by.get(c.slug);
        if (s) { s.last = at; s.best = Math.min(s.best, r.score); s.visits++; }
        else by.set(c.slug, { c, first: at, last: at, best: r.score, visits: 1 });
    }
    return [...by.values()];
}
function passportStats(d: Data) {
    const list = stamps(d);
    const regionConquered: Record<string, number> = {};
    for (const s of list) regionConquered[s.c.region] = (regionConquered[s.c.region] ?? 0) + 1;
    const conquered = list.length;
    // 레벨 문턱은 서버와 같다(server/storage/golf.repo getGolfPassportStats: 3 · 10 · 30)
    const lv = conquered >= 30 ? { level: "골프 매니아", levelNum: 4, nextLevelAt: null } : conquered >= 10 ? { level: "골프 탐험가", levelNum: 3, nextLevelAt: 30 }
        : conquered >= 3 ? { level: "골프 비기너", levelNum: 2, nextLevelAt: 10 } : { level: "골프 입문자", levelNum: 1, nextLevelAt: 3 };
    return {
        conquered, totalCourses: d.courses.length, rounds: ROUNDS.length, starsCollected: ROUNDS.filter((r) => r.score < 85).length, ...lv,
        // 지역별 골프장 수는 운영 공개 목록의 값(로그인해야 받는 여권 응답은 읽지 않았다 — 몇 곳 다를 수 있다)
        regionTotals: Object.fromEntries(d.regions.map((r) => [r.region, r.courses])), regionConquered,
        stamps: list.map((s) => ({ clubId: s.c.slug, name: s.c.name, region: s.c.region, firstDate: s.first, lastDate: s.last, bestScore: s.best, rounds: s.visits, onSite: true })),
        recordStamps: [],
    };
}
function footprints(d: Data, year: number | null) {
    const yearOf = (iso: string) => new Date(Date.parse(iso) + 9 * 3600_000).getUTCFullYear();
    const all = stamps(d).map((s) => ({ clubId: s.c.slug, name: s.c.name, slug: s.c.slug, region: s.c.region, lat: s.c.lat, lng: s.c.lng, firstVisitedAt: s.first, lastVisitedAt: s.last, visits: s.visits, bestScore: s.best }));
    const years = [...new Set(all.map((s) => yearOf(s.firstVisitedAt)))].sort((a, b) => b - a);
    const stops = year == null ? all : all.filter((s) => yearOf(s.firstVisitedAt) === year);
    return { year, years, rounds: ROUNDS.length, onSiteRounds: ROUNDS.length, stops, records: [] };
}

/* ── 가짜 응답 ────────────────────────────────────────────────────────── */

function golfApi(d: Data): Handler {
    return ({ path, method, url }) => {
        const q = url.searchParams;
        // 현장 인증 확인은 읽기·쓰기 모두 같은 답(이미 인증된 경기)
        if (path === `/api/hiq/golf/match/${MATCH_ID}/checkin`) return CHECKIN;
        if (method !== "GET") return PASS;

        // 골프장(공개) — 목록·지역은 운영 값, 글 목록은 비운다(실제 회원 글이다), 내 관심·지역 알림은 이 회원의 것
        if (path === "/api/hiq/golf-courses") {
            // 의도(?intent=)로는 거르지 않는다 — 허브는 그 범위의 골프장을 전부 받아 글 수만 다르게 센다
            const region = q.get("region"), city = q.get("city");
            return d.courses.filter((c) => (!region || c.region === region) && (!city || c.city === city || String(c.city ?? "").startsWith(city)));
        }
        if (path === "/api/hiq/golf-courses/regions") return d.regions;
        if (path === "/api/hiq/golf-courses/listings") return [];
        if (path === "/api/hiq/golf-courses/alerts/mine") return [];
        if (path === "/api/hiq/golf-courses/watches/mine") {
            return WATCHING.map((n) => place(d, n)).map((c) => ({ slug: c.slug, name: c.name, region: c.region, city: c.city, filters: {}, counts: c.counts }));
        }

        // 조인·부킹
        if (path === "/api/hiq/golf/bookings/counts") return counts(q.get("viewType") || "BOOKING");
        if (path === "/api/hiq/golf/joins") return q.get("date") === dayKey(TEE_DAY) ? JOINS : [];
        if (path === "/api/hiq/golf/bookings") {
            if (q.get("applied") === "1" || q.get("mine") === "1") return [];
            if (q.get("urgent") === "1") return [];
            if (q.get("hotDeal") === "1") return DEALS;
            return q.get("date") === dayKey(TEE_DAY) ? BOOKINGS : [];
        }

        // 홈
        if (path === "/api/hiq/history") return history(d);
        if (path === "/api/hiq/golf/match/active") return { id: MATCH_ID, status: "playing", courseName: MATCH.courseName, currentHole: HOLE_NOW, isHost: true, pinCode: MATCH.pinCode, playerCount: MATCH.players.length };
        if (path === "/api/hiq/golf-rank/summary") return null;   // 실제 프로 이름을 싣지 않는다
        if (path === "/api/hiq/crews/mine") return [{ crew: { id: "00000000-0000-4000-8000-0000000000c1", name: "주말 새벽 라운드", region: "경기 용인", sportCategory: "GOLF" }, memberCount: 18, role: "member" }];

        // 스코어카드
        if (path === `/api/hiq/golf/match/${MATCH_ID}`) return MATCH;
        if (path === `/api/hiq/golf/match/${MATCH_ID}/hole-stats`) return HOLE_STATS;
        if (path === `/api/hiq/golf/match/${MATCH_ID}/photos`) return [];
        if (path === `/api/hiq/golf/clubs/${MATCH.courseId}/courses`) return [{ id: "fx-hill-a", name: "레이크", par: 36, holes: 9 }, { id: "fx-hill-b", name: "밸리", par: 36, holes: 9 }];

        // 여권
        if (path === "/api/hiq/golf/passport-stats") return passportStats(d);
        if (path === "/api/hiq/golf/passport/footprints") { const y = q.get("year"); return footprints(d, y && /^\d{4}$/.test(y) ? Number(y) : null); }
        if (path === "/api/hiq/golf/photos/mine") return [];
        return PASS;
    };
}

/* ── 찍기 ─────────────────────────────────────────────────────────────── */

const LOGOS = /\/img\/golf-logos\//;
const SEOUL = { latitude: 37.5665, longitude: 126.978 };
/** 설치 팝업을 쉬게 한다(방금 닫은 기록) — 애플 스크린샷에 스토어 단추가 찍히면 안 된다 */
const QUIET = { rankue_install_prompt: JSON.stringify({ d: Date.now(), n: 1, s: null }) };

/** 화면이 로컬 밖으로 보낸 요청(메서드 · 호스트 → 횟수) — /api/** 는 가짜 응답이라 나가지 않는다. 운영 호스트가 여기 보이면 안 된다. */
const outside = new WeakMap<Shot, Map<string, number>>();

async function open(browser: Awaited<ReturnType<typeof chromium.launch>>, d: Data, opts: { geo?: boolean; storage?: Record<string, string> } = {}): Promise<Shot> {
    const shot = await openShot(browser, {
        sport: "GOLF", me: GOLF_ME, handler: golfApi(d), blockImages: LOGOS,
        storage: { ...QUIET, ...(opts.storage ?? {}) },
        ...(opts.geo ? { geolocation: SEOUL } : {}),
    });
    const seen = new Map<string, number>();
    outside.set(shot, seen);
    shot.ctx.on("request", (r) => {
        const u = new URL(r.url());
        if (!/^https?:$/.test(u.protocol) || u.host === new URL(BASE).host || /\/api\//.test(u.pathname)) return;
        const k = `${r.method()} ${u.host}`;
        seen.set(k, (seen.get(k) ?? 0) + 1);
    });
    return shot;
}
/** 찍은 뒤 한 줄씩 — 공용 요약(report) + 밖으로 나간 요청 */
function wrapUp(shot: Shot, name: string) {
    report(shot, name);
    const out = [...(outside.get(shot) ?? new Map<string, number>())].map(([k, n]) => `${k} ×${n}`);
    console.log(`   로컬 밖으로 나간 요청: ${out.join(" · ") || "없음"}`);
}

/** 지금 화면(뷰포트)에 보이는 글자와 상태 — 찍기 직전에 적어 둔다. 금칙어가 보이면 그 자리에서 알린다. */
async function inspect(shot: Shot, name: string, forbid: RegExp[]) {
    // 글자로 넘긴다 — tsx(esbuild)가 이름 붙은 함수에 끼우는 __name 도우미가 브라우저 쪽에는 없다
    const info: { sport: string | null; overflowX: number; scrollY: number; docH: number; dialogs: number; pulses: string[]; brokenImgs: string[]; cut: string[]; text: string } = await shot.page.evaluate(`(() => {
        const vh = window.innerHeight, vw = window.innerWidth;
        // 고정·붙박이 띠(하단 탭 · 머리 · 단추 줄 · 떠 있는 단추) — 그 밑에 깔린 글자는 '보인다'고 세지 않는다
        function pinned(el) { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === "fixed" || p === "sticky") return e; } return null; }
        function inView(el) { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < vh && r.width > 0 && r.height > 0; }
        const seen = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const t = (n.nodeValue || "").trim();
            const el = n.parentElement;
            if (!t || !el) continue;
            range.selectNodeContents(n);
            const r = range.getBoundingClientRect();
            if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw || r.width === 0 || r.height === 0) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
            const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
            const hit = document.elementFromPoint(cx, cy);
            const over = hit ? pinned(hit) : null;
            if (over && over !== pinned(el) && !over.contains(el)) continue;
            seen.push(t);
        }
        const cut = [...document.querySelectorAll("body *")].filter((e) => inView(e) && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow === "ellipsis" && (e.textContent || "").trim())
            .filter((e) => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(Math.min(vw - 1, Math.max(0, r.left + 4)), Math.min(vh - 1, Math.max(0, r.top + r.height / 2))); const over = hit ? pinned(hit) : null; return !(over && over !== pinned(e) && !over.contains(e)); })
            .map((e) => (e.textContent || "").trim().slice(0, 40));
        return {
            sport: document.documentElement.getAttribute("data-sport"),
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            scrollY: Math.round(window.scrollY), docH: document.documentElement.scrollHeight,
            dialogs: [...document.querySelectorAll("[role=dialog]")].filter(inView).length,
            pulses: [...document.querySelectorAll(".animate-pulse")].filter(inView).map((e) => String(e.getAttribute("class")).slice(0, 60)),
            brokenImgs: [...document.querySelectorAll("img")].filter((i) => inView(i) && i.complete && i.naturalWidth === 0).map((i) => i.src.slice(-60)),
            cut, text: seen.join(" | "),
        };
    })()`);
    console.log(`[${name}] data-sport ${info.sport} · 가로 넘침 ${info.overflowX}px · scrollY ${info.scrollY}/${info.docH} · 대화상자 ${info.dialogs} · 깨진 그림 ${info.brokenImgs.length}${info.brokenImgs.length ? " " + info.brokenImgs.join(",") : ""}`);
    if (info.pulses.length) console.log(`   깜박이는 자리(.animate-pulse) ${info.pulses.length}:`, info.pulses.slice(0, 4).join(" || "));
    const bad = forbid.filter((re) => re.test(info.text)).map(String);
    console.log(bad.length ? `   ⚠️ 보이면 안 되는 글자: ${bad.join(" ")}` : "   금칙어 없음");
    console.log(info.cut.length ? `   ⚠️ 잘린 글자(…) ${info.cut.length}: ${info.cut.join(" || ")}` : "   잘린 글자 없음");
    console.log("   보이는 글자:", info.text.slice(0, 1500));
}

/** 화면의 캔버스(로티)가 전부 그려졌는가 — 40×40 으로 줄여 불투명한 점을 센다. 시간 안에 안 되면 false. */
async function waitForCanvasInk(shot: Shot, timeoutMs: number): Promise<boolean> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        const inks = await shot.page.evaluate(`(() => [...document.querySelectorAll("canvas")].map((c) => {
            try {
                const o = document.createElement("canvas"); o.width = 40; o.height = 40;
                const x = o.getContext("2d"); x.drawImage(c, 0, 0, 40, 40);
                const d = x.getImageData(0, 0, 40, 40).data; let n = 0;
                for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
                return n;
            } catch (e) { return -1; }
        }))()`) as number[];
        if (inks.length > 0 && inks.every((n) => n > 20)) return true;
        await shot.page.waitForTimeout(300);
    }
    return false;
}

/** 금액처럼 보이는 글자(12만원 · 135,000원) */
const PRICE = /\d[\d,]*\s*(만\s*)?원/;
/** 어느 골프 화면에도 보이면 안 되는 것 — 예시 배지 · 가입 안내 · 준비 중 · 스토어 단추 */
const NEVER = [/예시/, /가입하/, /로그인/, /준비 중/, /Google Play|App Store|앱 설치|앱에서 열기/, /약관/, /010-?\d{3,4}/];

async function main() {
    const data = await loadData(HUB_COUNTS);
    console.log(`오늘 ${TODAY} · 골프장 ${data.courses.length}곳 · 운영의 실제 글 수 ${JSON.stringify(data.realSums)} · 08 에 쓰는 글 수(${HUB_COUNTS}) ${JSON.stringify(sum(data.courses))} · 지어낸 이름 겹침 없음`);
    const browser = await chromium.launch();
    try {
        // ── 06 골프 홈 ── 머리 · 진행 중 라운드 · 가까운 조인 한 장 · 핸디캡 큰 숫자 · RANKUE MATCH / ENTER CODE
        if (want("06")) {
            const name = "06-golf-home";
            const shot = await open(browser, data);
            await shot.page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
            await shot.page.getByText("HDCP").first().waitFor({ timeout: 20_000 });
            await shot.page.getByText("진행 중 라운드").waitFor({ timeout: 10_000 });
            await shot.page.getByText("그린피 1인").first().waitFor({ timeout: 10_000 });
            // RANKUE MATCH 타일의 골퍼 그림은 밖(lottie.host · jsdelivr 의 wasm)에서 온다 — 늦으면 타일 윗부분이 빈 채로 찍힌다(실제로 한 번 그랬다).
            // 캔버스에 그림이 올라올 때까지 기다린다.
            const drawn = await waitForCanvasInk(shot, 20_000);
            console.log(drawn ? "   타일 그림(로티) 그려짐" : "   ⚠️ 타일 그림(로티)이 20초 안에 안 그려졌다 — RANKUE MATCH 타일 윗부분이 비었는지 눈으로 확인");
            await shot.page.waitForTimeout(1500);   // 큰 숫자·타일이 떠오르는 움직임이 끝날 때까지
            await inspect(shot, name, [...NEVER, /PRO-AM|프로암/, /긴급티가 없/]);
            console.log("  →", await capture(shot, name));
            wrapUp(shot, name);
            await shot.ctx.close();
        }

        // ── 07 조인·부킹 ── 조인 탭, 사흘 뒤 토요일
        if (want("07")) {
            const name = "07-join-booking";
            const shot = await open(browser, data, { geo: true });
            await shot.page.goto(`${BASE}/golf/booking-list?date=${dayKey(TEE_DAY)}&view=JOIN`, { waitUntil: "load" });
            await shot.page.getByText(FICTION.hill.name).first().waitFor({ timeout: 20_000 });
            await shot.page.getByText("조인 만들기").waitFor({ timeout: 10_000 });
            await shot.page.waitForTimeout(2200);
            await inspect(shot, name, [...NEVER, /불러오는 중/]);
            console.log("  →", await capture(shot, name));
            wrapUp(shot, name);
            await shot.ctx.close();
        }

        // ── 08 전국 골프장 ── 점 지도
        if (want("08")) {
            const name = HUB_COUNTS === "real" ? "08-courses" : HUB_COUNTS === "sample" ? "08-courses-sample" : "08-courses-nocounts";
            const shot = await open(browser, data, { geo: true });
            await shot.page.goto(`${BASE}/golf/courses`, { waitUntil: "load" });
            await shot.page.locator("section[aria-label='지도'] svg circle").first().waitFor({ timeout: 20_000 });
            await shot.page.getByText("내 관심").first().waitFor({ timeout: 10_000 });
            await shot.page.waitForTimeout(2200);
            console.log(`   지도의 호박색(내 관심) 점 ${await shot.page.locator("section[aria-label='지도'] svg circle[fill='#FFC43D']").count()}개`);
            await inspect(shot, name, [...NEVER, PRICE]);   // 값이 보이면 알린다(운영의 실제 값이면 괜찮다 — 눈으로 확인)
            console.log("  →", await capture(shot, name));
            wrapUp(shot, name);
            await shot.ctx.close();
        }

        // ── 09 스코어카드 ── 7번 홀 진행 중, 네 명, 내 기록표를 펼친다
        if (want("09")) {
            const name = "09-scorecard";
            const shot = await open(browser, data, { geo: true });
            await shot.page.goto(`${BASE}/golf/game/${MATCH_ID}`, { waitUntil: "load" });
            await shot.page.getByText(`${HOLE_NOW}번 홀`).first().waitFor({ timeout: 20_000 });
            await shot.page.getByText("현장 인증됨").waitFor({ timeout: 10_000 });
            await shot.page.getByRole("button", { name: "기록표" }).first().click();
            await shot.page.waitForTimeout(1500);
            await inspect(shot, name, [...NEVER, /포인트|타당|원으로|정산|내기/, PRICE, /파 미확인/, /연결이 불안정/]);
            console.log("  →", await capture(shot, name));
            wrapUp(shot, name);
            await shot.ctx.close();
        }

        // ── 10 골프 여권 ── 발자국 지도가 가운데 오게 내리고, 가장 최근 발자국의 말풍선을 연다
        if (want("10")) {
            const name = "10-passport";
            const shot = await open(browser, data);
            await shot.page.goto(`${BASE}/golf/passport`, { waitUntil: "load" });
            const panel = shot.page.locator("section[aria-label='나의 골프 발자국']");
            await panel.waitFor({ timeout: 20_000 });
            await panel.locator("svg [role=button]").first().waitFor({ timeout: 10_000 });
            await shot.page.waitForTimeout(5200);   // 발자국이 다 걸을 때까지(최대 3.4초 + 0.8초)
            // 숫자 세 칸(정복·라운드·85타 미만)이 머리 바로 밑에 오게 — 그 아래로 탭·제목·지도 한 장이 다 들어온다
            const y = await shot.page.evaluate(() => {
                const cells = [...document.querySelectorAll("main section p")].find((p) => p.textContent?.trim() === "정복한 골프장");
                const box = cells?.closest("div.grid");
                return box ? Math.max(0, Math.round(box.getBoundingClientRect().top + window.scrollY - 64 - 14)) : 0;
            });
            await shot.page.evaluate((top) => window.scrollTo(0, top), y);
            await shot.page.waitForTimeout(500);
            const last = stamps(data).length;
            await panel.locator(`svg [role=button][aria-label^='${last}번째 발자국']`).click({ force: true });
            await shot.page.waitForTimeout(900);
            await inspect(shot, name, [...NEVER, /아직 발자국이 없/, /미인증/]);
            console.log("  →", await capture(shot, name));
            wrapUp(shot, name);
            await shot.ctx.close();
        }
    } finally {
        await browser.close();
    }
    console.log(`끝 — 뷰포트 ${VIEW.width}×${VIEW.height}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
