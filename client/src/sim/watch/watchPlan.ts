/**
 * 관전·다시보기의 순수 판단부(2026-09-12 오너: "게임 시작하면 방이 사라지는데 관전으로 들어가 볼 수 있게").
 *
 * 화면은 서버 상태를 따라가기만 한다 — 조준도, 샷도, 시계도 없다. 그래서 판단할 것은 셋뿐이다:
 *   1) 다음 폴링을 언제 할까        → nextPollMs
 *   2) 새 샷을 받아와야 하나        → planWatch
 *   3) 받은 샷을 재생할까 건너뛸까  → shouldSkipAnimation
 *
 * 관전자의 폴링은 선수보다 느리다(4초). 선수는 자기 차례를 기다리느라 2초까지 당기지만, 관전자는 몇 초 늦게 봐도
 * 아무 손해가 없고 관전자 수만큼 서버 호출이 곱해진다(서버리스 과금). 화면이 가려져 있으면 아예 쉰다.
 */
import type { MatchShot } from "../matchApi";

/** 관전 목록 쿼리 키 — 멀티방 화면(게임 중인 방 줄)과 다시보기 목록이 같은 캐시를 쓴다. */
export const WATCH_QUERY_KEY = ["sim-watch"] as const;
/** 목록 갱신 주기(ms). 대전 화면(4 s)보다 느리다 — 점수만 보이는 목록이라 급하지 않다. */
export const WATCH_LIST_REFETCH_MS = 15_000;

/** 관전 폴링 주기(ms). 선수(2 s·5 s)보다 느리게 — 관전자는 여럿이 붙을 수 있다. */
export const WATCH_POLL_MS = 4000;
/** 이만큼 이상 밀렸으면 앞의 샷은 재생하지 않고 상태만 따라간다(뒤늦게 들어온 관전자). */
export const WATCH_CATCHUP_LIMIT = 3;

export type WatchPlan =
    | { kind: "idle" }
    | { kind: "fetch"; from: number };

/**
 * 서버가 아는 샷 수와 내가 재생을 마친 샷 수를 견줘 다음 할 일을 정한다.
 * 재생 중이면 아무것도 하지 않는다 — 샷이 끝나고 다시 부른다(중간에 배치를 갈아치우면 공이 순간이동한다).
 */
export function planWatch(o: { serverShots: number; playedShots: number; animating: boolean }): WatchPlan {
    if (o.animating) return { kind: "idle" };
    if (o.serverShots > o.playedShots) return { kind: "fetch", from: o.playedShots };
    return { kind: "idle" };
}

/** 한 번에 여러 샷이 밀려 왔으면 마지막 하나만 재생한다. */
export function shouldSkipAnimation(pending: number): boolean {
    return pending > WATCH_CATCHUP_LIMIT;
}

/** 진행 중인 대전만 폴링한다. 끝난 대전(다시보기)은 더 받아올 것이 없고, 가려진 화면은 쉰다. */
export function nextPollMs(status: string, visible: boolean): number | null {
    if (status !== "playing" || !visible) return null;
    return WATCH_POLL_MS;
}

/**
 * 재생 목록 정리: 샷 번호(idx)가 from 부터 끊김 없이 이어지는 구간만 돌려준다.
 * 따라잡기는 같은 from 을 두 번 부를 수 있어 중복이 섞이고, 번호가 비면 그 뒤는 배치가 어긋나므로 끊는다.
 */
export function normalizeShots(shots: readonly MatchShot[], from: number): readonly MatchShot[] {
    const out: MatchShot[] = [];
    let want = from;
    for (const s of [...shots].sort((a, b) => a.idx - b.idx)) {
        if (s.idx < want) continue;
        if (s.idx > want) break;
        out.push(s);
        want += 1;
    }
    return out;
}
