/**
 * 골프장 데이터 손질 규칙 — 어드민 '골프장 데이터' 화면(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 *
 * 왜 shared 인가: 같은 판정을 화면(client/src/pages/admin/golf/GolfCoursesView.tsx — 칸이 노래지고 저장이 꺼지는 것)과
 * 서버(server/routes/modules/adminGolf/courses.ts — 실제로 막는 것)가 둘 다 한다. 한쪽만 바꾸면 화면은 '저장'을 켜는데
 * 서버가 400 을 내거나, 거꾸로 화면이 막는 값을 서버가 받는다.
 *
 * 파(홀별)는 경기 화면이 그대로 쓴다 — shared/golfMatch.ts 의 resolvePars 는 9칸이 **전부 3~6 정수**일 때만 아는 파로 본다.
 * 그 밖이면 '파 미확인'이다. 여기 규칙이 그것과 어긋나면 "저장은 됐는데 경기 화면은 여전히 미확인"이 된다 — 테스트로 묶었다.
 *
 * 골프장 페이지의 courses 칸(golf_course_pages.courses)은 적재 스크립트(server/scripts/golf-course-pages.ts buildPages)가
 * rankue_golf_courses 에서 베껴 만든다. 어드민이 파를 고치면 그 골프장 페이지만 **같은 식으로** 다시 만든다(pageCoursesFromNines).
 * 식이 갈라지면 다음 적재 때 페이지가 조용히 바뀐다.
 *
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙, 2026-08-16·09-14 사고).
 */
import { isUploadedLogo } from "./golfLogo.js";

/** 코스 한 줄 = 9홀 */
export const NINE = 9;
export const PAR_MIN = 3;
export const PAR_MAX = 6;
/**
 * 9홀 파 합의 흔한 범위. 밖이면 한 칸 잘못 누른 경우가 대부분이라 한 번 더 묻는다.
 * 막지는 않는다 — 파3 코스(27)·롱 코스(38)가 실제로 있다(서버는 force 로 받는다).
 */
export const NINE_SUM_MIN = 34;
export const NINE_SUM_MAX = 37;
/** 경기 화면 코스 이름 칸이 20자까지다(NewGame 입력·회원이 알려 주는 코스 이름과 같은 한도) */
export const NINE_NAME_MAX = 20;
/** 한 골프장의 코스 줄 상한 — 지금 가장 많은 곳이 6개. 잘못 눌러 수십 줄이 생기지 않게 */
export const NINES_PER_CLUB_MAX = 12;

/** 한 홀 파로 쓸 수 있는 값 — golfMatch.ts validPar 와 같다 */
export const isParValue = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= PAR_MIN && (v as number) <= PAR_MAX;

/**
 * 경기 화면이 '아는 파'로 쓰는 모양인가 — golfMatch.ts nineFrom 과 같다(9칸, 또는 18칸을 앞·뒤로 나눠 씀).
 * 빈 배열·몇 칸만 있는 배열·0 이 섞인 배열은 '파 미확인'.
 */
export function isKnownPars(pars: unknown): boolean {
    return Array.isArray(pars) && (pars.length === NINE || pars.length === NINE * 2) && pars.every(isParValue);
}

export function parSum(pars: readonly number[]): number {
    return pars.reduce((a, b) => a + b, 0);
}

export const isUnusualNineSum = (sum: number): boolean => sum < NINE_SUM_MIN || sum > NINE_SUM_MAX;

export type ParsCheck =
    | { ok: true; pars: number[]; sum: number; unusual: boolean }
    | { ok: false; error: string };

/** 저장할 9홀 파 — 9칸 전부 3~6 정수. 문자열 "4" 는 받지 않는다(화면은 숫자를 보낸다. 모양이 틀린 값은 실수다). */
export function checkNinePars(input: unknown): ParsCheck {
    if (!Array.isArray(input) || input.length !== NINE) return { ok: false, error: "파는 9칸을 모두 채워야 합니다" };
    for (let i = 0; i < NINE; i++) {
        if (!isParValue(input[i])) return { ok: false, error: `${i + 1}번 홀 파가 잘못됐습니다(3~6)` };
    }
    const pars = [...input] as number[];
    const sum = parSum(pars);
    return { ok: true, pars, sum, unusual: isUnusualNineSum(sum) };
}

/**
 * 고치기 전 값(expectedOld) — 화면이 읽어 간 그대로 돌려보낸다. 서버는 이 값이 **지금 값과 같을 때만** 쓴다
 * (파를 공식 사이트에서 채우는 다른 작업이 같은 줄을 먼저 바꿨으면 덮지 않는다). 모양만 본다: 18칸 이하의 원시값 배열.
 */
export function isExpectedParsShape(v: unknown): v is (number | string | null)[] {
    return Array.isArray(v) && v.length <= NINE * 2 && v.every((x) => x === null || typeof x === "number" || typeof x === "string");
}

/**
 * 코드 포인트 순 비교 — 운영 DB 의 `order by name` 이 이 순서다(데이터베이스 정렬 규칙 C.UTF-8 = 바이트 순 = 코드 포인트 순).
 * 'IN' 이 'OUT' 앞, 대문자가 소문자 앞, 한글은 가나다(유니코드) 순. localeCompare 를 쓰면 영문 대소문자 순서가 갈린다.
 */
export function compareCodePoints(a: string, b: string): number {
    const A = Array.from(a), B = Array.from(b);
    const n = Math.min(A.length, B.length);
    for (let i = 0; i < n; i++) {
        const d = A[i].codePointAt(0)! - B[i].codePointAt(0)!;
        if (d) return d;
    }
    return A.length - B.length;
}

export interface PageCourse { name: string; par: number; holes: number }

/**
 * 골프장 페이지 courses 칸 — 적재 스크립트 buildPages 와 **같은 식**(바꾸면 거기도 같이):
 *   pars 를 Number 로 바꿔 0 보다 큰 것만 남긴다 → 하나도 없으면 그 코스는 뺀다 → { name, par: 합, holes: 칸 수 } → 이름순.
 *   한 코스도 없으면 null — 적재 스크립트가 `coursesByClub.get(clubId) ?? null` 로 넣는 값(JSON null).
 */
export function pageCoursesFromNines(rows: readonly { name: string; pars: unknown }[]): PageCourse[] | null {
    const out: PageCourse[] = [];
    const sorted = [...rows].sort((a, b) => compareCodePoints(String(a.name), String(b.name)));
    for (const r of sorted) {
        const pars: number[] = Array.isArray(r.pars) ? r.pars.map(Number).filter((n: number) => n > 0) : [];
        if (!pars.length) continue;
        out.push({ name: r.name, par: pars.reduce((a, b) => a + b, 0), holes: pars.length });
    }
    return out.length ? out : null;
}

/**
 * "4 4 3 5 4 3 4 5 4" · "4,4,3,5,4,3,4,5,4" · "443543454" → 9칸. 공식 홈페이지 스코어카드를 복사해 한 칸에 붙여넣을 때.
 * 숫자 덩어리가 정확히 9개(또는 9자리 한 덩어리)이고 전부 3~6 일 때만 — 합계(36)가 붙어 오면 10개라 받지 않는다(틀린 칸에 들어가느니 안 받는다).
 */
export function parseParsText(text: string): number[] | null {
    const runs = String(text ?? "").match(/\d+/g) ?? [];
    let nums: number[];
    if (runs.length === NINE) nums = runs.map(Number);
    else if (runs.length === 1 && runs[0].length === NINE) nums = runs[0].split("").map(Number);
    else return null;
    return nums.every(isParValue) ? nums : null;
}

// ── 코스 이름 ──────────────────────────────────────────────────────
/**
 * 같은 골프장 안에서 같은 이름인가를 볼 열쇠 — 띄어쓰기·대소문자 무시('문화 OUT' = '문화OUT' = '문화 out').
 * 경기 화면은 이름 글자 그대로 파를 찾고 앞 낱말로 후반 코스를 짝지어서, 표기만 다른 두 줄이 있으면 어느 쪽 파가 쓰일지 모른다.
 */
export const nineNameKey = (name: string): string => String(name ?? "").normalize("NFC").replace(/\s+/g, "").toLowerCase();

export function cleanNineName(input: unknown): { ok: true; name: string } | { ok: false; error: string } {
    if (typeof input !== "string") return { ok: false, error: "코스 이름을 적어 주세요" };
    const name = input.normalize("NFC").replace(/\s+/g, " ").trim();
    if (!name) return { ok: false, error: "코스 이름을 적어 주세요" };
    if (name.length > NINE_NAME_MAX) return { ok: false, error: `코스 이름은 ${NINE_NAME_MAX}자까지입니다` };
    if (/[\u0000-\u001f\u007f<>]/.test(name)) return { ok: false, error: "코스 이름에 쓸 수 없는 글자가 있습니다" };
    return { ok: true, name };
}

// ── 홈페이지·전화 ──────────────────────────────────────────────────
export const WEBSITE_MAX = 300;
type Cleaned = { ok: true; value: string | null } | { ok: false; error: string };

/** 홈페이지 — http(s) 주소만. 빈 값·null 은 '지우기'. 주소 꼴은 고치지 않는다(받은 그대로, 앞뒤 공백만 뗀다). */
export function cleanWebsite(input: unknown): Cleaned {
    if (input === null) return { ok: true, value: null };
    if (typeof input !== "string") return { ok: false, error: "홈페이지 주소가 잘못됐습니다" };
    const s = input.trim();
    if (!s) return { ok: true, value: null };
    if (s.length > WEBSITE_MAX) return { ok: false, error: "홈페이지 주소가 너무 깁니다" };
    if (!/^https?:\/\//i.test(s)) return { ok: false, error: "홈페이지 주소는 http:// 또는 https:// 로 시작해야 합니다" };
    if (/\s/.test(s)) return { ok: false, error: "홈페이지 주소에 띄어쓰기가 있습니다" };
    let u: URL;
    try { u = new URL(s); } catch { return { ok: false, error: "홈페이지 주소가 잘못됐습니다" }; }
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname.includes(".") || u.username || u.password) {
        return { ok: false, error: "홈페이지 주소가 잘못됐습니다" };
    }
    return { ok: true, value: s };
}

/** 대표 전화 — 숫자와 '-' 만, 숫자 8~12자리(1588-1234 · 02-123-4567 · 0507-1234-5678). 빈 값·null 은 '지우기'. */
export function cleanPhone(input: unknown): Cleaned {
    if (input === null) return { ok: true, value: null };
    if (typeof input !== "string") return { ok: false, error: "전화번호가 잘못됐습니다" };
    const s = input.trim();
    if (!s) return { ok: true, value: null };
    if (!/^\d+(-\d+)*$/.test(s)) return { ok: false, error: "전화번호는 숫자와 - 만 씁니다(예: 031-123-4567)" };
    const digits = s.replace(/-/g, "").length;
    if (digits < 8 || digits > 12) return { ok: false, error: "전화번호 자릿수가 맞지 않습니다" };
    return { ok: true, value: s };
}

// ── 좌표(라운드 원장) ──────────────────────────────────────────────
/** 한국 땅 — 마라도(33.1)~고성(38.6), 백령도(124.6)~독도(131.9). 위도·경도가 뒤바뀌면 여기서 걸린다. */
export const KOREA_BOUNDS = { latMin: 33, latMax: 39, lngMin: 124, lngMax: 132 } as const;

export function checkKoreaCoords(lat: unknown, lng: unknown): { ok: true; lat: number; lng: number } | { ok: false; error: string } {
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return { ok: false, error: "위도·경도를 숫자로 적어 주세요" };
    }
    const b = KOREA_BOUNDS;
    if (lat < b.latMin || lat > b.latMax || lng < b.lngMin || lng > b.lngMax) {
        return { ok: false, error: "한국 안의 좌표가 아닙니다(위도 33~39, 경도 124~132) — 위도·경도가 바뀌지 않았는지 보세요" };
    }
    // 소수 7자리(약 1cm)면 충분하다 — 지도에서 복사한 긴 꼬리를 자른다
    const r = (n: number) => Math.round(n * 1e7) / 1e7;
    return { ok: true, lat: r(lat), lng: r(lng) };
}

/** "37.27612, 127.43011" · "37.27612 127.43011" → 숫자 둘. 지도 앱의 '좌표 복사'를 그대로 붙여넣는 칸. 아니면 null */
export function parseLatLngText(text: string): { lat: number; lng: number } | null {
    const m = String(text ?? "").trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const lat = Number(m[1]), lng = Number(m[2]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

// ── 빈칸 판정(목록 칩) ─────────────────────────────────────────────
/**
 * 칩 순서 = 화면 순서. 파가 맨 앞 — 경기 화면 '파 미확인'이 가장 아프다.
 * 파는 둘로 가른다(겹치지 않는다): 코스 줄은 있는데 파가 빈 곳(pars — 파만 채우면 된다)과
 * 코스 줄이 하나도 없는 곳(nines — 코스 이름부터 넣어야 한다. 2026-10-01 실측 195곳이라 섞으면 앞의 43곳이 묻힌다).
 */
export const MISSING_KEYS = ["pars", "nines", "logo", "website", "phone", "coords", "club", "fees"] as const;
export type MissingKey = (typeof MISSING_KEYS)[number];
export const MISSING_LABEL: Readonly<Record<MissingKey, string>> = {
    pars: "파 미확인", nines: "코스 없음", logo: "로고", website: "홈페이지", phone: "전화", coords: "좌표", club: "원장 연결", fees: "요금",
};

export interface CourseDataFacts {
    logo: string | null;
    website: string | null;
    phone: string | null;
    /** golf_course_pages.club_id — 라운드 원장(rankue_golf_clubs) 연결 */
    clubId: string | null;
    clubLat: number | null;
    clubLng: number | null;
    /** 그린피 표 또는 대표 그린피 */
    hasFees: boolean;
    /** 그 원장 골프장의 코스(9홀) 줄 수 · 그중 경기 화면이 아는 파 */
    nines: number;
    ninesWithPars: number;
}

/**
 * 비어 있는 칸들.
 *  - pars: 원장 골프장에 코스 줄은 있는데 파 미확인 줄이 하나라도 있다(경기 화면 '파 미확인').
 *  - nines: 원장 골프장에 코스 줄이 하나도 없다 — 전반·후반 목록이 비어 회원이 이름을 적어야 시작한다(파도 당연히 모른다).
 *  - coords: 원장 골프장 좌표가 없다 — 현장 인증(2km)이 원장 좌표부터 본다. 원장이 없는 곳은 club 으로 센다(좌표를 넣을 데가 없다).
 *  - club: 라운드 원장에 짝이 없다 — 코스·파·좌표를 넣을 수 없다(적재 스크립트가 이름·좌표로 짝을 짓는다).
 */
export function missingFields(f: CourseDataFacts): MissingKey[] {
    const blank = (s: string | null) => !s || !s.trim();
    const out: MissingKey[] = [];
    if (f.clubId && f.nines === 0) out.push("nines");
    else if (f.clubId && f.ninesWithPars < f.nines) out.push("pars");
    if (blank(f.logo)) out.push("logo");
    if (blank(f.website)) out.push("website");
    if (blank(f.phone)) out.push("phone");
    if (f.clubId && (f.clubLat == null || f.clubLng == null)) out.push("coords");
    if (!f.clubId) out.push("club");
    if (!f.hasFees) out.push("fees");
    return out;
}

// ── 로고 출처 ──────────────────────────────────────────────────────
/**
 * 로고 파일 이름으로 출처를 안다 — 적재 스크립트를 다시 돌리면 어디서 다시 붙는지.
 *  official: 골프장 공식 홈페이지 로고 `/img/golf-logos/g-<sha1(slug) 10자>[-light].png` (server/scripts/data/golf-logos-official.json)
 *  dbegl:    오너가 준 더블이글 자료 `/img/golf-logos/<자료 id>.png` (golf-course-dbegl.ts, --dbegl)
 *  upload:   어드민에서 올린 로고(2026-10-07, shared/golfLogo.ts) — 우리 저장소에 있고, 다시 적재해도 남는다
 */
export type LogoOrigin = "official" | "dbegl" | "upload" | "other";
export function logoOrigin(logo: string | null | undefined): LogoOrigin | null {
    if (!logo || !logo.trim()) return null;
    if (/^\/img\/golf-logos\/g-[0-9a-f]{10}(-light)?\.png$/i.test(logo)) return "official";
    if (/^\/img\/golf-logos\/\d+\.png$/.test(logo)) return "dbegl";
    if (isUploadedLogo(logo)) return "upload";
    return "other";
}
