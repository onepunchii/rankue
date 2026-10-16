/**
 * 등산 산 자료 고치기(2026-10-17 어드민 › 등산 › 산 자료 — "정상 좌표를 판정하지 못한 산을 지금은 코드와 스크립트로 고쳐 배포해야 한다").
 * 판정의 심판은 shared/hikingSummitFix 때와 같다: **그 자리 150m 안을 코스가 지나는가**(받아 둔 코스 선 [[위도, 경도, 높이, 누적 km], …]).
 * 고친 칸은 admin_keep 에 적혀 적재가 다시 돌아도 남는다. 순수 함수 — 서버 · 화면이 같이 쓴다.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { distM, nearestOnLine, type LinePoint } from "./hikingGeo.js";

export { distM, nearestOnLine, type LinePoint };
export type KeepField = "coords" | "height" | "peak";
export const KEEP_LABEL: Readonly<Record<KeepField, string>> = { coords: "정상 자리", height: "높이", peak: "정상 이름" };
export interface KeepMark { at: string; by: string; reason: string; was: string }
export type AdminKeep = Partial<Record<KeepField, KeepMark>>;

/** 정상 인증 반경과 같은 거리 — 코스가 이 안을 지나면 '코스가 정상을 지난다' */
export const ON_COURSE_M = 150;

/** 남한 땅과 섬(마라도 · 독도 · 백령도)을 넉넉히 덮는 상자 — 그 밖의 값은 잘못 붙여 넣은 것 */
export function validSpot(lat: unknown, lng: unknown): { ok: true; lat: number; lng: number } | { ok: false; why: string } {
    const a = Number(lat), b = Number(lng);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, why: "위도 · 경도를 숫자로 적어 주세요" };
    if (a < 32.9 || a > 38.7 || b < 124.5 || b > 132) return { ok: false, why: "남한 밖의 자리예요 — 위도 · 경도 순서를 확인해 주세요" };
    return { ok: true, lat: Math.round(a * 1e6) / 1e6, lng: Math.round(b * 1e6) / 1e6 };
}

/** "37.12345, 128.45678" · "37.12345 128.45678" 처럼 붙여 넣은 한 줄 */
export function parseSpot(text: string): { lat: number; lng: number } | null {
    const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const v = validSpot(m[1], m[2]);
    return v.ok ? { lat: v.lat, lng: v.lng } : null;
}

/** 정상의 선 위 자리(km) — ON_COURSE_M 안일 때만(hiking_courses.summit_km 과 같은 뜻 · 적재의 셈과 같다) */
export function summitKmOn(line: readonly LinePoint[], lat: number, lng: number): number | null {
    const n = nearestOnLine(line, lat, lng);
    return n && n.offM <= ON_COURSE_M ? Math.round(n.km * 1000) / 1000 : null;
}

/**
 * 정상 후보 — 코스마다 가장 높은 점, 서로 100m 안이면 하나로(높은 쪽). 높은 순으로.
 * 산의 높이를 알면 그 높이에 가까운(±35m) 후보에 표시를 단다(hikingSummitFix 의 판정과 같은 폭).
 */
export interface SummitCandidate { lat: number; lng: number; ele: number; courses: number; nearHeight: boolean }
export function summitCandidates(lines: readonly (readonly LinePoint[])[], heightM: number | null, limit = 6): SummitCandidate[] {
    const tops = lines.filter((l) => l.length > 0).map((l) => l.reduce((a, b) => (b[2] > a[2] ? b : a)));
    const out: SummitCandidate[] = [];
    for (const t of [...tops].sort((a, b) => b[2] - a[2])) {
        const same = out.find((c) => distM(c.lat, c.lng, t[0], t[1]) <= 100);
        if (same) { same.courses++; continue; }
        out.push({ lat: t[0], lng: t[1], ele: Math.round(t[2]), courses: 1, nearHeight: heightM != null && Math.abs(t[2] - heightM) <= 35 });
    }
    return out.slice(0, limit);
}

/** GET /admin/hiking/mountains 의 한 줄 */
export interface AdminMountainRow {
    id: string; slug: string; name: string; peakName: string | null; heightM: number | null; lat: number | null; lng: number | null;
    place: string; kfs100: number | null; courses: number;
    /** 코스 선이 정상에 가장 가까이 오는 거리(m) — 코스가 없으면 null */
    nearestM: number | null;
    summits: number;
    keep: AdminKeep;
}
/** GET /admin/hiking/mountains/:id */
export interface AdminMountainDetail extends AdminMountainRow {
    lines: { id: string; km: number; line: [number, number, number][]; nearestM: number | null; summitKm: number | null }[];
    candidates: SummitCandidate[];
}
