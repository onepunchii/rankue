/**
 * 진입 화면 맨 위 '내 다마수' 카드(2026-09-12 오너: "온라인게임에 내 핸디가 표기되면 좋겠네 3구 4구").
 *
 * 정보 카드다 — 누르는 곳이 아니다. 진입 화면의 두 그룹(혼자·같이)은 '무엇을 할까'이고, 이 카드는 '나는 몇 다마인가'다.
 * 그래서 드롭다운으로 만들지 않고 늘 펼쳐 둔다. 그룹 카드와 같은 판(검정)·같은 모서리를 쓰되, 숫자를 더 크게 둬서
 * 화면에서 가장 먼저 읽히게 한다.
 *
 * 숫자의 뜻: 핸디전에서 내가 칠 목표 점수다(shared/sim/handicap — 에버리지 × 기준 이닝).
 * 기록이 모자라면 기본값이라고 밝힌다 — 틀린 숫자를 확정된 것처럼 보여 주지 않는다.
 */
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { matchApi, type MatchApi, type MyHandicap } from "../matchApi";
import { GameBalls } from "../rank/GameBalls";
import { ENTRY_STYLE as st } from "./entryTheme";

export const HANDICAP_QUERY_KEY = ["/api/hiq/sim/handicap"] as const;

function Cell({ board, gameType }: { board: MyHandicap | undefined; gameType: "3c" | "4c" }) {
    const { t } = useT();
    const known = !!board;
    return (
        <div className="flex-1 min-w-0 rounded-tile border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
            <div className="flex items-center gap-2">
                <GameBalls gameType={gameType} size={22} />
                <span className="text-[12.5px] font-semibold text-white/70 truncate">
                    {t(gameType === "3c" ? "sim.setup.type3c" : "sim.setup.type4c")}
                </span>
            </div>
            <p className="mt-1.5 flex items-baseline gap-1">
                <span className={cn("rk-num text-[26px] font-bold leading-none", known ? "text-white" : "text-white/35")}>
                    {known ? board!.target : "—"}
                </span>
                <span className="text-[12px] font-medium text-white/45">{t("sim.entry.handicapUnit")}</span>
            </p>
            <p className="mt-1 text-[11px] font-medium text-white/45 truncate">
                {board && board.fromRecord
                    ? t("sim.entry.handicapAvg").replace("{avg}", board.avg.toFixed(3)).replace("{n}", String(board.matches))
                    : t("sim.entry.handicapNew")}
            </p>
        </div>
    );
}

export function HandicapCard({ api = matchApi, enabled = true }: { api?: MatchApi; enabled?: boolean }) {
    const { t } = useT();
    const { data } = useQuery({ queryKey: HANDICAP_QUERY_KEY, queryFn: () => api.getMyHandicap(), enabled, staleTime: 60_000 });
    const board = (g: "3c" | "4c") => data?.boards.find((b) => b.gameType === g);

    return (
        <section className={cn(st.card, "px-4 py-3.5")} data-entry="handicap">
            <div className="flex items-baseline justify-between gap-2 mb-2.5">
                <h2 className={cn("text-[15px] font-bold", st.cardTitle)}>{t("sim.entry.handicapTitle")}</h2>
                <span className="text-[11px] font-semibold text-white/40">{t("sim.entry.handicapAuto")}</span>
            </div>
            <div className="flex gap-2">
                <Cell board={board("3c")} gameType="3c" />
                <Cell board={board("4c")} gameType="4c" />
            </div>
            <p className="mt-2.5 text-[11px] font-medium text-white/45">{t("sim.entry.handicapNote")}</p>
        </section>
    );
}

export default HandicapCard;
