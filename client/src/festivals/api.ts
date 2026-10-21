/**
 * 전국 축제 — 공개 자료 읽기(2026-10-21). 서버 server/routes/modules/festivals(누구에게나 열려 있다). 규칙 · 글은 shared/festivals.
 */
import type { FestivalDetail, FestivalRow } from "@shared/festivals";

export const FESTIVALS_KEY = ["/api/hiq/festivals"] as const;
export const festivalKey = (id: string) => [`/api/hiq/festivals/${encodeURIComponent(id)}`] as const;
export const festivalPicksKey = (sport: "GOLF" | "HIKING" | "FISHING") => [`/api/hiq/festivals/picks?sport=${sport}`] as const;
/** 종목의 자리(지도 밑 · '가까운 ○○') — n 이름 · a 위도 · o 경도 · k 주소 열쇠 */
export const festivalLayerKey = (sport: "GOLF" | "HIKING" | "FISHING") => [`/api/hiq/festivals/layer?sport=${sport}`] as const;
export interface FestivalLayerData { items: { n: string; a: number; o: number; k: string }[] }

export interface FestivalsData { today: string; items: FestivalRow[] }
export interface FestivalAround {
    mountains: { slug: string; name: string; heightM: number | null; lat: number; lng: number; km: number; photo: { url: string; lic: "Type1" | "Type3" } | null }[];
    golf: { slug: string; name: string; logo: string | null; lat: number; lng: number; km: number }[];
    fishing: { id: string; name: string; kind: string | null; lat: number; lng: number; km: number }[];
    festivals: (FestivalRow & { km: number })[];
}
export interface FestivalData { today: string; festival: FestivalDetail; around: FestivalAround }
/** mountain 칸 — 등산은 그 명산, 골프는 그 골프장(칸 이름은 처음 정한 그대로) */
export interface FestivalPick extends FestivalRow { mountain: { slug: string; name: string; km: number } | null }
export interface FestivalPicksData { today: string; items: FestivalPick[] }
