/**
 * 로비·목록 화면이 대전 행(MatchPublic)에서 뽑는 표시값 — 순수 함수만(React·DOM 무관, 테스트 동반).
 * 문구는 i18n 키로 돌려주고 화면이 t() 로 바꾼다.
 */
import type { MatchPublic } from "../matchApi";
import { isMyTurn, matchResult } from "../matchApi";

export type T = (key: string) => string;

/** 목록 배지 색: brand(내 차례) · outline(상대 차례·대기) · win · muted(패·무·취소) */
export type BadgeTone = "brand" | "outline" | "win" | "muted";

export interface MatchBadge {
    readonly key: string;
    readonly tone: BadgeTone;
}

/** 상태 배지. 내 차례 / 상대 차례 / 상대 대기 중 / 승·패·무 / 취소됨 */
export function matchBadge(m: MatchPublic): MatchBadge {
    if (m.status === "playing") {
        return isMyTurn(m) ? { key: "sim.match.statusMyTurn", tone: "brand" } : { key: "sim.match.statusTheirTurn", tone: "outline" };
    }
    if (m.status === "waiting") return { key: "sim.match.statusWaiting", tone: "outline" };
    if (m.status === "canceled") return { key: "sim.match.statusCanceled", tone: "muted" };
    const r = matchResult(m);
    if (r === "win") return { key: "sim.match.statusWon", tone: "win" };
    if (r === "draw") return { key: "sim.match.statusDraw", tone: "muted" };
    return { key: "sim.match.statusLost", tone: "muted" };
}

/** 목록 정렬 순위: 내 차례 → 상대 차례 → 상대 대기 → 끝남·취소. 같은 순위는 서버 순서(최신 먼저) 유지. */
export function listRank(m: MatchPublic): number {
    if (m.status === "playing") return isMyTurn(m) ? 0 : 1;
    if (m.status === "waiting") return 2;
    return 3;
}

export function sortForList(ms: readonly MatchPublic[]): readonly MatchPublic[] {
    return ms.map((m, i) => ({ m, i })).sort((a, b) => listRank(a.m) - listRank(b.m) || a.i - b.i).map((x) => x.m);
}

/** 상대 이름. 게스트가 아직 없으면 "상대 미정". 참가자가 아니면(코드 조회) 호스트 이름. */
export function opponentLabel(m: MatchPublic, t: T): string {
    if (m.myIndex === 1) return m.hostName;
    if (m.myIndex === 0) return m.guestName ?? t("sim.match.opponentPending");
    return m.hostName;
}

/** "3쿠션 · 대대" 같은 종목·테이블 한 줄 */
export function gameLabel(m: Pick<MatchPublic, "gameType" | "tableId">, t: T): string {
    const g = m.gameType === "3c" ? t("sim.setup.type3c") : t("sim.setup.type4c");
    const table = m.tableId === "DAEDAE" ? t("sim.setup.tableDaedae") : t("sim.setup.tableJungdae");
    return `${g} · ${table}`;
}

/** 규칙 한 줄(참가 화면): UMB/PBA 또는 4구 옵션. */
export function rulesLabel(m: Pick<MatchPublic, "rules">, t: T): string {
    const r = m.rules;
    if (r.gameType === "3c") return r.ruleSet === "pba" ? t("sim.hud.rulePba") : t("sim.hud.ruleUmb");
    const parts = [t("sim.hud.rule4c")];
    if (r.threeCushionDouble) parts.push(t("sim.hud.rule4cDouble"));
    if (r.passiveOpponentContactIsFoul) parts.push(t("sim.hud.rule4cPassive"));
    return parts.join(" · ");
}

export function inningCapLabel(inningCap: number, t: T): string {
    return inningCap === 0 ? t("sim.setup.inningNone") : t("sim.setup.inningN").replace("{n}", String(inningCap));
}

/** 끝난 대전의 사유 문구 키 + 이름 치환. 이름은 players 순서의 이름 배열. */
export function endReasonText(m: Pick<MatchPublic, "status" | "endReason" | "winnerIndex" | "hostName" | "guestName">, t: T): string | null {
    if (m.status !== "finished") return null;
    const names = [m.hostName, m.guestName ?? ""];
    const winner = m.winnerIndex === null ? "" : names[m.winnerIndex];
    const loser = m.winnerIndex === null ? "" : names[1 - m.winnerIndex];
    switch (m.endReason) {
        case "resign": return t("sim.match.endResign").replace("{name}", loser);
        case "claim": return t("sim.match.endClaim").replace("{name}", winner);
        case "inningCap": return t("sim.match.endInningCap");
        case "target": return t("sim.match.endTarget");
        default: return null;
    }
}

/** 코드 조회·참가 실패 → 문구 키. 404 없음 / 409 이미 시작 / 400 내 대전 / 그 밖엔 일반 오류 */
export function joinErrorKey(err: unknown): string {
    const status = typeof err === "object" && err !== null && typeof (err as { status?: unknown }).status === "number"
        ? (err as { status: number }).status
        : null;
    if (status === 404) return "sim.match.notFound";
    if (status === 409) return "sim.match.alreadyStarted";
    if (status === 400) return "sim.match.ownMatch";
    return "sim.match.error";
}

/** 공유 문구(navigator.share / 클립보드). */
export function shareText(code: string, t: T): string {
    return t("sim.match.shareText").replace("{code}", code);
}
