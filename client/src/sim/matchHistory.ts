/**
 * 대전 이닝 기록 되살리기(2026-09-18 오너: "멀티에서 방 나갔다 다시 이어 하기 하면 이닝별 스코어가 새로 리셋이야? 다 지워져 있네").
 *
 * 이닝 기록은 화면이 샷마다 쌓는다(onOutcome → appendShot). 그래서 대전을 새로 열면(다시 들어오기·목록에서 열기·한 판 더)
 * 기록이 비어 있었고, 한 판 더는 반대로 **앞 판 기록이 그대로 남았다**(같은 화면에서 대전만 갈아타므로).
 * 컨트롤러가 기준점을 알리면(onMatchBase) 여기서 서버 샷 기록을 받아 앞부분을 채운다.
 *
 * 경합 규칙 — 기록을 받는 사이에도 대전은 계속된다:
 *  · 서버 기록은 기준점의 샷 수(shots) **앞** 샷만 쓴다. 그 뒤 샷은 화면이 재생하며 쌓고 있다(withHistory 가 idx 로 잇는다).
 *  · 더 새 기준점이 오면 늦게 도착한 옛 응답은 버린다(번호표).
 *  · 그사이 다른 대전·연습으로 넘어갔으면 버린다(isOpen) — 연습 기록에 대전 줄이 섞이면 안 된다.
 * 실패하면 한 번만 더 해 본다. 못 받아도 대전은 계속되고 그 뒤 샷은 화면이 쌓는다.
 */
import { dropFrom, EMPTY_LOG, rebuildInningLog, withHistory, type HistoryShot, type InningLog } from "./inningLog";
import type { SessionState } from "@shared/sim/rules";

export interface MatchBase {
    readonly matchId: string;
    /** 기준점의 서버 샷 수 — 이 앞(idx < shots)은 서버 기록, 이 뒤는 화면이 쌓는다. */
    readonly shots: number;
    /** 기준점의 세션(규칙·목표를 가져온다) */
    readonly state: SessionState | null;
    /** 대전을 새로 열었다 — 앞 대전 기록을 버린다 */
    readonly fresh: boolean;
}

export interface HistoryLoaderDeps {
    readonly getShots: (matchId: string, from: number) => Promise<readonly HistoryShot[]>;
    /** 이닝 기록 갱신(React setState 처럼 함수형 — 앞선 갱신 뒤에 차례로 적용돼야 한다) */
    readonly update: (fn: (cur: InningLog) => InningLog) => void;
    /** 지금 이 대전이 열려 있나 */
    readonly isOpen: (matchId: string) => boolean;
    readonly retryMs?: number;
    readonly setTimer?: (cb: () => void, ms: number) => unknown;
}

export const HISTORY_RETRY_MS = 3000;

export function makeHistoryLoader(deps: HistoryLoaderDeps): (base: MatchBase) => void {
    let token = 0;
    const setTimer = deps.setTimer ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
    return (base) => {
        const mine = ++token;
        deps.update((cur) => (base.fresh ? EMPTY_LOG : dropFrom(cur, base.shots)));
        if (base.shots <= 0) return;
        const load = (attempt: number): void => {
            // getShots 가 동기로 던져도(주입 실수·오프라인 폴리필) 거부로 받는다 — 화면 콜백 안에서 예외가 새면 안 된다.
            Promise.resolve().then(() => deps.getShots(base.matchId, 0)).then((shots) => {
                if (mine !== token || !deps.isOpen(base.matchId)) return;
                const history = rebuildInningLog(shots.filter((s) => s.idx < base.shots), base.state);
                deps.update((cur) => withHistory(cur, history, base.shots));
            }, () => {
                if (mine === token && attempt < 2) setTimer(() => load(attempt + 1), deps.retryMs ?? HISTORY_RETRY_MS);
            });
        };
        load(1);
    };
}
