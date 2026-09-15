import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * 대전 시작 인사 화면(2026-09-15 오너: 라포 3번). 첫 샷 전에 몇 초 떴다 사라진다.
 *
 * 왜 필요한가: 지금은 아무 소개 없이 바로 공부터 굴러간다. 대전 데이터에 이름 말고는 상대 정보가 없어서
 * "누구랑 치는지 모른 채" 친다. 이름·다마수·몇 번째 만남을 한 번 보여 주면 상대가 사람이 된다.
 *
 * 핸디전이면 다마수가 왜 그렇게 정해졌는지도 여기서 말한다 — 참가할 때 서버가 두 사람 에버리지로 정하는데,
 * 그 설명이 어디에도 없어 "왜 내 다마가 이거지?" 가 되던 자리다.
 */
export const INTRO_MS = 3500;

export function MatchIntro({ matchId, names, targets, myIndex, handicap, visible, onDismiss }: {
    matchId: string;
    names: readonly string[];
    /** [호스트 다마수, 게스트 다마수] */
    targets: readonly [number, number];
    myIndex: number;
    /** 핸디전이면 다마수가 어떻게 정해졌는지 한 줄 덧붙인다 */
    handicap?: boolean;
    visible: boolean;
    onDismiss: () => void;
}) {
    const { t } = useT();
    // 몇 번째 만남인지 — 끝난 대전 화면과 같은 엔드포인트를 쓴다(진행 중에도 답한다).
    const { data } = useQuery<{ headToHead: { wins: number; losses: number; total: number } | null }>({
        queryKey: [`/api/hiq/sim/matches/${matchId}/rapport`],
        queryFn: async () => apiRequest(`/api/hiq/sim/matches/${matchId}/rapport`),
        staleTime: 60_000,
        enabled: visible,
    });
    const h = data?.headToHead ?? null;
    if (!visible) return null;

    return (
        <button
            type="button" onClick={onDismiss}
            aria-label={t("sim.intro.dismiss")}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/72 backdrop-blur-[2px] animate-in fade-in duration-200"
        >
            <span className="text-[12px] font-bold tracking-[0.2em] text-white/55">{t("sim.intro.title")}</span>
            <div className="flex items-center gap-3">
                {[0, 1].map((i) => (
                    <div key={i} className="contents">
                        {i === 1 && <span className="text-[15px] font-bold text-white/45">VS</span>}
                        <div className={cn(
                            "min-w-[112px] max-w-[150px] rounded-2xl px-4 py-3 text-center",
                            i === myIndex ? "bg-brand text-brand-fg" : "bg-white/12 text-white",
                        )}>
                            <div className="text-[15px] font-bold truncate">{names[i] || "-"}</div>
                            <div className="mt-1 rk-num text-[22px] font-bold leading-none">{targets[i]}</div>
                            <div className="mt-1 text-[10.5px] font-semibold opacity-70">{t("sim.intro.target")}</div>
                        </div>
                    </div>
                ))}
            </div>
            {h && h.total > 0 && (
                <span className="rk-num text-[12.5px] font-semibold text-white/75">
                    {t("sim.rematch.nth").replace("{n}", String(h.total + 1))}
                    {" · "}
                    {t("sim.rematch.record").replace("{w}", String(h.wins)).replace("{l}", String(h.losses))}
                </span>
            )}
            {handicap && <span className="text-[11.5px] font-medium text-white/55 px-8 text-center">{t("sim.intro.handicap")}</span>}
        </button>
    );
}
