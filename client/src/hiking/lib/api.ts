/**
 * 등산 — 공개 자료 읽기(2026-10-13). 서버 server/routes/modules/hiking(누구에게나 열려 있다).
 * 모양은 server/storage/hiking 의 것과 같다(화면이 서버 파일을 임포트하지 않게 여기에 다시 적는다).
 */
import { apiRequest } from "@/lib/queryClient";
import type { HikingNearbyKind, HikingNearbyResult } from "@shared/hikingAround";
import type { LinePoint } from "@shared/hikingGeo";
import type { MountainGuide } from "@shared/hikingGuide";
import type { HikingPoiKind } from "@shared/hikingPois";
import type { CourseSurface } from "@shared/hikingSurface";

export interface MountainSummary {
    id: string; slug: string; name: string; heightM: number | null; lat: number | null; lng: number | null;
    region: string | null; sido: string | null; sigungu: string | null; tier: number;
    lists: string[]; kfsNo: number | null; traits: string[]; courses: number; minKm: number | null; maxKm: number | null; hasGuide: boolean; subtitle: string | null;
}
export interface MountainCourse { id: string; seq: number; km: number; gainM: number; lossM: number; minM: number; maxM: number; loop: boolean; summitKm: number | null; line: LinePoint[]; via?: string | null; surface?: CourseSurface | null }
export interface MountainPoi { id: string; kind: HikingPoiKind; name: string; note: string | null; lat: number; lng: number; altM: number | null; courseId: string | null; km: number | null }
export interface MountainDetail extends MountainSummary {
    peakName: string | null; aliases: string[]; dong: string | null; guide: MountainGuide | null; poiCounts: Record<string, number>;
    courseList: MountainCourse[]; pois: MountainPoi[]; nearby: (MountainSummary & { km: number })[];
}
export interface HikingHubData {
    counts: { total: number; famous: number; courses: number; withCourse: number };
    famous: MountainSummary[];
    regions: { id: string; name: string; total: number; famous: number }[];
    lists: { id: string; name: string; short: string; count: number }[];
    traits: { id: string; name: string; how: string; count: number }[];
}

export const HIKING_HUB_KEY = ["/api/hiq/hiking/hub"] as const;
export const mountainsKey = (q: Record<string, string>) => [`/api/hiq/hiking/mountains?${new URLSearchParams(q).toString()}`] as const;
export const mountainKey = (slug: string) => [`/api/hiq/hiking/mountains/${encodeURIComponent(slug)}`] as const;
export const mountainWeatherKey = (slug: string) => [`/api/hiq/hiking/mountains/${encodeURIComponent(slug)}/weather`] as const;

/**
 * 산 근처의 맛집 · 카페(네이버 지역 검색 — shared/hikingAround 머리말). **캐시 열쇠를 두지 않는다**: 약관상 저장이 안 되는 자료인데
 * 앱의 조회 캐시는 기기에 일주일 남는다(lib/queryClient 의 저장). 그래서 조회 훅을 거치지 않고 그때그때 받아, 구역이 떠 있는 동안만 들고 있는다.
 * 보내는 것은 산의 주소(slug)와 칩의 종류뿐 — 검색어는 서버가 만든다.
 */
export async function fetchMountainNearby(slug: string, kind: HikingNearbyKind): Promise<HikingNearbyResult> {
    const r: any = await apiRequest(`/api/hiq/hiking/mountains/${encodeURIComponent(slug)}/nearby?kind=${kind}`);
    return { query: String(r?.query ?? ""), items: Array.isArray(r?.items) ? r.items : [] };
}
