/**
 * 현장 인증 도장(2026-09-30 오너 결정) — "집에서 18홀을 적어도 전국 도장이 찍힌다"를 막는다.
 *
 * 라운드 중 한 번이라도 그 골프장 **2km 안**에서 위치가 잡히면 그 라운드는 ✓ 현장 인증.
 * 인증이 없는 라운드도 점수·평균·기록은 그대로 남는다 — 도장만 흐린 '기록 도장'이 되고
 * 지역 정복·Elite 60·발자국 공유 카드·'방문 골프장 N곳'에는 세지 않는다.
 *
 * 규칙(오너 승인):
 *  - 동반자 규칙: 같은 경기에서 실제 회원 한 명이라도 인증되면 그 경기 참가자 전원이 인증(방장 폰 한 대로 적어도 된다).
 *  - 시간 규칙: 시작부터 18홀을 다 적기까지 30분이 안 걸렸으면 인증을 주지 않는다(골프장 주차장에서 가짜 라운드 방지).
 *  - 옛 기록: 이 규칙 전(on_site 가 NULL)에 찍힌 도장은 그대로 인정한다("오늘 이전에 찍힌 도장은 그대로 인정").
 *  - 개인정보: 좌표는 저장하지 않는다. 서버가 골프장까지 거리를 재고 인증 여부 + 거친 거리 구간만 남긴다.
 *
 * 서버(판정·저장)와 화면(칩 문구)이 같은 파일을 쓴다 — 규칙이 두 벌이면 칩은 '인증됨'인데 도장은 흐린 일이 생긴다.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트를 늘리면 './x.js' 로(없으면 Vercel /api 전체 500).
 */

/** 이 반경 안(경계 포함)이면 현장 */
export const ONSITE_RADIUS_KM = 2;
/** 시작 → 18홀 다 적기까지 이보다 짧으면 인증하지 않는다 */
export const ONSITE_MIN_ROUND_MINUTES = 30;
/**
 * 이보다 흐린 위치(정확도 반경, m)는 판단에 쓰지 않는다. 데스크톱 브라우저의 IP 위치는 반경이 수~수십 km 라,
 * 그 가운데 점이 우연히 골프장 옆이면 집에서도 인증된다. 휴대폰 '대략적 위치'(안드로이드 약 2km·iOS 수 km)는 통과한다.
 */
export const ONSITE_MAX_ACCURACY_M = 5000;
/** 끝낸 뒤에도 이만큼은 늦게 온 확인을 받아 준다(방장이 끝낸 직후 동반자 폰·느린 GPS) */
export const ONSITE_GRACE_MINUTES = 30;
/** 한 사람이 한 경기에 남길 수 있는 확인 기록 수 — 넘으면 새 줄을 쓰지 않는다(인증되는 확인은 예외) */
export const ONSITE_MAX_ATTEMPTS = 20;

/** 저장하는 거리 구간 — 좌표 대신 이것만 남는다 */
export type OnSiteBucket = "<2km" | "2-10km" | ">10km" | "no-fix" | "no-course";
/** 확인을 부른 때 — 시작·9번 홀·18번 홀·끝내기·다시 확인(칩)·결과 화면 */
export type OnSiteSource = "start" | "hole9" | "hole18" | "finish" | "retry" | "result";
export const ONSITE_SOURCES: readonly OnSiteSource[] = ["start", "hole9", "hole18", "finish", "retry", "result"];

/** 한 번 확인한 결과의 이유 — ok 만 인증 */
export type CheckinReason = "ok" | "far" | "coarse" | "no-fix" | "no-course";
/** 경기 전체 판정의 이유 */
export type VerdictReason = "ok" | "too-fast" | "no-course" | "no-checkin" | "far" | "no-fix";

export interface LatLng { lat: number; lng: number }
export interface Fix extends LatLng { accuracy?: number | null }

/** 두 점 사이 거리(km, 대원거리) */
export function haversineKm(a: LatLng, b: LatLng): number {
    const R = 6371;
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** 거리 → 저장 구간. 2km 경계는 '현장' 쪽이다. */
export function distanceBucket(km: number): OnSiteBucket {
    if (km <= ONSITE_RADIUS_KM) return "<2km";
    if (km <= 10) return "2-10km";
    return ">10km";
}

/**
 * 위치 한 번 → 인증인가. fix 가 null 이면 위치를 못 잡은 것(권한 거부·꺼짐·시간 초과),
 * course 가 null 이면 골프장 좌표를 모르는 것(그 골프장 라운드는 인증할 방법이 없다).
 */
export function judgeCheckin(fix: Fix | null, course: LatLng | null): { verified: boolean; bucket: OnSiteBucket; reason: CheckinReason } {
    if (!course) return { verified: false, bucket: "no-course", reason: "no-course" };
    if (!fix) return { verified: false, bucket: "no-fix", reason: "no-fix" };
    if (fix.accuracy != null && Number.isFinite(fix.accuracy) && fix.accuracy > ONSITE_MAX_ACCURACY_M) {
        return { verified: false, bucket: "no-fix", reason: "coarse" };
    }
    const bucket = distanceBucket(haversineKm(fix, course));
    return bucket === "<2km" ? { verified: true, bucket, reason: "ok" } : { verified: false, bucket, reason: "far" };
}

const ms = (v: Date | string | number | null | undefined): number | null => {
    if (v == null) return null;
    const t = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v);
    return Number.isFinite(t) ? t : null;
};

/** 시작부터 18홀을 다 적기까지 30분이 안 걸렸나. 둘 중 하나라도 모르면 false(판단하지 않는다). */
export function roundTooFast(startedAt: Date | string | number | null | undefined, holesDoneAt: Date | string | number | null | undefined): boolean {
    const s = ms(startedAt), d = ms(holesDoneAt);
    if (s == null || d == null) return false;
    return d - s < ONSITE_MIN_ROUND_MINUTES * 60_000;
}

export interface CheckinLike { memberId: string; verified: boolean; bucket: string }

/**
 * 경기 한 판의 판정 — 동반자 규칙 + 시간 규칙. 끝낼 때(기록의 on_site)와 결과 화면이 같은 함수를 쓴다.
 * memberIds 는 그 경기의 실제 회원(게스트 제외). 그 밖의 번호로 남은 확인은 세지 않는다.
 */
export function sessionOnSite(input: {
    checkins: readonly CheckinLike[];
    memberIds: readonly string[];
    courseKnown: boolean;
    startedAt?: Date | string | number | null;
    holesDoneAt?: Date | string | number | null;
}): { onSite: boolean; reason: VerdictReason } {
    if (!input.courseKnown) return { onSite: false, reason: "no-course" };
    const members = new Set(input.memberIds);
    const mine = input.checkins.filter((c) => members.has(c.memberId));
    if (mine.some((c) => c.verified)) {
        return roundTooFast(input.startedAt, input.holesDoneAt) ? { onSite: false, reason: "too-fast" } : { onSite: true, reason: "ok" };
    }
    if (mine.length === 0) return { onSite: false, reason: "no-checkin" };
    return { onSite: false, reason: mine.some((c) => c.bucket === "2-10km" || c.bucket === ">10km") ? "far" : "no-fix" };
}

/**
 * **도장을 세는 기록인가** — 현장 인증(true)이거나 이 규칙 전의 옛 기록(NULL). false 만 '기록 도장'.
 * 여권·발자국·Elite 60 이 모두 이 한 줄을 거친다(server/storage/golfStamps.ts collectStamps).
 */
export function countsOnSite(onSite: boolean | null | undefined): boolean {
    return onSite !== false;
}

/** 확인 API 응답(POST·GET /api/hiq/golf/match/:id/checkin) */
export interface OnSiteSummary {
    /** 경기 상태 */
    status: "waiting" | "playing" | "finished" | "abandoned";
    /** 골프장 좌표가 있나 — 없으면 인증할 수 없다 */
    courseKnown: boolean;
    /** 지금까지 이 경기에 인증된 확인이 있나(동반자 규칙 포함 — 시간 규칙은 끝낼 때 본다) */
    verified: boolean;
    /** 인증이 동반자 폰에서 왔나(내 확인은 아직 없거나 밖) */
    byCompanion: boolean;
    /** 내 마지막 확인 */
    mine: { verified: boolean; bucket: OnSiteBucket; at: string } | null;
    /** 방금 보낸 확인의 결과(POST 만) */
    last?: { verified: boolean; bucket: OnSiteBucket; reason: CheckinReason } | null;
    /**
     * 끝난 경기에서 **내 기록**이 어떤 도장인가 — onsite(인증)·record(기록 도장)·legacy(이 규칙 전 기록, 인증으로 센다)·
     * none(내 기록이 없다: 18홀 미완성·게스트). 진행 중이면 null.
     */
    stamp: "onsite" | "record" | "legacy" | "none" | null;
    /** 기록 도장이 된 이유(끝난 경기) */
    reason: VerdictReason | null;
    /** 끝난 뒤 다시 확인할 수 있는 마감(ISO) — 지났거나 다시 해도 소용없으면 null */
    retryUntil: string | null;
}
