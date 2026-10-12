/**
 * 등산 — 산행 중 '길 띠'의 셈(2026-10-13 오너: "gps 추적을 통해 트래킹 체크 … 트래킹 중에 갈림길도 알려 주고 … 너무 복잡하지 않게").
 *
 * 지도 대신 **코스의 높낮이 띠 위에 내 자리**를 놓고, 앞에 무엇이 있는지(갈림길 · 위험 구간 · 대피소)와 정상까지 남은 것을 알려 준다.
 * 지금 앱은 화면이 켜져 있을 때만 위치를 본다(기획서 6장의 A 걸음) — 그래서 이 셈은 '지금 한 점'에서 다 나온다.
 *
 * **위치는 기기 안에서만 쓴다.** 여기의 함수는 화면이 부르고, 서버에는 좌표가 가지 않는다(정상 인증만 예외 — 그것도 저장하지 않는다).
 * 산행을 마치면 남는 것은 걸은 시간 · 길 위의 거리 · 오른 높이뿐이다(hiking_trips).
 *
 * 한계를 숨기지 않는다: 코스 선은 2022년 기록을 160점으로 줄인 것이라 길에서 벗어났는지를 미터 단위로 말할 수 없다.
 * 그래서 '길을 벗어났다'는 경보는 내지 않고, 이 코스에서 아주 멀 때(TRAIL_FAR_M)만 알린다.
 * 순수 함수만. ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { distM, eleAtKm, walkMinutes, type LinePoint } from "./hikingGeo.js";

/** 이보다 멀면 '이 코스 위가 아니다'로 본다(m) */
export const TRAIL_FAR_M = 250;
/** 이보다 흐린 위치(정확도 반경, m)는 자리를 옮기지 않는다 */
export const TRAIL_MAX_ACCURACY_M = 120;
/** 겹쳐 지나는 길(올라간 길로 내려올 때)에서 앞 자리와 이어지는 쪽을 고르는 여유(m) */
const OVERLAP_SLACK_M = 30;
/** 이만큼은 움직여야 방향을 바꾼다(km) — 제자리에서 흔들리는 위치로 방향이 뒤집히지 않게 */
const DIR_MIN_KM = 0.03;
/** 정상 가까이(m) — 정상 인증을 권한다. 서버의 판정(SUMMIT_RADIUS_M)과 같은 값 */
export const TRAIL_SUMMIT_NEAR_M = 150;

export interface OnTrail { km: number; offM: number; ele: number }

/**
 * 한 자리(위경도)를 코스 선의 **선분 위**에 내린다 — 점이 아니라 선분이라 줄인 선에서도 진행이 매끈하다.
 * hintKm 을 주면, 거의 같은 거리로 가까운 자리가 여럿일 때(겹쳐 지나는 길) 앞 자리와 이어지는 쪽을 고른다.
 */
export function projectOnLine(line: readonly LinePoint[], lat: number, lng: number, hintKm?: number | null): OnTrail | null {
    if (line.length === 0 || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (line.length === 1) return { km: line[0][3], offM: distM(lat, lng, line[0][0], line[0][1]), ele: line[0][2] };
    // 그 자리 둘레의 평면 — 수 km 안에서는 오차가 미터 아래다
    const kx = Math.cos((lat * Math.PI) / 180) * 111_320, ky = 110_540;
    const cands: OnTrail[] = [];
    let best = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        const ax = (a[1] - lng) * kx, ay = (a[0] - lat) * ky, bx = (b[1] - lng) * kx, by = (b[0] - lat) * ky;
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
        const d = Math.hypot(ax + t * dx, ay + t * dy);
        if (d < best) best = d;
        cands.push({ km: a[3] + t * (b[3] - a[3]), offM: d, ele: a[2] + t * (b[2] - a[2]) });
    }
    const near = cands.filter((c) => c.offM <= best + OVERLAP_SLACK_M);
    const pick = hintKm != null && Number.isFinite(hintKm) ? near.reduce((p, c) => (Math.abs(c.km - hintKm) < Math.abs(p.km - hintKm) ? c : p)) : near.reduce((p, c) => (c.offM < p.offM ? c : p));
    return { km: Math.round(pick.km * 1000) / 1000, offM: Math.round(pick.offM), ele: Math.round(pick.ele) };
}

/** fromKm 에서 toKm 로 가는 동안의 오르막(m) — 내려가는 방향이면 그 방향으로 오르는 만큼. 줄인 선이라 실제보다 조금 적게 나온다 */
export function climbBetween(line: readonly LinePoint[], fromKm: number, toKm: number): number {
    if (line.length < 2 || fromKm === toKm) return 0;
    const lo = Math.min(fromKm, toKm), hi = Math.max(fromKm, toKm);
    const pts: number[] = [eleAtKm(line, lo), ...line.filter((p) => p[3] > lo && p[3] < hi).map((p) => p[2]), eleAtKm(line, hi)];
    if (fromKm > toKm) pts.reverse();
    let up = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i] > pts[i - 1]) up += pts[i] - pts[i - 1];
    return Math.round(up);
}

export interface TrailPoi { id: string; kind: string; name: string; note?: string | null; km: number }
export interface TrailNext { poi: TrailPoi; aheadM: number; climbM: number }
export interface TrailFix { lat: number; lng: number; accuracy?: number | null }
export interface TrailInput {
    line: readonly LinePoint[];
    /** 이 코스 위의 지점(거리 순이 아니어도 된다) */
    pois: readonly TrailPoi[];
    /** 코스 위에서 정상이 놓인 거리(km) — 정상을 지나지 않는 코스는 null */
    summitKm: number | null;
    /** 정상의 좌표 — 정상 가까이인지 본다 */
    summit?: { lat: number; lng: number } | null;
    fix: TrailFix;
    /** 바로 앞의 자리 · 방향(없으면 처음) */
    prev?: { km: number; dir: 1 | -1 } | null;
    /** 앞에 보여 줄 지점의 종류 — 없으면 전부 */
    kinds?: readonly string[];
}
export interface TrailState {
    km: number;
    offM: number;
    ele: number;
    totalKm: number;
    /** 1 = 시작 → 끝 쪽으로, -1 = 거꾸로 */
    dir: 1 | -1;
    /** 위치가 흐려 자리를 옮기지 않았다 */
    coarse: boolean;
    /** 이 코스에서 멀다 */
    far: boolean;
    /** 정상까지(가는 방향에 정상이 있을 때만) */
    toSummitM: number | null;
    climbToSummitM: number | null;
    minutesToSummit: number | null;
    /** 정상 가까이 — 정상 인증을 권한다 */
    nearSummit: boolean;
    /** 가는 방향의 끝까지(m) */
    leftM: number;
    /** 앞에 있는 지점 — 가까운 순으로 셋까지 */
    next: TrailNext[];
}

/** 지금 한 점 → 길 띠의 상태. 선이 비면 null */
export function trailState(input: TrailInput): TrailState | null {
    const { line, pois, summitKm, summit, fix, prev, kinds } = input;
    if (line.length < 2) return null;
    const totalKm = line[line.length - 1][3];
    const coarse = fix.accuracy != null && Number.isFinite(fix.accuracy) && fix.accuracy > TRAIL_MAX_ACCURACY_M;
    const on = coarse && prev ? { km: prev.km, offM: 0, ele: Math.round(eleAtKm(line, prev.km)) } : projectOnLine(line, fix.lat, fix.lng, prev?.km);
    if (!on) return null;
    const moved = prev ? on.km - prev.km : 0;
    const dir: 1 | -1 = prev ? (moved > DIR_MIN_KM ? 1 : moved < -DIR_MIN_KM ? -1 : prev.dir) : 1;
    const far = !coarse && on.offM > TRAIL_FAR_M;
    const ahead = (km: number) => (dir === 1 ? km - on.km : on.km - km);
    const summitAhead = summitKm != null && ahead(summitKm) > 0 ? ahead(summitKm) : null;
    const climbToSummitM = summitAhead != null ? climbBetween(line, on.km, summitKm!) : null;
    const next = pois
        .filter((p) => Number.isFinite(p.km) && (!kinds || kinds.includes(p.kind)) && ahead(p.km) > 0.015)
        .sort((a, b) => ahead(a.km) - ahead(b.km))
        .slice(0, 3)
        .map((poi): TrailNext => ({ poi, aheadM: Math.round(ahead(poi.km) * 1000), climbM: climbBetween(line, on.km, poi.km) }));
    return {
        km: on.km, offM: on.offM, ele: on.ele, totalKm, dir, coarse, far,
        toSummitM: summitAhead != null ? Math.round(summitAhead * 1000) : null,
        climbToSummitM,
        minutesToSummit: summitAhead != null ? walkMinutes(summitAhead, climbToSummitM ?? 0) : null,
        nearSummit: !!summit && !coarse && distM(fix.lat, fix.lng, summit.lat, summit.lng) <= TRAIL_SUMMIT_NEAR_M,
        leftM: Math.round((dir === 1 ? totalKm - on.km : on.km) * 1000),
        next,
    };
}

/** "320m" · "1.2km" */
export const aheadText = (m: number): string => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)}m` : `${(Math.round(m / 100) / 10).toFixed(1)}km`);

// ── 음성 안내 ────────────────────────────────────────────────────────
/** 말로 알릴 지점의 종류 — 갈림길 · 위험 구간 · 대피소. 그 밖(문화 · 동식물)은 화면에만 */
export const TRAIL_SPEAK_KINDS: readonly string[] = ["SIGN", "DANGER", "SHELTER"];
/** 이 거리 안에 들어오면 한 번씩 알린다(m) — 미리 한 번, 다 와서 한 번 */
export const TRAIL_SPEAK_AT_M = [300, 80] as const;
const SPEAK_KIND_NAME: Readonly<Record<string, string>> = { SIGN: "갈림길", DANGER: "위험 구간", SHELTER: "대피소" };
/** 말로 읽는 거리 — "300미터" · "1.2킬로미터" */
export const spokenDistance = (m: number): string => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)}미터` : `${(Math.round(m / 100) / 10).toString()}킬로미터`);
/**
 * 지금 상태에서 새로 말할 것 — 이미 말한 것(said)은 다시 말하지 않는다. 걷는 사람의 손과 눈을 쓰지 않게 하려는 것이라 **짧게, 드물게**:
 *   · 가장 가까운 갈림길 · 위험 구간 · 대피소가 300m · 80m 안에 들어올 때 한 번씩
 *   · 정상이 500m 남았을 때 · 정상 가까이에 닿았을 때
 *   · 이 코스에서 멀어졌을 때(돌아오면 다시 알릴 수 있게 지운다)
 * 지점의 이름이 종류와 같거나 없으면 종류만 말한다("300미터 앞, 갈림길").
 */
export function trailSpeech(state: TrailState | null, said: ReadonlySet<string>): { lines: string[]; said: Set<string> } {
    const next = new Set(said), lines: string[] = [];
    if (!state || state.coarse) return { lines, said: next };
    const once = (key: string, line: string) => { if (!next.has(key)) { next.add(key); lines.push(line); } };
    if (state.far) { once("far", "이 코스에서 멀어졌어요. 코스가 맞는지 확인해 주세요."); return { lines, said: next }; }
    next.delete("far");
    if (state.nearSummit) once("summit:near", "정상이에요. 정상 인증을 해 보세요.");
    else if (state.toSummitM != null && state.toSummitM <= 500 && state.toSummitM > TRAIL_SUMMIT_NEAR_M) once("summit:500", `정상까지 ${spokenDistance(state.toSummitM)} 남았어요.`);
    const n = state.next.find((x) => TRAIL_SPEAK_KINDS.includes(x.poi.kind));
    if (n) {
        const kind = SPEAK_KIND_NAME[n.poi.kind] ?? "지점";
        const name = (n.poi.name ?? "").trim();
        const what = name && name !== kind && name.length <= 20 ? `${kind}, ${name}` : kind;
        const tail = n.poi.kind === "DANGER" ? " 조심하세요." : "";
        if (n.aheadM <= TRAIL_SPEAK_AT_M[1]) { next.add(`${n.poi.id}:${TRAIL_SPEAK_AT_M[0]}`); once(`${n.poi.id}:${TRAIL_SPEAK_AT_M[1]}`, `곧 ${what}.${tail}`); }
        else if (n.aheadM <= TRAIL_SPEAK_AT_M[0]) once(`${n.poi.id}:${TRAIL_SPEAK_AT_M[0]}`, `${spokenDistance(n.aheadM)} 앞, ${what}.${tail}`);
    }
    return { lines, said: next };
}

// ── 산행 요약(좌표 없이) ─────────────────────────────────────────────
/** 걸으며 쌓는 값 — 화면이 자리를 받을 때마다 더한다 */
export interface TripTally { walkedKm: number; gainM: number; lastKm: number | null; lastEle: number | null; samples: number }
export const emptyTally = (): TripTally => ({ walkedKm: 0, gainM: 0, lastKm: null, lastEle: null, samples: 0 });
/** 한 번에 이만큼 넘게 뛰면(km) 걸은 것이 아니라 위치가 튄 것이다 — 더하지 않는다 */
const JUMP_KM = 0.4;
/** 높이는 이만큼 넘게 달라질 때만 센다(m) — 줄인 선의 잔물결을 오르막으로 세지 않는다 */
const ELE_STEP_M = 3;
export function tallyStep(t: TripTally, s: Pick<TrailState, "km" | "ele" | "far" | "coarse">): TripTally {
    if (s.far || s.coarse) return t;
    if (t.lastKm == null || t.lastEle == null) return { ...t, lastKm: s.km, lastEle: s.ele, samples: t.samples + 1 };
    const d = Math.abs(s.km - t.lastKm);
    if (d > JUMP_KM) return { ...t, lastKm: s.km, lastEle: s.ele, samples: t.samples + 1 };
    const up = s.ele - t.lastEle;
    const counted = Math.abs(up) >= ELE_STEP_M;
    return { walkedKm: t.walkedKm + d, gainM: t.gainM + (counted && up > 0 ? up : 0), lastKm: s.km, lastEle: counted ? s.ele : t.lastEle, samples: t.samples + 1 };
}

/** 서버가 받는 산행 한 번 — 좌표가 없다 */
export interface TripInput { mountainId: string; courseId: string | null; startedAt: number; endedAt: number; km: number; gainM: number; reachedSummit: boolean }
export const TRIP_MIN_MINUTES = 5;
export const TRIP_MAX_HOURS = 24;
/** 적어 둘 만한 산행인가 — 너무 짧거나(시험 삼아 켠 것) 말이 안 되는 값은 남기지 않는다. 고친 값을 돌려주거나 null */
export function cleanTrip(t: TripInput, now = t.endedAt): TripInput | null {
    if (!t.mountainId || !Number.isFinite(t.startedAt) || !Number.isFinite(t.endedAt)) return null;
    const minutes = (t.endedAt - t.startedAt) / 60_000;
    if (minutes < TRIP_MIN_MINUTES || minutes > TRIP_MAX_HOURS * 60 || t.endedAt > now + 5 * 60_000) return null;
    const km = Math.round(Math.max(0, Math.min(80, Number(t.km) || 0)) * 100) / 100;
    const gainM = Math.round(Math.max(0, Math.min(6000, Number(t.gainM) || 0)));
    // 사람이 걷는 빠르기를 넘으면(시속 12km) 위치가 튄 기록이다
    if (km / (minutes / 60) > 12) return null;
    return { mountainId: t.mountainId, courseId: t.courseId ? String(t.courseId).slice(0, 40) : null, startedAt: t.startedAt, endedAt: t.endedAt, km, gainM, reachedSummit: !!t.reachedSummit };
}
