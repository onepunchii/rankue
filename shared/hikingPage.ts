/**
 * 등산 — 공개 화면의 글(2026-10-13). 허브 · 권역 · 목록 · 산 화면의 제목 · 설명 · 구역 이름 · 가입 안내.
 * 화면(client/src/hiking)과 검색용 화면(server/seo/hiking)이 **같은 글**을 쓴다 — 검색 로봇에게만 보이는 문장을 두지 않는다.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { durationText, walkMinutes } from "./hikingGeo.js";
import {
    HIKING_HUB_PATH, HIKING_LISTS, heightText, hikingList, hikingListPath, hikingMountainPath, hikingRegion, hikingRegionPath, mountainPlace,
    type HikingListId, type HikingRegion, type HikingRegionId,
} from "./hikingMountains.js";

const BRAND = " | 랭큐 등산";
export const HIKING_NAV_LABEL = "전국 명산";
export const HIKING_H1 = "랭큐 등산 — 전국 명산";
export const HIKING_TAGLINE = "산을 고르고, 오르고, 정상에서 도장을 받아요.";

export interface HikingSeo { path: string; title: string; desc: string }

/**
 * 제목은 등산객이 찾는 말로 연다(2026-10-13 오너: "키워드 관심사로 사이트맵 메타 제목이랑 해야 돼") — "○○산 등산코스" · "100대 명산 리스트" · "단풍 명산" …
 * 화면의 제목(document.title)과 검색용 화면이 같은 글을 쓴다. 없는 것을 있다고 적지 않는다: 코스가 없는 산의 제목에는 '등산코스'가 없고,
 * 주차장 · 화장실 같은 채비 지점은 그 자료가 있는 산(산림청 100대 명산 코스 파일)에만 적는다. '추천' · '초보'처럼 우리가 보증하지 않는 말은 쓰지 않는다.
 */
export function hikingHubSeo(c: { total: number; famous: number; courses: number }): HikingSeo {
    return {
        path: HIKING_HUB_PATH,
        title: `전국 명산 등산코스 ${c.courses.toLocaleString("en-US")}개 · 100대 명산 지도${BRAND}`,
        desc: `산림청 100대 명산을 비롯한 전국 ${c.total.toLocaleString("en-US")}곳의 산을 권역별로. 산마다 등산코스의 거리 · 오르막 · 높낮이와 코스 지도, 길 위의 갈림길 · 화장실 · 대피소, 날씨를 한 화면에서 볼 수 있어요.`,
    };
}
export function hikingRegionSeo(r: HikingRegion, n: number): HikingSeo {
    return { path: hikingRegionPath(r.id), title: `${r.name} 명산 · 등산코스 — ${r.name}의 산 ${n.toLocaleString("en-US")}곳${BRAND}`, desc: `${r.name} 권역(${r.sidos.join(" · ")})의 산 ${n.toLocaleString("en-US")}곳. 명산부터 높은 순으로, 산마다 등산 코스와 날씨를 볼 수 있어요.` };
}
/** 묶음마다의 제목 — 그 묶음을 찾는 사람이 쓰는 말로. 없는 묶음은 이름 그대로 */
const LIST_TITLE: Readonly<Record<string, (n: string) => string>> = {
    kfs100: (n) => `100대 명산 리스트 · 지도 — 산림청 100대 명산 ${n}곳 등산코스`,
    kfs100plus: (n) => `100대 명산 플러스 리스트 ${n}곳 — 높이 · 등산코스`,
    nationalparks: (n) => `국립공원 산 ${n}곳 — 국립공원 등산코스 · 높이`,
    provincialparks: (n) => `도립공원 산 ${n}곳 — 도립공원 등산코스 · 높이`,
    highest50: (n) => `우리나라 높은 산 순위 ${n} — 남한의 높은 산 등산코스`,
    over1500: (n) => `해발 1,500m 넘는 산 ${n}곳 — 하늘 가까운 산`,
    over1000: (n) => `해발 1,000m 넘는 산 ${n}곳 — 천 미터 산 목록`,
    under500: (n) => `낮은 산 ${n}곳 — 가볍게 오르는 500m 아래 산`,
    island: (n) => `섬 산행 ${n}곳 — 섬의 산 등산코스 · 높이`,
    azalea: (n) => `철쭉 · 진달래 명산 ${n}곳 — 봄 산행 등산코스`,
    maple: (n) => `단풍 명산 ${n}곳 — 가을 단풍 산행 등산코스`,
    reeds: (n) => `억새 명산 ${n}곳 — 가을 억새 산행 등산코스`,
    snow: (n) => `눈꽃 산행 명산 ${n}곳 — 겨울 산 등산코스`,
};
export function hikingListSeo(l: { id: string; name: string; note?: string }, n: number): HikingSeo {
    const count = n.toLocaleString("en-US");
    return { path: hikingListPath(l.id), title: `${LIST_TITLE[l.id]?.(count) ?? `${l.name} ${count}곳 — 높이 · 등산코스`}${BRAND}`, desc: `${l.name} ${n.toLocaleString("en-US")}곳의 높이와 위치, 등산 코스를 한눈에.${l.note ? ` ${l.note}.` : ""}` };
}

export interface SeoMountain { slug: string; name: string; heightM: number | null; sido: string | null; sigungu: string | null; courses: number; minKm: number | null; maxKm: number | null; lists: readonly string[]; subtitle?: string | null }
/** "3.2~11.4km" · "7.1km" */
export const kmRange = (min: number | null, max: number | null): string => {
    if (min == null || max == null) return "";
    const f = (v: number) => (Math.round(v * 10) / 10).toString();
    return f(min) === f(max) ? `${f(min)}km` : `${f(min)}~${f(max)}km`;
};
export const listNames = (lists: readonly string[]): string[] => HIKING_LISTS.filter((l) => lists.includes(l.id)).map((l) => l.name);
/** "0.9km" — 가장 짧은 코스 */
const shortKm = (min: number | null): string => (min == null ? "" : `${(Math.round(min * 10) / 10).toString()}km`);
export function mountainSeo(m: SeoMountain): HikingSeo {
    const h = heightText(m.heightM), place = mountainPlace(m);
    // "설악산 등산코스 9개 · 최단 0.9km · 높이 1,708m" — 코스가 하나면 그 길이만, 없으면 '등산코스'를 쓰지 않는다
    const head = m.courses > 1
        ? [`${m.name} 등산코스 ${m.courses}개`, shortKm(m.minKm) ? `최단 ${shortKm(m.minKm)}` : "", h ? `높이 ${h}` : ""]
        : m.courses === 1 ? [`${m.name} 등산코스`, shortKm(m.minKm), h ? `높이 ${h}` : ""]
        : [`${m.name} 등산`, h ? `높이 ${h}` : "", "위치 · 날씨"];
    // 채비 지점(주차장 · 화장실 · 약수터)과 길의 종류는 산림청 100대 명산 코스 파일에서 온 코스에만 있다
    const rich = m.lists.includes("kfs100");
    const course = m.courses > 0
        ? `등산코스 ${m.courses}개(${kmRange(m.minKm, m.maxKm)})의 코스 지도와 높낮이, ${rich ? "들머리 · 주차장 · 화장실 · 약수터 같은 길 위의 지점과 어떤 길인지(계단 · 바위)" : "길 위의 갈림길 · 위험 구간 · 대피소"}, `
        : "";
    const lists = listNames(m.lists);
    return {
        path: hikingMountainPath(m.slug),
        title: `${head.filter(Boolean).join(" · ")}${BRAND}`,
        desc: `${place ? `${place}의 ` : ""}${m.name}${h ? `(${h})` : ""}. ${course}산의 날씨를 한 화면에서.${lists.length ? ` ${lists.join(" · ")}.` : ""}`.trim(),
    };
}

/** 산 카드(server/services/hikingMountainCard)에 싣는 것 — 우리 표에 있는 사실만 */
export function hikingMountainCardInput(m: SeoMountain & { region?: string | null }): { name: string; height: string; place: string; region: string | null; kfs100: boolean; badge: string | null; courses: string } {
    const kfs100 = m.lists.includes("kfs100");
    return {
        name: m.name, height: heightText(m.heightM) ?? "", place: mountainPlace(m), region: m.region ?? null, kfs100,
        badge: kfs100 ? null : listNames(m.lists)[0] ?? null,
        courses: m.courses > 0 ? `등산코스 ${m.courses}개 · ${kmRange(m.minKm, m.maxKm)}` : "",
    };
}

/** 산 화면의 구역 이름 — 화면과 검색용 화면이 같이 쓴다 */
export const MOUNTAIN_LABEL = {
    courses: "등산 코스",
    coursesAside: "기록된 길의 거리 · 오르막 · 높낮이",
    pois: "길 위에서 만나는 것",
    weather: "산의 날씨",
    about: "산 이야기",
    nearby: "가까운 산",
    stamp: "이 산의 도장",
    books: "이 산이 칸으로 든 도장첩",
    noCourse: "이 산은 아직 받아 둔 코스가 없어요. 높이와 위치, 날씨는 볼 수 있어요.",
} as const;
/** 코스 자료의 출처 줄 */
export const COURSE_SOURCE_NOTE = "코스와 길 위의 지점은 한국등산트레킹지원센터가 2022년에 기록한 자료예요. 참고용이며 현장의 안내와 통제를 따라 주세요.";
export const WEATHER_NOTE = "산 아래 격자의 예보예요. 산 위는 더 춥고 바람이 세요 — 100m 오를 때마다 0.6℃쯤 낮아져요.";
export const OSM_NOTE = "산의 위치 · 높이 자료: 산림청 · © OpenStreetMap contributors";

/** 코스 한 줄 — "코스 1 · 7.1km · 오르막 1,438m · 걷는 시간 약 4시간 10분" */
export function courseFacts(c: { km: number; gainM: number }): { km: string; gain: string; time: string } {
    return { km: `${(Math.round(c.km * 10) / 10).toString()}km`, gain: `${c.gainM.toLocaleString("en-US")}m`, time: `약 ${durationText(walkMinutes(c.km, c.gainM))}` };
}
/** 이웃 봉우리의 코스를 이어 보여 줄 때의 한 줄 — "노적봉 쪽에서 이 산의 정상을 지나는 길" */
export const courseViaNote = (via: string | null | undefined): string => (via ? `${via} 쪽에서 이 산의 정상을 지나는 길이에요.` : "");
export const COURSE_TIME_NOTE = "걷는 시간은 거리와 오르막으로 어림한 값이에요(쉬는 시간 빼고).";
/** 코스의 모양 — 원점 회귀 · 정상까지 · 지나가는 길 */
export function courseShape(c: { loop: boolean; summitKm: number | null; km: number }): string {
    if (c.loop) return "원점 회귀";
    if (c.summitKm != null && c.summitKm >= c.km * 0.85) return "정상까지";
    if (c.summitKm != null && c.summitKm <= c.km * 0.15) return "정상에서 내려오는 길";
    return c.summitKm != null ? "정상을 지나는 길" : "능선 · 둘레 길";
}

/**
 * 가입 안내 — 산 화면 · 허브의 아래. 2026-10-13 등산을 열면서 '곧 열려요 · 가입하고 기다리기'를 걷었다 — 가입하면 바로 쓴다.
 * 받는 것(도장 · 와펜 · 산행 등급)을 앞세운다. 돈 · 경품 · 빠르기를 말하지 않는다.
 */
export const HIKING_CTA = {
    title: "오른 산을 도장으로 모아 보세요",
    body: "정상에서 인증하면 그 산의 도장이 찍히고, 권역을 다 채우면 와펜을 받아요. 코스 지도와 내 위치, 산행 기록, 산악회까지 — 가입하면 바로 시작할 수 있어요.",
    button: "가입하고 산 도장 모으기",
    /** 회원인데 등산 화면이 열리지 않는 사람(한국어가 아닌 화면) — 등산은 한국어 화면에서 쓴다 */
    member: "등산 홈에서 도장첩과 코스 지도를 열어 보세요. 등산은 한국어 화면에서 쓸 수 있어요.",
} as const;

export { HIKING_HUB_PATH, HIKING_LISTS, hikingList, hikingListPath, hikingMountainPath, hikingRegion, hikingRegionPath };
export type { HikingListId, HikingRegionId };

// ── 도장첩 · 배낭(등급 · 와펜 · 핀) ──────────────────────────────────────
export const HIKING_STAMPS_PATH = "/hiking/stamps";
export const HIKING_PACK_PATH = "/hiking/pack";
export const HIKING_STAMPS_SEO: HikingSeo = {
    path: HIKING_STAMPS_PATH,
    title: `등산 도장첩 — 100대 명산 · 철 따라 가는 산 · 국립공원${BRAND}`,
    desc: "정상에서 인증하면 그 산의 도장이 찍혀요. 산림청 100대 명산을 권역별 여덟 권으로, 철쭉 · 단풍 · 억새 · 눈꽃 산과 국립공원 · 높은 산 · 섬의 산으로 묶은 도장첩을 채우고 와펜을 받아요.",
};
export const HIKING_PACK_SEO: HikingSeo = {
    path: HIKING_PACK_PATH,
    title: `산행 등급 · 100대 명산 와펜 · 핀 — 배낭${BRAND}`,
    desc: "산을 오를수록 산행 등급이 올라요 — 들머리에서 하늘금까지 여덟 등급. 100대 명산마다 한 장씩 받는 산 와펜, 도장첩을 다 채워 받는 와펜, 산행을 쌓아 받는 핀을 배낭에 달아요.",
};
/** 도장첩의 첫 줄 — 방문자에게 */
export const HIKING_STAMPS_INTRO = "정상에서 인증하면 그 산의 도장이 찍혀요. 한 권을 다 채우면 받는 와펜을 미리 보여 드려요.";
/** 배낭의 첫 줄 — 방문자에게 */
export const HIKING_PACK_INTRO = "산을 오를수록 산행 등급이 오르고, 100대 명산마다 산 와펜을 한 장씩 받아요. 도장첩을 다 채우면 와펜을, 산행을 쌓으면 핀을 받아 배낭에 달아요. 받을 수 있는 것을 미리 보여 드려요.";
export const HIKING_GRADE_NOTE = "정상에서 인증한 서로 다른 산의 수로 올라요. 같은 산을 여러 번 올라도 한 곳이에요 — 새 산으로 가야 등급이 올라요.";
export const MOUNTAIN_PATCH_NOTE = "와펜의 그림은 산림청 안내에 나오는 그 산의 소재(억새 · 암릉 · 계곡 …)로 그린 휘장이에요. 실제 모습을 옮긴 그림은 아니에요.";
export const HIKING_PIN_NOTE = "정상에서 인증한 산행만 세요. 빨리 오르기나 밤 산행으로 받는 것은 없어요 — 산은 천천히, 밝을 때.";
export const HIKING_PACK_LABEL = { grade: "산행 등급", mountainPatch: "산 와펜", bookPatch: "도장첩 와펜", pin: "핀" } as const;
