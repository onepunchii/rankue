/**
 * 항구의 하루(2026-10-14) — 조위관측소의 예측 조위에서 오늘의 만조 · 간조를 찾고, 낚시꾼이 쓰는 말(들물 · 날물)로 지금을 말한다.
 *
 * 자료: 국립해양조사원 조위관측소 실측 · 예측 조위(10분 간격). 고저조 시각이 따로 오지 않아서 예측 곡선의 꼭대기 · 바닥을 여기서 찾는다.
 * ⚠️ 예측값이다 — 화면에 '예측'이라고 적는다. 바람 · 기압에 따라 실제 물높이는 다르다.
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js(지금은 임포트가 없다).
 */

export interface TidePoint { /** 그날 0시부터의 분(0~1440) */ min: number; /** 예측 조위(cm) */ cm: number }
export interface TideTurn { min: number; cm: number; kind: "high" | "low" }

export const hhmm = (min: number): string => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min) % 60).padStart(2, "0")}`;

/**
 * 만조 · 간조 — 앞뒤 90분 안에서 가장 높거나 낮은 점. 하루의 맨 끝(앞뒤가 30분도 안 남은 점)은 꼭대기인지 알 수 없어 세지 않는다.
 * 꼭대기와 그 앞뒤 창 끝의 차이가 1.5cm 는 돼야 한다 — 예측 곡선은 매끄러워 잔물결이 없고, 동해(물높이 차가 10~30cm)의 만조 · 간조도 찾아야 한다.
 */
export function tideTurns(points: readonly TidePoint[]): TideTurn[] {
    const p = [...points].filter((x) => Number.isFinite(x.min) && Number.isFinite(x.cm)).sort((a, b) => a.min - b.min);
    const out: TideTurn[] = [];
    for (let i = 0; i < p.length; i++) {
        const me = p[i];
        const win = p.filter((x) => Math.abs(x.min - me.min) <= 90);
        const before = win.filter((x) => x.min < me.min), after = win.filter((x) => x.min > me.min);
        if (!before.length || !after.length) continue;
        if (me.min - before[0].min < 30 || after[after.length - 1].min - me.min < 30) continue;
        const max = Math.max(...win.map((x) => x.cm)), min = Math.min(...win.map((x) => x.cm));
        const edge = [before[0].cm, after[after.length - 1].cm];
        const kind = me.cm === max && edge.every((e) => me.cm - e >= 1.5) ? "high" : me.cm === min && edge.every((e) => e - me.cm >= 1.5) ? "low" : null;
        if (!kind) continue;
        // 같은 높이가 이어지는 꼭대기(평평한 마루)는 하나로 — 가운데 것을 남긴다
        const last = out[out.length - 1];
        if (last && last.kind === kind && me.min - last.min <= 90) { if (me.cm === last.cm) { last.min = Math.round((last.min + me.min) / 2 / 10) * 10; } continue; }
        out.push({ min: me.min, cm: Math.round(me.cm), kind });
    }
    return out;
}

/** 지금 물이 드는가 빠지는가 — 가장 가까운 앞뒤 전환점으로. 모르면 null */
export function tideFlowAt(turns: readonly TideTurn[], nowMin: number): { flow: "들물" | "날물"; next: TideTurn; inMin: number } | null {
    const next = turns.find((t) => t.min > nowMin);
    if (!next) return null;
    return { flow: next.kind === "high" ? "들물" : "날물", next, inMin: Math.round(next.min - nowMin) };
}

/** "3시간 20분" · "45분" */
export function durationKo(min: number): string {
    const m = Math.max(0, Math.round(min)), h = Math.floor(m / 60);
    return h ? (m % 60 ? `${h}시간 ${m % 60}분` : `${h}시간`) : `${m}분`;
}

/** 오늘의 물높이 차(가장 높은 만조 − 가장 낮은 간조) — 사리 무렵 크고 조금 무렵 작다 */
export function tideRange(turns: readonly TideTurn[]): number | null {
    const hi = turns.filter((t) => t.kind === "high").map((t) => t.cm), lo = turns.filter((t) => t.kind === "low").map((t) => t.cm);
    return hi.length && lo.length ? Math.max(...hi) - Math.min(...lo) : null;
}

/* ── 항구 브리핑 — 서버가 엮어 주는 한 장(조석 · 해와 달 · 지금의 바다 · 바다낚시지수) ── */

/** "0629 " → 389분. 꼴이 아니면 null */
export function hmToMin(v: unknown): number | null {
    const m = String(v ?? "").trim().match(/^(\d{2})(\d{2})/);
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    return h <= 24 && mi < 60 ? h * 60 + mi : null;
}

const DIRS = ["북", "북북동", "북동", "동북동", "동", "동남동", "남동", "남남동", "남", "남남서", "남서", "서남서", "서", "서북서", "북서", "북북서"] as const;
/** 풍향(도) → 16방위 */
export function windDirKo(deg: number | null | undefined): string | null {
    if (deg == null || !Number.isFinite(deg)) return null;
    return DIRS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** 국립해양조사원 바다낚시지수의 다섯 단계 — 우리가 매긴 값이 아니다(출처를 같이 적는다) */
export const FISHING_INDEX_STEPS = ["매우나쁨", "나쁨", "보통", "좋음", "매우좋음"] as const;
export type FishingIndexStep = (typeof FISHING_INDEX_STEPS)[number];
export const isFishingIndexStep = (v: unknown): v is FishingIndexStep => (FISHING_INDEX_STEPS as readonly string[]).includes(String(v));

export interface PortIndexRow {
    day: string; part: "오전" | "오후" | "일"; fish: string; index: FishingIndexStep;
    /** 파고(m) · 풍속(m/s) · 수온(℃)의 예보 범위 [낮은 값, 높은 값] */
    wave: [number, number] | null; wind: [number, number] | null; wtemp: [number, number] | null;
    /** 대조기 · 중조기 · 소조기 */
    tide: string | null;
}
export interface PortNow {
    wtemp: number | null; atemp: number | null;
    buoy: { name: string; km: number; wave: number | null; wind: number | null; windDir: number | null; wtemp: number | null; at: string | null } | null;
    fog: { name: string; km: number; visM: number | null; at: string | null } | null;
}
export interface PortSun { rise: number | null; set: number | null; moonrise: number | null; moonset: number | null; dawn: number | null; dusk: number | null; /** 천문연이 값을 준 지점 이름 */ at: string | null }
export interface PortBrief {
    port: { code: string; name: string; area: string };
    day: string;
    /** 볼 수 있는 날(오늘부터) */
    days: string[];
    /** 예측 조위 — [분, cm] 10분 간격 */
    points: [number, number][];
    turns: TideTurn[];
    sun: PortSun | null;
    /** 오늘일 때만 — 지금의 수온 · 기온 · 가까운 부이 · 해무관측소 */
    now: PortNow | null;
    /** 그날의 바다낚시지수(가까운 지점) */
    index: { point: string; km: number; rows: PortIndexRow[] } | null;
}

/** 그날 그 지점의 파고 · 바람 예보를 한 줄로(오전 · 오후를 합친 범위). 없으면 null */
export function indexOutlook(rows: readonly PortIndexRow[]): { wave: [number, number] | null; wind: [number, number] | null } | null {
    const span = (pick: (r: PortIndexRow) => [number, number] | null): [number, number] | null => {
        const v = rows.map(pick).filter((x): x is [number, number] => !!x);
        return v.length ? [Math.min(...v.map((x) => x[0])), Math.max(...v.map((x) => x[1]))] : null;
    };
    const wave = span((r) => r.wave), wind = span((r) => r.wind);
    return wave || wind ? { wave, wind } : null;
}

/** [0.7, 1.0] → "0.7~1.0" · 같으면 "0.7" */
export const rangeText = (r: [number, number] | null | undefined, digits = 1): string | null => (!r ? null : r[0] === r[1] ? r[0].toFixed(digits) : `${r[0].toFixed(digits)}~${r[1].toFixed(digits)}`);

/** 시정(m) → 말. 1km 아래는 짙은 안개 · 상한(20km)은 "20km 넘게" */
export function visibilityText(m: number | null | undefined): string | null {
    if (m == null || !Number.isFinite(m) || m < 0) return null;
    if (m >= 20000) return "20km 넘게";
    return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)}km` : `${Math.round(m / 10) * 10}m`;
}

/* ── 낚시지수 지도 — 지점 마흔아홉 곳에서 어종마다 오늘이 어떤가(국립해양조사원). 홈의 지도가 이것으로 "어디서 무엇이 좋은가"를 보여 준다 ── */

export interface IndexSpot {
    name: string; lat: number; lng: number;
    /** 어종 → 오전 · 오후의 단계(없으면 null) */
    fish: Record<string, { am: FishingIndexStep | null; pm: FishingIndexStep | null }>;
    wave: [number, number] | null; wind: [number, number] | null; wtemp: [number, number] | null;
    tide: string | null;
}
export interface IndexMap { day: string; days: string[]; /** 그날 지수가 매겨진 어종(많이 매겨진 순) */ fishes: string[]; spots: IndexSpot[] }
/** 받아 둔 한 줄(지점 · 좌표가 붙은 지수) */
export interface IndexAllRow extends PortIndexRow { point: string; lat: number; lng: number }

/** 단계 → 0(매우나쁨)~4(매우좋음) */
export const indexScore = (s: FishingIndexStep | null | undefined): number => (s ? FISHING_INDEX_STEPS.indexOf(s) : -1);
/** 오전 · 오후 가운데 좋은 쪽 */
export function bestOf(v: { am: FishingIndexStep | null; pm: FishingIndexStep | null } | null | undefined): FishingIndexStep | null {
    if (!v) return null;
    return indexScore(v.am) >= indexScore(v.pm) ? v.am ?? v.pm : v.pm;
}

/** 받아 둔 줄 → 그날의 지도. '종합'(대상어가 없는 먼 지점)은 어종으로 세지 않는다 */
export function indexMapOf(rows: readonly IndexAllRow[], day: string, days: readonly string[]): IndexMap {
    const by = new Map<string, IndexSpot>();
    const count = new Map<string, number>();
    const span = (a: [number, number] | null, b: [number, number] | null): [number, number] | null => (!a ? b : !b ? a : [Math.min(a[0], b[0]), Math.max(a[1], b[1])]);
    for (const r of rows) {
        if (r.day !== day || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
        const s = by.get(r.point) ?? { name: r.point, lat: r.lat, lng: r.lng, fish: {}, wave: null, wind: null, wtemp: null, tide: null };
        s.wave = span(s.wave, r.wave); s.wind = span(s.wind, r.wind); s.wtemp = span(s.wtemp, r.wtemp); s.tide = s.tide ?? r.tide;
        if (r.fish && r.fish !== "종합") {
            const f = s.fish[r.fish] ?? { am: null, pm: null };
            if (r.part === "오전" || r.part === "일") f.am = r.index;
            if (r.part === "오후" || r.part === "일") f.pm = r.index;
            s.fish[r.fish] = f;
        }
        by.set(r.point, s);
    }
    const spots = [...by.values()];
    for (const s of spots) for (const f of Object.keys(s.fish)) count.set(f, (count.get(f) ?? 0) + 1);
    // '기타어종'은 맨 뒤로
    const fishes = [...count.keys()].sort((a, b) => Number(a === "기타어종") - Number(b === "기타어종") || (count.get(b) ?? 0) - (count.get(a) ?? 0) || a.localeCompare(b, "ko"));
    return { day, days: [...days], fishes, spots };
}

/** 그 어종이 오늘 좋은 곳 — 좋음 이상인 지점을 좋은 순으로(같으면 파고가 낮은 순) */
export function goodSpots(map: IndexMap, fish: string, limit = 5): { spot: IndexSpot; step: FishingIndexStep }[] {
    const out: { spot: IndexSpot; step: FishingIndexStep }[] = [];
    for (const s of map.spots) { const step = bestOf(s.fish[fish]); if (step && indexScore(step) >= 3) out.push({ spot: s, step }); }
    out.sort((a, b) => indexScore(b.step) - indexScore(a.step) || (a.spot.wave?.[1] ?? 9) - (b.spot.wave?.[1] ?? 9) || a.spot.name.localeCompare(b.spot.name, "ko"));
    return out.slice(0, limit);
}

