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
import { tideOf, tideWeekday, TIDE_PHASE_TEXT, TIDE_SEAS } from "./fishingTide.js";

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
/** GET /api/hiq/fishing/tide/:name 의 답 — 지점이 아니고 도시 이름이면(tideAlias) redirect 만 온다 */
export interface TidePointData { point: TidePointDef; days: TidePointDay[]; near: TidePointNear[]; spots: TidePointSpot[] }
export interface TideAliasAnswer { redirect: string }

/**
 * 전국 물때표 허브 /fishing/tide(2026-11-08 — 네이버 검색어 트렌드 12개월: '물때표' 112 · '물때' 28, 당구장=100).
 * 항구 51곳(조위관측소 · /fishing/port)과 포구 · 섬 107곳(조석예보 지점 · /fishing/tide/<이름>)을 바다마다 한 장에 묶는다.
 * 전엔 이 주소가 없어서 봇에게 당구 셸이 나갔다. 오늘 물때 이름은 음력으로 센 것 — 바깥 자료 없이 늘 나온다.
 */
export const TIDE_HUB_PATH = FISHING_TIDE_BASE;
export const TIDE_HUB_LABEL = "전국 물때표";
export function tideHubSeo(ports: number, points: number): { title: string; description: string; h1: string } {
    return {
        h1: TIDE_HUB_LABEL,
        title: `전국 물때표 — 오늘 물때 · 항구 ${ports}곳 · 포구 · 섬 ${points}곳 만조 · 간조 | 랭큐 낚시`,
        description: `서해 · 남해 · 동해 · 제주 항구 ${ports}곳과 포구 · 섬 ${points}곳의 오늘 만조 · 간조 시각을 국립해양조사원 조석예보로, 사리 · 조금 물때를 음력으로 셈해 한 장에 모았어요.`,
    };
}
/** 오늘의 물때 한 줄(바다 둘) — "11월 8일(일) 서해 4물 · 남해 · 동해 · 제주 5물". 한국 달력을 모르는 환경이면 빈 목록 */
export interface TideTodayPart { sea: string; name: string; mark: string | null; phase: string }
export function tideTodayParts(ymd: string): TideTodayPart[] {
    const out: TideTodayPart[] = [];
    for (const x of TIDE_SEAS) { const t = tideOf(ymd, x.id); if (t) out.push({ sea: x.name, name: t.name, mark: t.mark, phase: TIDE_PHASE_TEXT[t.phase] }); }
    return out;
}
export function tideTodaySentence(ymd: string): string | null {
    const parts = tideTodayParts(ymd);
    if (!parts.length) return null;
    const head = `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8))}일(${tideWeekday(ymd)})`;
    return `오늘 ${head} 물때는 ${parts.map((x) => `${x.sea} ${x.name}${x.mark ? `(${x.mark})` : ""}`).join(", ")}이에요.`;
}
/** 허브의 묻고 답하기 — 사이트의 다른 화면과 같은 말(TideCalendar · 지점 화면 각주)만 */
export function tideHubFaq(ymd: string): { q: string; a: string }[] {
    const today = tideTodaySentence(ymd);
    return [
        ...(today ? [{ q: "오늘 물때는 몇 물인가요?", a: `${today} 물때는 음력 날짜로 센 것이에요.` }] : []),
        { q: "물때는 어떻게 세나요?", a: "물때는 음력 날짜로 세요. 서해는 7물때, 남해 · 동해 · 제주는 8물때로 불러요. 사리 무렵엔 물이 세게 가고, 조금 무렵엔 물이 거의 안 가요." },
        { q: "만조 · 간조 시각은 어디 자료인가요?", a: "항구는 국립해양조사원 조위관측소의 조석 예보, 포구 · 섬은 국립해양조사원 조석예보 지점의 고조 · 저조 예보를 그대로 보여 줘요." },
    ];
}

/**
 * 도시 이름으로 온 물때 주소(/fishing/tide/인천 — '인천 물때' 14 · 그전엔 404) → 같은 이름의 항구 · 물때 지점.
 * 이름을 지어 붙이지 않는다 — 그대로 같은 이름, 또는 '항'을 붙이거나 뗀 이름만 본다. 못 찾으면 null(404).
 */
export function tideAlias(name: string, points: readonly string[], ports: readonly string[]): { kind: "port" | "point"; name: string } | null {
    const n = name.normalize("NFC").trim();
    if (!n || points.includes(n)) return null;
    const bare = n.endsWith("항") ? n.slice(0, -1) : null;
    if (ports.includes(n)) return { kind: "port", name: n };
    if (bare && ports.includes(bare)) return { kind: "port", name: bare };
    if (ports.includes(`${n}항`)) return { kind: "port", name: `${n}항` };
    if (points.includes(`${n}항`)) return { kind: "point", name: `${n}항` };
    if (bare && points.includes(bare)) return { kind: "point", name: bare };
    return null;
}

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
