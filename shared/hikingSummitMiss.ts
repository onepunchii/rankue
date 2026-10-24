/**
 * 정상 인증 실패의 까닭(2026-10-24 오너: "진행" — 실패한 인증이 아무 데도 남지 않아, 정상에 있었는데 떨어진 것인지 알 수 없었다).
 *
 * 실패할 때마다 **좌표 없이** 까닭만 남긴다: 산 · 까닭 · 거리 구간 · 위치 정확도 구간 · 기기 종류(앱 · 앱 안 브라우저 · 웹).
 * 위치를 거부했거나 못 잡은 경우는 화면이 서버로 위치를 보내지 않으므로 화면이 까닭만 따로 알린다(fixError).
 * 관리자 › 등산 › 정상 인증의 '실패한 시도'가 이것을 그 뒤의 결과(인증함 · 다녀왔어요 · 그만둠)와 함께 보여 준다.
 */
import type { SummitBucket, SummitReason } from "./hikingStamps.js";

/** 실패 까닭 — 서버 판정(far · coarse · no-fix · no-summit) + 화면이 알린 것(denied · unavailable) */
export type SummitMissReason = Exclude<SummitReason, "ok"> | "denied" | "unavailable";
export const SUMMIT_MISS_REASONS: readonly SummitMissReason[] = ["far", "coarse", "no-fix", "no-summit", "denied", "unavailable"];
export const isSummitMissReason = (v: unknown): v is SummitMissReason => SUMMIT_MISS_REASONS.includes(v as SummitMissReason);

/** 화면이 알리는 위치 실패(getDevicePosition 의 status) → 까닭. 'prompt'(허락을 묻지 못함)는 거부로 본다 */
export function fixErrorReason(v: unknown): SummitMissReason | null {
    return v === "denied" || v === "prompt" ? "denied" : v === "unavailable" ? "unavailable" : null;
}

/** 기기 종류 — 앱(Capacitor) · 다른 앱 안의 브라우저(카카오톡 · 네이버 …) · 보통 웹 */
export type SummitClient = "app" | "inapp" | "web";
export const isSummitClient = (v: unknown): v is SummitClient => v === "app" || v === "inapp" || v === "web";

/** 위치 정확도(반경, m) 구간 — 값 대신 이것만 */
export type AccuracyBand = "<20m" | "20-50m" | "50-200m" | ">200m";
export const ACCURACY_BANDS: readonly string[] = ["<20m", "20-50m", "50-200m", ">200m"];
export function accuracyBand(acc: unknown): AccuracyBand | null {
    const a = typeof acc === "number" ? acc : Number(acc);
    if (acc == null || !Number.isFinite(a) || a < 0) return null;
    return a < 20 ? "<20m" : a <= 50 ? "20-50m" : a <= 200 ? "50-200m" : ">200m";
}

/** 관리자 화면의 까닭 이름 */
export const SUMMIT_MISS_LABEL: Readonly<Record<SummitMissReason, string>> = {
    far: "정상에서 멂", coarse: "위치가 흐림", "no-fix": "위치를 못 잡음", "no-summit": "정상 자리 모름", denied: "위치 거부", unavailable: "위치 못 씀",
};
export const SUMMIT_CLIENT_LABEL: Readonly<Record<SummitClient, string>> = { app: "앱", inapp: "앱 안 브라우저", web: "웹" };

/** 실패 뒤 그날의 결과 — 같은 회원 · 같은 산 · 같은 날 */
export type SummitMissAfter = "verified" | "recorded" | "none";
export const SUMMIT_MISS_AFTER_LABEL: Readonly<Record<SummitMissAfter, string>> = { verified: "뒤에 인증함", recorded: "다녀왔어요로 적음", none: "그만둠" };

/** 관리자 목록 한 줄 */
export interface AdminSummitMissRow {
    id: string;
    at: string;
    memberId: string;
    memberName: string;
    mountainId: string;
    mountainName: string;
    reason: SummitMissReason;
    bucket: SummitBucket | null;
    accuracy: AccuracyBand | null;
    client: SummitClient | null;
    after: SummitMissAfter;
}

/**
 * '정상에 있었는데 떨어졌을 수 있는' 실패 — 거리가 가깝거나(150-500m) 위치가 흐리거나 못 잡은 것. 멀리서 눌러 본 것(>2km 등)은 빼고 본다.
 * 관리자 화면이 이것을 먼저 보여 준다.
 */
export function maybeOnTop(r: Pick<AdminSummitMissRow, "reason" | "bucket">): boolean {
    if (r.reason === "coarse" || r.reason === "no-fix" || r.reason === "unavailable") return true;
    return r.reason === "far" && r.bucket === "150-500m";
}
