/**
 * 물때 지점(2026-11-04 — shared/fishingTidePoints). 지점 목록은 server/assets/fishing/tide-points.json(server/scripts/fishing-tide-points.ts),
 * 만조 · 간조는 항구와 같은 길(services/fishingPort officialTideTurns — 조석예보 고 · 저조, fishing_obs 'tidehl' 에 지점 · 날마다 한 번).
 *
 *  · tidePointData(fetch: true)  화면의 API — 없는 날만 하나씩 받는다(초당 제한이 있어 차례로 · 사이를 둔다). 못 받은 날은 빈 날로 둔다.
 *  · tidePointData(fetch: false) 검색용 화면 · 이웃 링크 — 받아 둔 것만 읽는다(봇이 한꺼번에 와도 바깥을 부르지 않는다).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TIDE_POINT_DAYS, fishingTidePath, nearTidePoints, nearestTidePoint, type SpotTideToday, type TidePointData, type TidePointDef, type TidePointSpot } from "../../shared/fishingTidePoints.js";
import { tideOf } from "../../shared/fishingTide.js";
import { FISHING_PORTS } from "../../shared/fishingStations.js";
import { nearestPort } from "../../shared/fishingPlaces.js";
import { fishingPortPath, seaAreaById } from "../../shared/fishingSeaPages.js";
import { tideAddDays } from "../../shared/fishingTide.js";
import { fishingKstDay } from "../../shared/fishing.js";
import type { PublicPlace } from "../../shared/fishingPlaces.js";
import { cachedTideTurns, officialTideTurns } from "./fishingPort.js";

let points: TidePointDef[] | null = null;
export function tidePoints(): TidePointDef[] {
    if (points) return points;
    const candidates = [path.join(process.cwd(), "server/assets/fishing/tide-points.json"), path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/fishing/tide-points.json")];
    for (const c of candidates) if (fs.existsSync(c)) { points = JSON.parse(fs.readFileSync(c, "utf8")) as TidePointDef[]; return points; }
    return [];
}
export const tidePointByName = (name: string): TidePointDef | null => {
    const n = name.normalize("NFC").trim();
    return tidePoints().find((p) => p.name === n) ?? null;
};

/** 바다 낚시터 가운데 이 지점에서 가까운 곳(30km 안) — 거리순 */
export function spotsNearTide(all: readonly PublicPlace[], p: Pick<TidePointDef, "lat" | "lng">, n = 8): TidePointSpot[] {
    const km = (x: { lat: number; lng: number }) => Math.hypot((x.lng - p.lng) * 88.8, (x.lat - p.lat) * 111);
    return all.filter((x) => x.kind === "바다" && x.lat != null && x.lng != null)
        .map((x) => ({ id: x.id, name: x.name, km: Math.round(km({ lat: x.lat!, lng: x.lng! }) * 10) / 10, species: (x.species ?? []).slice(0, 3) }))
        .filter((x) => x.km <= 30).sort((a, b) => a.km - b.km).slice(0, n);
}

/** 이 낚시터에서 가장 가까운 물때 지점(바다 낚시터만 — 30km 안) */
export const tidePointNearPlace = (pl: PublicPlace) => (pl.kind === "바다" && pl.lat != null && pl.lng != null ? nearestTidePoint(tidePoints(), { lat: pl.lat, lng: pl.lng }) : null);

/**
 * 바다 낚시터의 오늘 물때 — 가장 가까운 물때 지점과 항구 가운데 더 가까운 쪽. 받아 둔 것이 없으면 그날 하나만 받는다(검색용 화면 — 낚시터마다 한 번).
 */
export async function spotTideToday(pl: PublicPlace, nowMs = Date.now()): Promise<SpotTideToday | null> {
    if (pl.kind !== "바다" || pl.lat == null || pl.lng == null) return null;
    const tp = tidePointNearPlace(pl), port = nearestPort(FISHING_PORTS, pl);
    const pick = tp && (!port || tp.km < port.km)
        ? { code: tp.code, name: tp.name, path: fishingTidePath(tp.name), km: tp.km, area: tp.area }
        : port ? { code: port.code, name: port.name, path: fishingPortPath(port.name), km: port.km, area: port.area } : null;
    if (!pick) return null;
    const day = fishingKstDay(nowMs);
    const turns = (await cachedTideTurns(pick.code, [day]).catch(() => new Map())).get(day) ?? await officialTideTurns(pick.code, day).catch(() => null);
    if (!turns?.length) return null;
    return { name: pick.name, path: pick.path, km: pick.km, day, tideName: tideOf(day, seaAreaById(pick.area)?.tide ?? "south")?.name ?? null, turns };
}

/** 받기 사이의 틈(ms) — 국립해양조사원은 초당 요청 수를 막는다 */
const GAP_MS = 150;
/** 한 번의 요청에서 바깥을 부르는 데 쓰는 시간의 뚜껑(ms) — 서버리스는 10초 안에 끝나야 한다 */
const FETCH_BUDGET_MS = 5000;

export async function tidePointData(p: TidePointDef, all: readonly PublicPlace[], opts: { fetch: boolean; nowMs?: number }): Promise<TidePointData> {
    const today = fishingKstDay(opts.nowMs ?? Date.now());
    const days = Array.from({ length: TIDE_POINT_DAYS }, (_, i) => tideAddDays(today, i));
    const have = await cachedTideTurns(p.code, days).catch(() => new Map());
    if (opts.fetch) {
        // 시간 뚜껑 — 한 날에 3초까지 걸릴 수 있다. 못 받은 날은 다음에 연 사람이 받는다
        const until = Date.now() + FETCH_BUDGET_MS;
        for (const d of days) {
            if (have.has(d)) continue;
            if (Date.now() > until) break;
            const t = await officialTideTurns(p.code, d).catch(() => null);
            if (t?.length) have.set(d, t);
            await new Promise((r) => setTimeout(r, GAP_MS));
        }
    }
    return {
        point: p,
        days: days.map((day) => ({ day, turns: have.get(day) ?? [] })),
        near: nearTidePoints(tidePoints(), p, 8),
        spots: spotsNearTide(all, p),
    };
}
