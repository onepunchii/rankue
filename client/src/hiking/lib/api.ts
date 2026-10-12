/**
 * 등산 — 공개 자료 읽기(2026-10-13). 서버 server/routes/modules/hiking(누구에게나 열려 있다).
 * 모양은 server/storage/hiking 의 것과 같다(화면이 서버 파일을 임포트하지 않게 여기에 다시 적는다).
 */
import type { LinePoint } from "@shared/hikingGeo";
import type { MountainGuide } from "@shared/hikingGuide";
import type { HikingPoiKind } from "@shared/hikingPois";

export interface MountainSummary {
    id: string; slug: string; name: string; heightM: number | null; lat: number | null; lng: number | null;
    region: string | null; sido: string | null; sigungu: string | null; tier: number;
    lists: string[]; kfsNo: number | null; traits: string[]; courses: number; minKm: number | null; maxKm: number | null; hasGuide: boolean; subtitle: string | null;
}
export interface MountainCourse { id: string; seq: number; km: number; gainM: number; lossM: number; minM: number; maxM: number; loop: boolean; summitKm: number | null; line: LinePoint[] }
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
