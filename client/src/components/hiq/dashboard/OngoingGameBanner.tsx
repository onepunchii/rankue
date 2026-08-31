import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useT } from "@/lib/i18n";
import { LucidePlay } from "@/lib/icons";
import type { HiqGame } from "@shared/schema";

// 진행 중 경기 이어하기 배너 — 이탈한 경기로 돌아가는 유일한 입구.
//
// 왜 필요한가(2026-08-31 실측): 점수판에서 나가면(뒤로가기·앱 종료·하단 '나가기')
// 그 경기로 돌아갈 경로가 앱 어디에도 없어서, 경기가 영구히 playing_base 로 남았다.
// 전체 완주율 33%, 외국 유저 7명은 19경기 전부 미완료(완주율 0%)였다.
// 서버는 최근 24시간 것만 돌려준다 — 며칠 지난 미완 경기는 들이밀지 않는다.
export function OngoingGameBanner() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const { data: game } = useQuery<HiqGame | null>({
        queryKey: ["/api/hiq/game/ongoing/mine"],
        staleTime: 30_000,
    });

    if (!game) return null;

    const names = [game.player1Name, game.player2Name, game.player3Name, game.player4Name]
        .filter(Boolean).join(" vs ");

    return (
        <button
            onClick={() => setLocation(`/game/${game.id}`)}
            className="w-full mb-4 px-4 py-3.5 rounded-tile bg-brand text-brand-fg flex items-center gap-3 text-left active:scale-[0.99] transition-transform shadow-[0_2px_8px_rgba(0,98,65,0.3)]"
        >
            <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <LucidePlay className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold">{t("dashboard.resumeGame")}</span>
                <span className="block text-[12px] text-white/75 truncate">
                    {names} · {game.gameType === "3c" ? t("crewTournament.type3c") : t("crewTournament.type4c")}
                </span>
            </span>
            <span className="text-[12px] font-semibold shrink-0 bg-white/20 rounded-pill px-2.5 py-1">
                {t("dashboard.resumeCta")}
            </span>
        </button>
    );
}
