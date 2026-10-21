/**
 * 코리아둘레길 — 공개 자료 읽기(2026-10-21). 서버 server/routes/modules/trails(누구에게나 열려 있다). 규칙 · 글은 shared/koreaTrails.
 */
import type { TrailCourseDetail, TrailCourseSummary, TrailRoute } from "@shared/koreaTrails";
import type { NearbyFestival } from "@shared/tourFestivals";
import type { WxDay } from "@shared/golfWeather";

export const TRAILS_KEY = ["/api/hiq/trails"] as const;
export const trailCourseKey = (route: string, key: string) => [`/api/hiq/trails/${encodeURIComponent(route)}/${encodeURIComponent(key)}`] as const;
export const trailWeatherKey = (route: string, key: string) => [`/api/hiq/trails/${encodeURIComponent(route)}/${encodeURIComponent(key)}/weather`] as const;
/** 표지(2026-10-21 — 판화 화풍 · 해안 길의 등대와 걷는 사람. 우리 그림이라 잘라 써도 된다) */
export const TRAILS_COVER = "/hiking/art/cover-trails.webp";

export interface TrailRouteInfo extends TrailRoute { line: string | null; desc: string | null; have: number; haveKm: number }
export interface TrailsData { routes: TrailRouteInfo[]; courses: TrailCourseSummary[] }
export interface TrailSide extends TrailCourseSummary { line: number[][] }
export interface TrailCourseData { course: TrailCourseDetail; prev: TrailSide | null; next: TrailSide | null; festivals: NearbyFestival[] }
export interface TrailWeather { days: WxDay[]; area: string | null }
