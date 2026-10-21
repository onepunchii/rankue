/**
 * 전국 축제 — 공개 자료 읽기(2026-10-21). 서버 server/routes/modules/festivals(누구에게나 열려 있다). 규칙 · 글은 shared/festivals.
 */
import type { FestivalDetail, FestivalRow } from "@shared/festivals";

export const FESTIVALS_KEY = ["/api/hiq/festivals"] as const;
export const festivalKey = (id: string) => [`/api/hiq/festivals/${encodeURIComponent(id)}`] as const;
export const festivalPicksKey = (sport: "HIKING" | "FISHING") => [`/api/hiq/festivals/picks?sport=${sport}`] as const;
/** 허브 그림(2026-10-21 — 판화 화풍 · 등산 표지와 같은 색. 우리가 만든 그림이라 잘라 써도 된다) */
export const FESTIVAL_HERO = "/festivals/art/hero.webp";

export interface FestivalsData { today: string; items: FestivalRow[] }
export interface FestivalAround {
    mountains: { slug: string; name: string; heightM: number | null; lat: number; lng: number; km: number; photo: { url: string; lic: "Type1" | "Type3" } | null }[];
    golf: { slug: string; name: string; logo: string | null; lat: number; lng: number; km: number }[];
    fishing: { id: string; name: string; kind: string | null; lat: number; lng: number; km: number }[];
    festivals: (FestivalRow & { km: number })[];
}
export interface FestivalData { today: string; festival: FestivalDetail; around: FestivalAround }
export interface FestivalPick extends FestivalRow { mountain: { slug: string; name: string; km: number } | null }
export interface FestivalPicksData { today: string; items: FestivalPick[] }
