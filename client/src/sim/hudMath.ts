/**
 * HUD 에 보여줄 숫자·문구를 만드는 순수 함수. React·DOM 무관, 테스트 동반.
 *
 * 에버리지 규약(점수판 앱 client/src/pages/hiq/game/[id].tsx 의 getAvg 와 같다):
 *   점수판은 완료된 이닝 배열 뒤에 "진행 중 이닝의 현재 런"을 항상 덧붙여 분모를 센다 — 즉 경기 중에는
 *   두 선수 모두 (완료 이닝 + 1) 로 나눈다. 상대 차례라도 그 선수의 다음 이닝을 '진행 중'으로 본다.
 *   여기서도 같게: avg = score / max(1, innings + (currentRun > 0 || phase !== "setup" ? 1 : 0)).
 *   - setup(아직 시작 전)만 완료 이닝 그대로(0 → 분모 1).
 *   - 종료 뒤에도 그대로 둔다: 목표 도달로 끝난 선수는 마지막 득점 이닝이 innings 에 안 들어가므로 +1 이
 *     정확히 그 이닝을 세는 것이고(shared/averageRule "목표 도달 이닝까지"), 상대는 점수판과 같은 값이 된다.
 */
import type { PlayerState, SessionState } from "@shared/sim/rules";
import type { Phase } from "./simReducer";
import type { SimSetupConfig } from "./setupPresets";

export type T = (key: string) => string;

/** 에버리지 분모 — 점수판 앱 규약("진행 중 이닝 포함"). */
export function inningsForAverage(p: Pick<PlayerState, "innings" | "currentRun">, phase: Phase): number {
    const inProgress = p.currentRun > 0 || phase !== "setup" ? 1 : 0;
    return Math.max(1, p.innings + inProgress);
}

export function displayAverage(p: Pick<PlayerState, "score" | "innings" | "currentRun">, phase: Phase): number {
    return p.score / inningsForAverage(p, phase);
}

/** 점수판·전적 화면과 같은 소수 둘째 자리. 음수 정상(4구 파울 감점). */
export function formatAverage(avg: number): string {
    if (!Number.isFinite(avg)) return "0.00";
    // -0.00 이 찍히지 않게
    const v = Math.abs(avg) < 0.005 ? 0 : avg;
    return v.toFixed(2);
}

/**
 * 선수 이름. 1인 세션의 첫 선수는 회원 닉네임(없으면 "나"), 2인 로컬 대전은 "선수 1/2".
 * 서버 세션의 선수 id 는 회원 id 라 화면에 못 쓴다.
 */
export function playerLabel(index: number, playerCount: number, nickname: string | null | undefined, t: T): string {
    if (playerCount === 1 && index === 0) {
        const n = nickname?.trim();
        return n && n.length > 0 ? n : t("sim.hud.you");
    }
    return t("sim.hud.player").replace("{n}", String(index + 1));
}

/** 규칙 배지: "3쿠션 UMB" / "3쿠션 PBA" / "4구" (+ 켜진 옵션). */
export function ruleBadge(config: Pick<SimSetupConfig, "rules">, t: T): string {
    const r = config.rules;
    if (r.gameType === "3c") return r.ruleSet === "pba" ? t("sim.hud.rulePba") : t("sim.hud.ruleUmb");
    const parts = [t("sim.hud.rule4c")];
    if (r.threeCushionDouble) parts.push(t("sim.hud.rule4cDouble"));
    if (r.passiveOpponentContactIsFoul) parts.push(t("sim.hud.rule4cPassive"));
    return parts.join(" · ");
}

export function tableLabel(config: Pick<SimSetupConfig, "tableId">, t: T): string {
    return config.tableId === "DAEDAE" ? t("sim.setup.tableDaedae") : t("sim.setup.tableJungdae");
}

/** 종료 사유 문구. 1인: 목표 달성 / 이닝 제한. 2인: 승자 이름 / 무승부. */
export function endTitle(session: SessionState, names: readonly string[], t: T): string {
    if (session.players.length === 1) {
        return session.winnerIndex === 0 && session.players[0].score >= session.players[0].target
            ? t("sim.end.win")
            : t("sim.end.inningCap");
    }
    if (session.winnerIndex === null) return t("sim.end.draw");
    return t("sim.end.winner").replace("{name}", names[session.winnerIndex] ?? "");
}
