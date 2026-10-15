/**
 * 내 표시 지점(2026-10-15 오너 6번 · "나만 보기") — 산에서 약수터 · 조망점 · 위험 · 갈림길 · 그 밖의 것을 한 점으로 남긴다. 사진 한 장 · 메모.
 * 남에게 보이지 않는다(공개하려면 신고 · 차단이 먼저 있어야 한다). luxtrail 의 POI 를 우리 말로 옮김 — 코드는 옮기지 않았다.
 * ⚠️ 서버가 임포트한다 — 상대 임포트는 './x.js'.
 */
export const MARK_KINDS = ["water", "view", "danger", "junction", "other"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];
export const MARK_LABEL: Readonly<Record<MarkKind, string>> = { water: "약수터", view: "조망점", danger: "위험", junction: "갈림길", other: "기타" };
export const MARK_COLOR: Readonly<Record<MarkKind, string>> = { water: "#5DB7E8", view: "#F6D9A8", danger: "#E0533B", junction: "#B9A4F0", other: "#C9D1D9" };
export const MARKS_PER_MOUNTAIN = 50;

export interface HikingMark { id: string; mountainId: string; kind: MarkKind; lat: number; lng: number; note: string | null; photoUrl: string | null; createdAt: string }
export type HikingMarkInput = Omit<HikingMark, "id" | "createdAt">;

const inKorea = (lat: number, lng: number) => lat >= 33 && lat <= 39.6 && lng >= 124 && lng <= 132;

export function cleanMark(raw: unknown): { ok: true; value: Omit<HikingMarkInput, "photoUrl"> & { photoUrl: unknown } } | { ok: false; error: string } {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const mountainId = String(o.mountainId ?? "").trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(mountainId)) return { ok: false, error: "산을 찾을 수 없어요" };
    const kind = MARK_KINDS.find((k) => k === o.kind);
    if (!kind) return { ok: false, error: "무엇을 표시할지 골라 주세요" };
    const lat = Number(o.lat), lng = Number(o.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inKorea(lat, lng)) return { ok: false, error: "자리를 받지 못했어요" };
    const note = String(o.note ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || null;
    return { ok: true, value: { mountainId, kind, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, note, photoUrl: o.photoUrl ?? null } };
}
