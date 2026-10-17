/**
 * 검색 썸네일·링크 미리보기 카드의 주소(2026-10-08) — 골프장·당구장.
 *
 * 프리렌더·사이트맵(서버)과 화면의 useSeo(클라이언트)가 **같은 주소**를 써야 한다 — 예전에는 화면 쪽이 글자로 따로 적어 두었다.
 * 그림을 바꾸면 CARD_VERSION 을 올린다: 주소가 달라져야 검색엔진·메신저가 새 그림을 다시 가져간다(같은 주소면 예전 그림을 오래 쥐고 있다).
 *   v2 (2026-10-08) 오너: "이미지 너무 별로인데 … 썸네일 시안 몇 개 만들어 줘 봐" → "골프는 시안 C, 당구장은 시안 B"
 *      골프장 = 로고 판(위는 로고, 아래는 이름) · 당구장 = 당구대 그림(위는 당구대, 아래는 이름)
 *
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙) — 이 파일은 아무것도 임포트하지 않는다.
 */
export const CARD_VERSION = 2;

/** 골프장 카드 — 슬러그는 한글이라 인코딩한다 */
export const golfCourseCardUrl = (origin: string, slug: string) => `${origin}/og/golf-course/${encodeURIComponent(slug)}.png?v=${CARD_VERSION}`;
/**
 * 산 카드(2026-10-13 오너: "등산 사이트맵 … 사이트맵 이미지랑 등등") — 산마다 한 장(server/services/hikingMountainCard).
 * 프리렌더 · 사이트맵 · 화면의 useSeo 가 이 주소 하나를 쓴다. 그림을 바꾸면 HIKING_CARD_VERSION 을 올린다. 슬러그는 한글이라 인코딩한다.
 */
export const HIKING_CARD_VERSION = 1;
export const hikingMountainCardUrl = (origin: string, slug: string) => `${origin}/og/hiking-mountain/${encodeURIComponent(slug)}.png?v=${HIKING_CARD_VERSION}`;
/** 낚시터 카드(2026-10-18) — 낚시터마다 한 장(server/services/fishingSpotCard). 프리렌더 · 사이트맵 · 화면의 useSeo 가 이 주소 하나를 쓴다. 그림을 바꾸면 버전을 올린다 */
export const FISHING_CARD_VERSION = 1;
export const fishingSpotCardUrl = (origin: string, id: string) => `${origin}/og/fishing-spot/${encodeURIComponent(id)}.png?v=${FISHING_CARD_VERSION}`;
/** 낚시 어종 카드(2026-10-18) — 어종 id(shared/fishingFish) */
export const fishingFishCardUrl = (origin: string, id: string) => `${origin}/og/fishing-fish/${encodeURIComponent(id)}.png?v=${FISHING_CARD_VERSION}`;
/** 바다 · 항구 물때 카드(2026-10-18) — key 는 'all'(허브) · 해역 id · 항구 이름 */
export const fishingSeaCardUrl = (origin: string, key: string) => `${origin}/og/fishing-sea/${encodeURIComponent(key)}.png?v=${FISHING_CARD_VERSION}`;
/** 당구장 카드 — 매장 코드는 영숫자 */
export const storeCardUrl = (origin: string, code: string) => `${origin}/og/store/${encodeURIComponent(code)}.png?v=${CARD_VERSION}`;

/**
 * 카드 그림의 설명(alt) — 카드에 있는 것만 말한다. 이름에 이미 그 말이 있으면 되풀이하지 않는다
 * ("허슬러1 당구장 당구장 카드" — 매장 이름의 절반쯤이 '당구장'으로 끝난다).
 */
export const cardAlt = (name: string, kind: "골프장" | "당구장") => (name.includes(kind) ? `${name} 카드` : `${name} ${kind} 카드`);

/**
 * 허브 페이지의 썸네일(2026-10-12 오너: "유입을 극대화도 추가해 줘 … 이미지 제작해서 더 시각적으로 풍부하고").
 *
 * 세계랭킹 · PBA · 매장 찾기 · 용어 사전 · 전국 골프장 · 도장깨기 같은 **목록 페이지**는 고유한 그림 없이 공용 og.png 하나를 달고 나갔다 —
 * 검색 결과와 메신저 미리보기에서 어느 페이지든 같은 그림이었다. 페이지마다 우리 그림 + 큰 제목의 정사각 카드를 둔다
 * (위는 그림, 아래는 큰 이름 — 매장 · 골프장 카드와 같은 식구. 90~110px 로 줄어도 제목 두 줄이 읽힌다).
 *
 * 그림은 **정적 파일**이다(client/public/og-hub/<이름>.jpg, 1200 정사각) — 서버가 그리지 않는다. 그래서 주소가 /og/… 가 아니다
 * (vercel.json 이 /og/(.*) 를 서버 함수로 보낸다). 선수 · 매장 · 골프장처럼 **고유 카드가 있는 페이지는 그 카드가 먼저**다.
 * 그림을 바꾸면 HUB_CARD_VERSION 을 올린다.
 */
export const HUB_CARD_VERSION = 1;
export const HUB_CARD_SIZE = 1200;

/** 도장첩의 이름표 — 권마다 카드가 있다(shared/golfStampBooks 의 id 와 같아야 한다. 시험이 맞춰 본다) */
export const HUB_STAMP_BOOKS: readonly string[] = ["seohae", "gyeonggi", "gangwon", "chungcheong", "honam", "yeongnam", "jeju", "invite-capital", "invite-regional"];

/** 등산의 권역 — 권역마다 카드가 있다(shared/hikingMountains 의 HIKING_REGIONS 와 같아야 한다. 시험이 맞춰 본다) */
export const HUB_HIKING_REGIONS: readonly string[] = ["capital", "gangwon", "chungcheong", "jeonbuk", "jeonnam", "gyeongbuk", "gyeongnam", "jeju"];

/** 등산의 묶음 — 묶음마다 카드가 있다(shared/hikingMountains 의 HIKING_GROUPS 와 같아야 한다. 시험이 맞춰 본다). 2026-10-13 */
export const HUB_HIKING_LISTS: readonly string[] = ["kfs100", "kfs100plus", "nationalparks", "provincialparks", "highest50", "over1500", "over1000", "under500", "island", "azalea", "maple", "reeds", "snow"];

/** 카드에 적힌 이름 — 그림의 설명(alt)에 쓴다. shared/hikingMountains 의 권역 · 묶음 이름과 같아야 한다(시험이 맞춰 본다). 이 파일은 아무것도 임포트하지 않는다 */
export const HUB_HIKING_REGION_NAMES: Readonly<Record<string, string>> = { capital: "수도권", gangwon: "강원", chungcheong: "충청", jeonbuk: "전북", jeonnam: "전남", gyeongbuk: "경북", gyeongnam: "경남", jeju: "제주" };
export const HUB_HIKING_LIST_NAMES: Readonly<Record<string, string>> = {
    kfs100: "산림청 100대 명산", kfs100plus: "산림청 100대 명산 플러스", nationalparks: "국립공원의 산", provincialparks: "도립공원의 산", highest50: "남한의 높은 산 50",
    over1500: "해발 1,500m 넘는 산", over1000: "해발 1,000m 넘는 산", under500: "가볍게 오르는 산", island: "섬 산행",
    azalea: "철쭉 · 진달래 명산", maple: "단풍 명산", reeds: "억새 명산", snow: "눈꽃 산행",
};

/** alt 는 글이거나, 카드 이름(test 가 돌려준 값)으로 글을 만드는 함수다 — 권역 · 묶음은 카드마다 이름이 다르다 */
interface HubRule { test: (path: string) => string | null; alt: string | ((name: string) => string) }
const exact = (re: RegExp, name: string) => (path: string) => (re.test(path) ? name : null);
const HUB_RULES: readonly HubRule[] = [
    { test: exact(/^\/world-ranking(\/|$)/, "world-ranking"), alt: "당구 세계랭킹 — 랭큐" },
    { test: exact(/^\/pba(\/records)?\/?$/, "pba"), alt: "PBA 투어 랭킹 · 상금 — 랭큐" },
    { test: exact(/^\/stores\/?$/, "stores"), alt: "전국 당구장 찾기 — 랭큐" },
    // 당구 용어 사전은 /billiards/terms 다 — /terms 는 이용약관이라 카드를 주지 않는다
    { test: exact(/^\/billiards\/terms(\/|$)/, "terms"), alt: "당구 용어 사전 — 랭큐" },
    { test: exact(/^\/golf\/terms(\/|$)/, "golf-terms"), alt: "골프 용어 사전 — 랭큐 골프" },
    { test: exact(/^\/golf\/courses(\/|$)/, "golf-courses"), alt: "전국 골프장 — 랭큐 골프" },
    // 도장첩 한 권 — 그 권의 표지와 볼마커
    { test: (path) => { const m = /^\/golf\/stamps\/([a-z-]+)\/?$/.exec(path); return m && HUB_STAMP_BOOKS.includes(m[1]) ? `golf-stamps-${m[1]}` : null; }, alt: "랭큐 골프 도장첩" },
    { test: exact(/^\/golf\/(stamps|shelf)(\/|$)/, "golf-stamps"), alt: "골프 도장깨기 — 랭큐 골프" },
    // 등산(2026-10-13) — 읽을거리 · 도장첩 · 권역은 제 카드, 그 밖의 등산 화면(허브 · 목록 · 산)은 허브 카드
    { test: exact(/^\/hiking\/terms(\/|$)/, "hiking-terms"), alt: "등산 용어 사전 — 랭큐 등산" },
    { test: exact(/^\/hiking\/checklist\/?$/, "hiking-checklist"), alt: "등산 준비물 — 랭큐 등산" },
    { test: exact(/^\/hiking\/(stamps|pack)(\/|$)/, "hiking-stamps"), alt: "등산 도장첩 · 산행 등급 — 랭큐 등산" },
    { test: (path) => { const m = /^\/hiking\/regions\/([a-z]+)\/?$/.exec(path); return m && HUB_HIKING_REGIONS.includes(m[1]) ? `hiking-${m[1]}` : null; }, alt: (n) => `${HUB_HIKING_REGION_NAMES[n.replace(/^hiking-/, "")] ?? "권역"}의 산 · 등산코스 — 랭큐 등산` },
    // 묶음(100대 명산 · 국립공원 · 단풍 · 억새 · 섬 …) — 묶음마다 그 표지와 큰 이름
    { test: (path) => { const m = /^\/hiking\/lists\/([a-z0-9]+)\/?$/.exec(path); return m && HUB_HIKING_LISTS.includes(m[1]) ? `hiking-list-${m[1]}` : null; }, alt: (n) => `${HUB_HIKING_LIST_NAMES[n.replace(/^hiking-list-/, "")] ?? "묶어서 찾는 산"} · 등산코스 — 랭큐 등산` },
    { test: exact(/^\/hiking(\/|$)/, "hiking"), alt: "전국 명산 — 랭큐 등산" },
];

/** 이 주소(경로만 — 쿼리 없이)의 허브 카드 이름. 없으면 null */
export function hubCardName(pathname: string): string | null {
    const path = pathname.split("?")[0].split("#")[0];
    for (const r of HUB_RULES) { const n = r.test(path); if (n) return n; }
    return null;
}

/** 이 주소의 허브 카드(주소 · 크기 · 설명). 없으면 null — 부르는 쪽이 공용 그림으로 떨어진다 */
export function hubCard(origin: string, pathname: string): { url: string; width: number; height: number; alt: string } | null {
    const path = pathname.split("?")[0].split("#")[0];
    for (const r of HUB_RULES) {
        const n = r.test(path);
        if (n) return { url: `${origin}/og-hub/${n}.jpg?v=${HUB_CARD_VERSION}`, width: HUB_CARD_SIZE, height: HUB_CARD_SIZE, alt: typeof r.alt === "function" ? r.alt(n) : r.alt };
    }
    return null;
}

/** 쓰는 카드 전부 — 파일이 다 있는지 · 남는 파일이 없는지 시험이 본다 */
export const HUB_CARD_NAMES: readonly string[] = ["world-ranking", "pba", "stores", "terms", "golf-terms", "golf-courses", "golf-stamps", ...HUB_STAMP_BOOKS.map((b) => `golf-stamps-${b}`),
    "hiking", "hiking-stamps", "hiking-terms", "hiking-checklist", ...HUB_HIKING_REGIONS.map((r) => `hiking-${r}`), ...HUB_HIKING_LISTS.map((l) => `hiking-list-${l}`)];
