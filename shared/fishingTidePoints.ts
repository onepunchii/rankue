/**
 * 물때 지점(2026-11-04 오너: "나머지 순서대로" — 낚시 2번 '물때 화면 키우기').
 *
 * 검색어 트렌드(10월 상대값): 물때 100 · 낚시터 6.8 · 등산코스 2.3 — 낚시에서 가장 큰 수요는 '○○항 물때'다. 우리 항구 화면은 조위관측소 51곳(DT_)뿐이었다.
 * 국립해양조사원 **조석예보(고, 저조)** API(tideFcstHghLw)는 관측소 말고도 조석예보 지점(SO_ — 미조항 · 대진항 · 상태도 …)의 만조 · 간조를 준다.
 * 그 지점마다 물때표 화면(/fishing/tide/<이름>)을 둔다: 이레의 만조 · 간조 시각 · 높이, 그날의 물때 이름(음력 — shared/fishingTide),
 * 만조 · 간조를 이은 물때 곡선(어림 — cosineTide), 가장 가까운 항구(수온 · 지수는 그 화면), 가까운 물때 지점 · 바다 낚시터.
 *
 * 지점 목록은 server/assets/fishing/tide-points.json(server/scripts/fishing-tide-points.ts 가 만든다 — 관측소 51곳과 같은 이름은 뺀다).
 * 예보는 지점 · 날마다 한 번 받아 표 fishing_tide_hl 에 둔다(예측값은 바뀌지 않는다 — services/fishingTidePoints).
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import type { TideTurn, TidePoint } from "./fishingPort.js";

export const FISHING_TIDE_BASE = "/fishing/tide";
export const fishingTidePath = (name: string) => `${FISHING_TIDE_BASE}/${encodeURIComponent(name)}`;
/** 한 화면에 싣는 날 수(오늘부터) */
export const TIDE_POINT_DAYS = 7;

/** 지점 한 곳 — area 는 가장 가까운 항구(조위관측소)의 바다, port 는 그 항구의 코드 · 거리 */
export interface TidePointDef { code: string; name: string; lat: number; lng: number; area: string; port: { code: string; name: string; km: number } }
export interface TidePointDay { day: string; turns: TideTurn[] }
export interface TidePointNear { name: string; km: number }
export interface TidePointSpot { id: string; name: string; km: number; species: string[] }
/** 낚시터 한 곳의 오늘 물때(바다 낚시터 — 가장 가까운 물때 지점이나 항구) — 검색용 화면이 쓴다 */
export interface SpotTideToday { name: string; path: string; km: number; day: string; tideName: string | null; turns: TideTurn[] }
/** GET /api/hiq/fishing/tide/:name 의 답 */
export interface TidePointData { point: TidePointDef; days: TidePointDay[]; near: TidePointNear[]; spots: TidePointSpot[] }

/** 검색 · 화면이 같이 쓰는 제목 · 설명 — 있는 것만 말한다 */
export function tidePointSeo(p: Pick<TidePointDef, "name" | "port">, areaName: string | null): { title: string; description: string; h1: string } {
    return {
        h1: `${p.name} 물때`,
        title: `${p.name} 물때표 — 오늘 만조 · 간조 시각 · 이레 물때${areaName ? ` · ${areaName}` : ""} | 랭큐 낚시`,
        description: `${p.name}의 오늘부터 이레 동안 만조 · 간조 시각과 높이, 그날의 물때(사리 · 조금)를 국립해양조사원 조석예보로 보여 줘요. 수온 · 바다낚시지수는 가까운 ${p.port.name} 항구에서 볼 수 있어요.`,
    };
}

/**
 * API 한 줄(predcDt "2026-11-04 06:50" · predcTdlvVl · extrSe) → 그날의 꺾임. extrSe 는 그날의 차례다 — 1 · 3 고조, 2 · 4 저조
 * (2026-11-04 실측: 미조항 05:26 205 '1' · 11:11 87 '2' · 17:41 237 '3'). 다른 날 줄 · 꼴이 틀린 줄은 버린다.
 */
export function turnsFromApi(items: readonly { predcDt?: unknown; predcTdlvVl?: unknown; extrSe?: unknown }[], day: string): TideTurn[] {
    const out: TideTurn[] = [];
    for (const it of items) {
        const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/.exec(String(it.predcDt ?? ""));
        const cm = Number(it.predcTdlvVl);
        const se = String(it.extrSe ?? "");
        if (!m || m[1] !== day || !Number.isFinite(cm) || !/^[1-4]$/.test(se)) continue;
        out.push({ min: Number(m[2]) * 60 + Number(m[3]), cm: Math.round(cm), kind: Number(se) % 2 === 1 ? "high" : "low" });
    }
    return out.sort((a, b) => a.min - b.min);
}

/**
 * 만조 · 간조만 있을 때 그날의 물때 곡선(어림) — 꺾임 사이를 코사인으로 잇는다(조석은 대략 반나절 주기의 물결이다).
 * 앞날의 마지막 꺾임 · 뒷날의 첫 꺾임을 주면 0시 · 24시의 양 끝도 잇는다(없으면 반 주기 앞 · 뒤에 반대 꺾임을 놓아 잇는다).
 * 화면의 곡선(TideCurve)에만 쓴다 — 숫자로 말하는 것은 만조 · 간조뿐이다.
 */
/** 반일주조의 꺾임 사이(분) — 앞뒤 날의 꺾임을 모를 때 반 주기 앞 · 뒤에 반대 꺾임을 놓는다 */
const HALF_TIDE_MIN = 372;
export function cosineTide(turns: readonly TideTurn[], prev?: TideTurn | null, next?: TideTurn | null, step = 10): TidePoint[] {
    // 앞 · 뒤 날을 모르면 반 주기 앞 · 뒤에 반대 꺾임(두 번째 · 끝에서 두 번째 꺾임의 높이)을 놓는다 — 0시 · 24시 쪽이 평평하게 눕지 않게
    const n = turns.length;
    const before = prev ? { ...prev, min: prev.min - 1440 } : n >= 2 ? { ...turns[1], min: turns[0].min - HALF_TIDE_MIN } : null;
    const after = next ? { ...next, min: next.min + 1440 } : n >= 2 ? { ...turns[n - 2], min: turns[n - 1].min + HALF_TIDE_MIN } : null;
    const all = [...(before ? [before] : []), ...turns, ...(after ? [after] : [])];
    if (!all.length) return [];
    const out: TidePoint[] = [];
    for (let t = 0; t <= 1440; t += step) {
        let cm: number;
        const i = all.findIndex((x) => x.min >= t);
        if (i <= 0) cm = (i === 0 ? all[0] : all[all.length - 1]).cm;
        else {
            const a = all[i - 1], b = all[i];
            const f = (t - a.min) / Math.max(1, b.min - a.min);
            cm = a.cm + (b.cm - a.cm) * (1 - Math.cos(Math.PI * f)) / 2;
        }
        out.push({ min: t, cm: Math.round(cm) });
    }
    return out;
}

/** 직선 거리(km) — 낚시터와 같은 어림(shared/fishingPlaces placeKm) */
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot((a.lng - b.lng) * 88.8, (a.lat - b.lat) * 111);

/** 가장 가까운 물때 지점 — maxKm 안에서. 없으면 null */
export function nearestTidePoint<T extends { lat: number; lng: number }>(points: readonly T[], at: { lat: number; lng: number }, maxKm = 30): (T & { km: number }) | null {
    let best: (T & { km: number }) | null = null;
    for (const p of points) { const d = km(at, p); if (d <= maxKm && (!best || d < best.km)) best = { ...p, km: Math.round(d * 10) / 10 }; }
    return best;
}

/** 가까운 물때 지점 n곳(자기 자신은 빼고) */
export function nearTidePoints<T extends { code: string; name: string; lat: number; lng: number }>(points: readonly T[], at: { code?: string; lat: number; lng: number }, n = 6, maxKm = 60): TidePointNear[] {
    return points.filter((p) => p.code !== at.code).map((p) => ({ name: p.name, km: Math.round(km(at, p) * 10) / 10 }))
        .filter((x) => x.km <= maxKm).sort((a, b) => a.km - b.km).slice(0, n);
}
