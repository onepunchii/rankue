/**
 * 조과의 자리(2026-10-15 오너: "좌표 받음") — 잡은 자리의 좌표 · 그날 바다의 한 장 · 같은 자리의 기록.
 *
 *   · 좌표는 한국 바다와 땅 안에서만 받는다. 밖이면 버린다(잘못 잡힌 위치를 기록으로 남기지 않는다).
 *   · 그날 바다(날씨)는 새 날씨 API 를 부르지 않는다 — 이미 받는 낚시지수 지도(지점 마흔아홉 곳)에서 가장 가까운 지점의
 *     파고 · 바람 · 수온 · 물때를 적어 둔다. 40km 안에 지점이 없으면(민물 · 내륙) 적지 않는다.
 *   · 같은 자리 = 100m 안. 포인트를 따로 만들지 않고 좌표끼리 잰다(OpenFishing 의 방식을 우리 말로 옮김 — 코드는 옮기지 않았다).
 * 좌표는 내 기록에만 있다. 랭킹 · 공개 화면은 좌표를 내보내지 않는다.
 */
import type { IndexSpot } from "./fishingPort.js";

export interface CatchWeather {
    point: string;
    km: number;
    wave: [number, number] | null;
    wind: [number, number] | null;
    wtemp: [number, number] | null;
    tide: string | null;
}

export const WEATHER_MAX_KM = 40;
export const SAME_SPOT_M = 100;

const inKorea = (lat: number, lng: number) => lat >= 33 && lat <= 39.6 && lng >= 124 && lng <= 132;

/** 받은 좌표를 다듬는다. 둘 다 숫자이고 한국 안이면 소수 다섯째 자리(약 1m)까지, 아니면 null */
export function cleanCoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
    const a = typeof lat === "number" ? lat : Number(lat);
    const b = typeof lng === "number" ? lng : Number(lng);
    if (lat == null || lng == null || !Number.isFinite(a) || !Number.isFinite(b) || !inKorea(a, b)) return null;
    return { lat: Math.round(a * 1e5) / 1e5, lng: Math.round(b * 1e5) / 1e5 };
}

export function spotKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const r = Math.PI / 180;
    const dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearestWeather(spots: readonly IndexSpot[], lat: number, lng: number, maxKm = WEATHER_MAX_KM): CatchWeather | null {
    let best: IndexSpot | null = null, bestKm = Infinity;
    for (const s of spots) {
        if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
        const km = spotKm(lat, lng, s.lat, s.lng);
        if (km < bestKm) { best = s; bestKm = km; }
    }
    if (!best || bestKm > maxKm) return null;
    return { point: best.name, km: Math.round(bestKm * 10) / 10, wave: best.wave, wind: best.wind, wtemp: best.wtemp, tide: best.tide };
}

export function sameSpot<T extends { id: string; lat?: number | null; lng?: number | null }>(all: readonly T[], one: T, radiusM = SAME_SPOT_M): T[] {
    if (one.lat == null || one.lng == null) return [];
    return all.filter((c) => c.id !== one.id && c.lat != null && c.lng != null && spotKm(one.lat!, one.lng!, c.lat, c.lng) * 1000 <= radiusM);
}

export function weatherLine(w: CatchWeather | null | undefined): string | null {
    if (!w) return null;
    const range = (v: [number, number] | null, unit: string) => (v ? (v[0] === v[1] ? `${v[0]}${unit}` : `${v[0]}~${v[1]}${unit}`) : null);
    const parts = [range(w.wtemp, "°") && `수온 ${range(w.wtemp, "°")}`, range(w.wave, "m") && `파고 ${range(w.wave, "m")}`, range(w.wind, "m/s") && `바람 ${range(w.wind, "m/s")}`, w.tide];
    const line = parts.filter(Boolean).join(" · ");
    return line || null;
}
