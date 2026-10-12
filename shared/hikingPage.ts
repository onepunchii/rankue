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

export function hikingHubSeo(c: { total: number; famous: number; courses: number }): HikingSeo {
    return {
        path: HIKING_HUB_PATH,
        title: `전국 명산 · 등산 코스 ${c.courses.toLocaleString("en-US")}개${BRAND}`,
        desc: `산림청 100대 명산을 비롯한 전국 ${c.total.toLocaleString("en-US")}곳의 산을 권역별로. 산마다 등산 코스의 거리 · 오르막 · 높낮이와 길 위의 갈림길 · 위험 구간 · 대피소, 날씨를 한 화면에서 볼 수 있어요.`,
    };
}
export function hikingRegionSeo(r: HikingRegion, n: number): HikingSeo {
    return { path: hikingRegionPath(r.id), title: `${r.name}의 산 ${n.toLocaleString("en-US")}곳 — 등산 코스 · 높이${BRAND}`, desc: `${r.name} 권역(${r.sidos.join(" · ")})의 산 ${n.toLocaleString("en-US")}곳. 명산부터 높은 순으로, 산마다 등산 코스와 날씨를 볼 수 있어요.` };
}
export function hikingListSeo(l: { id: string; name: string; note?: string }, n: number): HikingSeo {
    return { path: hikingListPath(l.id), title: `${l.name} ${n.toLocaleString("en-US")}곳 — 높이 · 등산 코스${BRAND}`, desc: `${l.name} ${n.toLocaleString("en-US")}곳의 높이와 위치, 등산 코스를 한눈에.${l.note ? ` ${l.note}.` : ""}` };
}

export interface SeoMountain { slug: string; name: string; heightM: number | null; sido: string | null; sigungu: string | null; courses: number; minKm: number | null; maxKm: number | null; lists: readonly string[]; subtitle?: string | null }
/** "3.2~11.4km" · "7.1km" */
export const kmRange = (min: number | null, max: number | null): string => {
    if (min == null || max == null) return "";
    const f = (v: number) => (Math.round(v * 10) / 10).toString();
    return f(min) === f(max) ? `${f(min)}km` : `${f(min)}~${f(max)}km`;
};
export const listNames = (lists: readonly string[]): string[] => HIKING_LISTS.filter((l) => lists.includes(l.id)).map((l) => l.name);
export function mountainSeo(m: SeoMountain): HikingSeo {
    const h = heightText(m.heightM), place = mountainPlace(m);
    const head = [`${m.name}`, m.courses > 0 ? `등산 코스 ${m.courses}개` : "등산", h ? `높이 ${h}` : ""].filter(Boolean).join(" · ");
    const course = m.courses > 0 ? `등산 코스 ${m.courses}개(${kmRange(m.minKm, m.maxKm)})의 높낮이와 길 위의 갈림길 · 위험 구간 · 대피소, ` : "";
    const lists = listNames(m.lists);
    return {
        path: hikingMountainPath(m.slug),
        title: `${head}${BRAND}`,
        desc: `${place ? `${place}의 ` : ""}${m.name}${h ? `(${h})` : ""}. ${course}산의 날씨를 한 화면에서.${lists.length ? ` ${lists.join(" · ")}.` : ""}`.trim(),
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
export const COURSE_TIME_NOTE = "걷는 시간은 거리와 오르막으로 어림한 값이에요(쉬는 시간 빼고).";
/** 코스의 모양 — 원점 회귀 · 정상까지 · 지나가는 길 */
export function courseShape(c: { loop: boolean; summitKm: number | null; km: number }): string {
    if (c.loop) return "원점 회귀";
    if (c.summitKm != null && c.summitKm >= c.km * 0.85) return "정상까지";
    if (c.summitKm != null && c.summitKm <= c.km * 0.15) return "정상에서 내려오는 길";
    return c.summitKm != null ? "정상을 지나는 길" : "능선 · 둘레 길";
}

/** 가입 안내 — 산 화면 · 허브의 아래. 등산 기능은 아직 열리지 않았다(준비 중이라고 말한다) */
export const HIKING_CTA = {
    title: "오른 산을 도장으로 모아 보세요",
    body: "정상에서 인증하면 그 산의 도장이 찍히고, 권역을 다 채우면 와펜을 받아요. 랭큐 등산이 곧 열려요 — 가입해 두면 열릴 때 알려 드려요.",
    button: "랭큐 가입하고 기다리기",
    member: "랭큐 등산이 곧 열려요. 열리면 알림으로 알려 드릴게요.",
} as const;

export { HIKING_HUB_PATH, HIKING_LISTS, hikingList, hikingListPath, hikingMountainPath, hikingRegion, hikingRegionPath };
export type { HikingListId, HikingRegionId };
