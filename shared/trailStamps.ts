/**
 * 코리아둘레길 코스 도장(2026-10-21) — 코스의 **두 끝에서 위치를 한 번씩** 확인하면 그 코스의 도장.
 *
 * 정상 도장(shared/hikingStamps)은 정상 150m 안 한 번이면 된다. 둘레길은 '끝'이 둘이라, 한쪽에서만 누르면
 * 이어진 두 코스(1코스의 끝 = 2코스의 시작)를 한자리에서 찍을 수 있다. 그래서 한쪽 끝에서 '여기 왔어요'(출발 확인)
 * → 반대쪽 끝에서 한 번 더(36시간 안) = 그 코스를 걸었다. 어느 쪽에서 출발해도 된다(거꾸로 걷는 사람).
 * 순환 코스(시작 = 끝)는 같은 자리에서 두 번 — 대신 코스 시간의 40%(30분 아래로는 안 내림)가 지난 뒤.
 *
 * **좌표는 저장하지 않는다**: 서버가 두 끝까지의 거리를 재고 '어느 끝(start · end)' · 때 · 거리 구간만 남긴다(정상 인증과 같은 원칙).
 * 길 넷의 '완주' 같은 것은 두루누비가 전 코스를 공개하기 전엔 만들지 않는다(공개 170 / 284).
 */
import { distM } from "./hikingGeo.js";

/** 코스 끝에서 이 안이면 그 끝에 왔다(m) — 끝점은 안내판 · 스탬프함 둘레라 정상보다 조금 넓게 */
export const TRAIL_END_RADIUS_M = 200;
/** 이보다 흐린 위치(정확도 반경, m)는 쓰지 않는다 */
export const TRAIL_MAX_ACCURACY_M = 200;
/** 출발 확인에서 반대쪽 끝까지(시간) — 하루 반. 그 뒤면 출발 확인부터 다시 */
export const TRAIL_PAIR_WINDOW_H = 36;
/** 순환 코스로 보는 두 끝의 거리(m) */
export const TRAIL_LOOP_M = 300;

export type TrailEnd = "start" | "end";
export type TrailBucket = "<200m" | "200m-1km" | "1-5km" | ">5km" | "coarse" | "no-fix";
export type TrailReason = "ok" | "far" | "coarse" | "no-fix";

export interface TrailEnds { start: readonly [number, number]; end: readonly [number, number]; loop: boolean; minutes: number | null }

export const isLoopCourse = (c: { start: readonly [number, number]; end: readonly [number, number]; loop?: boolean }): boolean =>
    !!c.loop || distM(c.start[0], c.start[1], c.end[0], c.end[1]) <= TRAIL_LOOP_M;

/** 지금 자리가 어느 끝인가 — 가까운 끝 하나. 순환 코스는 늘 'start' */
export function judgeTrailEnd(c: TrailEnds, fix: { lat: number; lng: number; accuracy?: number | null } | null): { at: TrailEnd | null; bucket: TrailBucket; reason: TrailReason; m: number | null } {
    if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) || Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180) return { at: null, bucket: "no-fix", reason: "no-fix", m: null };
    if (fix.accuracy != null && Number.isFinite(fix.accuracy) && fix.accuracy > TRAIL_MAX_ACCURACY_M) return { at: null, bucket: "coarse", reason: "coarse", m: null };
    const ds = distM(fix.lat, fix.lng, c.start[0], c.start[1]);
    const de = distM(fix.lat, fix.lng, c.end[0], c.end[1]);
    const near: TrailEnd = c.loop || ds <= de ? "start" : "end";
    const m = near === "start" ? ds : de;
    if (m <= TRAIL_END_RADIUS_M) return { at: near, bucket: "<200m", reason: "ok", m: Math.round(m) };
    return { at: null, bucket: m <= 1000 ? "200m-1km" : m <= 5000 ? "1-5km" : ">5km", reason: "far", m: Math.round(m) };
}

/** 순환 코스의 두 번째 확인까지 기다릴 시간(분) */
export const loopGapMin = (minutes: number | null): number => Math.max(30, Math.round((minutes ?? 120) * 0.4));

export interface TrailCheck { end: TrailEnd; atMs: number }

/**
 * 이번 확인으로 도장이 되는가 — 앞서 남긴 확인(이 코스 · 이 사람, 최근 것)과 견준다.
 *  - 한 방향 코스: 36시간 안에 **반대쪽 끝**의 확인이 있으면 도장
 *  - 순환 코스: 36시간 안, loopGapMin 이 지난 같은 자리의 확인이 있으면 도장
 * 도장이 되면 처음 확인(출발)의 끝과 때를 돌려준다.
 */
export function trailPairs(c: TrailEnds, earlier: readonly TrailCheck[], now: TrailCheck): { done: boolean; from: TrailCheck | null } {
    const windowMs = TRAIL_PAIR_WINDOW_H * 3_600_000;
    const live = earlier.filter((x) => now.atMs - x.atMs >= 0 && now.atMs - x.atMs <= windowMs).sort((a, b) => a.atMs - b.atMs);
    const from = c.loop
        ? live.find((x) => now.atMs - x.atMs >= loopGapMin(c.minutes) * 60_000) ?? null
        : live.find((x) => x.end !== now.end) ?? null;
    return { done: !!from, from };
}

/** 확인이 안 됐을 때 · 반쯤 됐을 때의 한 줄 */
export function trailHint(r: { reason: TrailReason; bucket: TrailBucket }): string {
    if (r.reason === "no-fix") return "위치를 잡지 못했어요. 하늘이 트인 곳에서 다시 눌러 주세요.";
    if (r.reason === "coarse") return "위치가 흐려요. 잠시 뒤에 다시 눌러 주세요.";
    return r.bucket === "200m-1km" ? "코스 끝이 가까워요. 안내판 · 스탬프함 쪽으로 조금 더 가서 눌러 주세요." : `코스의 시작이나 끝 ${TRAIL_END_RADIUS_M}m 안에서 눌러 주세요.`;
}

/** 출발 확인만 있을 때 — 반대쪽 끝(이름이 있으면 이름)과 남은 시간 */
export function trailHalfLine(c: TrailEnds & { startName: string | null; endName: string | null }, open: TrailCheck, nowMs: number): string {
    const left = Math.max(0, TRAIL_PAIR_WINDOW_H * 3_600_000 - (nowMs - open.atMs));
    const h = Math.floor(left / 3_600_000);
    const until = h >= 1 ? `${h}시간 안에` : `${Math.max(1, Math.round(left / 60_000))}분 안에`;
    if (c.loop) return `출발을 확인했어요 — 한 바퀴 돌아 이 자리에서 ${until} 한 번 더 눌러 주세요(${loopGapMin(c.minutes)}분 뒤부터).`;
    const other = open.end === "start" ? c.endName ?? "코스 끝" : c.startName ?? "코스 시작";
    return `출발을 확인했어요 — 반대쪽 끝 ${other}에서 ${until} 한 번 더 누르면 이 코스 도장이에요.`;
}
