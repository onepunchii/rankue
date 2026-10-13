/**
 * 등산 — 길의 종류(2026-10-13). 산림청 100대 명산 코스 파일(한국등산트레킹지원센터)은 코스의 점마다 그 구간이 어떤 길인지 적어 두었다
 * (오솔길 · 계단 · 너덜길 · 포장길 · 암릉 · 교량 · 밧줄 · 릿지 …). 그것을 여덟 가지로 묶어 코스마다 "어떤 길을 얼마나 걷는가"를 보여 준다.
 *
 * 코스에 싣는 꼴: [[종류, km], …] — 긴 것부터, 0.01km 에 못 미치는 것은 뺀다(hiking_courses.surface · 이 자료가 없는 코스는 null).
 * 조사한 때(2022년)의 길이다 — 지금은 달라졌을 수 있어 화면에 '참고용'으로 적는다.
 * 순수 값과 함수만. ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */

export type SurfaceId = "trail" | "stairs" | "scree" | "paved" | "rock" | "bridge" | "rope" | "etc";
export const SURFACE_IDS: readonly SurfaceId[] = ["trail", "stairs", "scree", "paved", "rock", "bridge", "rope", "etc"];
export const SURFACE_LABEL: Readonly<Record<SurfaceId, string>> = {
    trail: "흙길", stairs: "계단 · 데크", scree: "너덜 · 돌길", paved: "포장길", rock: "바위 능선", bridge: "다리", rope: "밧줄 · 사다리", etc: "그 밖",
};
/** 받은 구간 이름 → 우리 종류. 모르는 이름은 '그 밖' */
const SURFACE_OF: Readonly<Record<string, SurfaceId>> = {
    오솔길: "trail", 야자수매트: "trail", 계단: "stairs", 데크로드: "stairs", 너덜길: "scree", 포장길: "paved", 암릉: "rock", 릿지: "rock",
    교량: "bridge", 밧줄: "rope", 사다리: "rope", 철구조물: "rope", 기타: "etc",
};
export const surfaceIdOf = (name: string | null | undefined): SurfaceId => SURFACE_OF[String(name ?? "").trim()] ?? "etc";
/**
 * 한 점에 구간이 여럿 겹쳐 적혀 있을 때("오솔길 + 계단") 고르는 차례 — 더 구체적인 길이 이긴다.
 * 받은 파일은 코스 전체를 덮는 긴 구간(대개 오솔길) 위에 짧은 구간(계단 · 다리 · 밧줄)을 겹쳐 적는다.
 */
export const SURFACE_PRIORITY: readonly SurfaceId[] = ["rope", "rock", "bridge", "stairs", "scree", "paved", "trail", "etc"];
/** 겹친 구간 이름들 → 그 점의 길. 이름이 하나도 없으면 null(조사하지 않은 점) */
export function surfaceOfNames(names: readonly (string | null | undefined)[]): SurfaceId | null {
    const ids = names.filter((n): n is string => typeof n === "string" && n.trim().length > 0).map(surfaceIdOf);
    if (ids.length === 0) return null;
    return ids.reduce((a, b) => (SURFACE_PRIORITY.indexOf(b) < SURFACE_PRIORITY.indexOf(a) ? b : a));
}
/** 코스 길이의 이만큼은 조사돼 있어야 길의 종류를 싣는다 — 모자라면 막대가 거짓이 된다 */
export const SURFACE_MIN_COVER = 0.6;

export type CourseSurface = readonly (readonly [SurfaceId, number])[];

/** 구간마다의 (종류, km) → 코스에 싣는 꼴. 긴 것부터 · 0.01km 아래는 뺀다. 아무것도 없으면 null */
export function packSurface(parts: readonly (readonly [SurfaceId, number])[]): CourseSurface | null {
    const sum = new Map<SurfaceId, number>();
    for (const [id, km] of parts) if (Number.isFinite(km) && km > 0) sum.set(id, (sum.get(id) ?? 0) + km);
    const out = [...sum].map(([id, km]) => [id, Math.round(km * 100) / 100] as const).filter(([, km]) => km >= 0.01)
        .sort((a, b) => b[1] - a[1] || SURFACE_IDS.indexOf(a[0]) - SURFACE_IDS.indexOf(b[0]));
    return out.length ? out : null;
}

/** DB 에서 읽은 값 → 믿을 수 있는 꼴(모르는 종류 · 이상한 수는 버린다) */
export function readSurface(raw: unknown): CourseSurface | null {
    if (!Array.isArray(raw)) return null;
    const out: (readonly [SurfaceId, number])[] = [];
    for (const x of raw) {
        if (!Array.isArray(x)) continue;
        const id = x[0] as SurfaceId, km = Number(x[1]);
        if (SURFACE_IDS.includes(id) && Number.isFinite(km) && km > 0) out.push([id, km]);
    }
    return out.length ? out : null;
}

export interface SurfaceShare { id: SurfaceId; label: string; km: number; pct: number }
/** 막대에 그릴 몫 — 긴 것부터. 1%에 못 미치는 것들은 '그 밖'으로 모은다. 퍼센트의 합은 100 */
export function surfaceShares(surface: CourseSurface | null | undefined): SurfaceShare[] {
    const list = (surface ?? []).filter(([, km]) => km > 0);
    const total = list.reduce((n, [, km]) => n + km, 0);
    if (total <= 0) return [];
    const big = new Map<SurfaceId, number>();
    for (const [id, km] of list) { const k = km / total < 0.01 ? "etc" : id; big.set(k, (big.get(k) ?? 0) + km); }
    const rows = [...big].sort((a, b) => (a[0] === "etc" ? 1 : b[0] === "etc" ? -1 : b[1] - a[1]));
    const pcts = rows.map(([, km]) => Math.round((km / total) * 100));
    // 반올림으로 합이 어긋나면 가장 큰 몫에서 맞춘다
    const drift = 100 - pcts.reduce((a, b) => a + b, 0);
    if (drift !== 0 && pcts.length) pcts[0] += drift;
    return rows.map(([id, km], i) => ({ id, label: SURFACE_LABEL[id], km: Math.round(km * 10) / 10, pct: pcts[i] })).filter((r) => r.pct > 0);
}

/** 계단이 이만큼(%)이면 한마디 */
export const SURFACE_STAIRS_NOTE_PCT = 25;
/** 바위 능선 · 밧줄이 합쳐 이만큼(%)이면 한마디 */
export const SURFACE_ROCK_NOTE_PCT = 15;
/** 걷기 전에 알면 좋은 한 줄 — 없으면 null. 재촉이나 겁주기가 아니라 채비의 말만 */
export function surfaceNote(shares: readonly SurfaceShare[]): string | null {
    const of = (id: SurfaceId) => shares.find((s) => s.id === id)?.pct ?? 0;
    const rock = of("rock") + of("rope");
    if (rock >= SURFACE_ROCK_NOTE_PCT) return "바위 구간이 길어요. 미끄럽지 않은 신발과 장갑을 챙기세요.";
    if (of("stairs") >= SURFACE_STAIRS_NOTE_PCT) return "계단이 많은 길이에요. 내려올 때 무릎을 아껴 천천히 걸으세요.";
    if (of("scree") >= 30) return "돌이 많은 길이에요. 발목을 잡아 주는 신발이 편해요.";
    return null;
}
export const SURFACE_COPY = { title: "어떤 길을 걷나", source: "2022년 조사 기준 · 참고용" } as const;
