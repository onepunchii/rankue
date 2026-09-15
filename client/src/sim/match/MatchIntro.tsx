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
            // 다크 블러(2026-09-15 오너: "투명도 때문에 흐릿하다, 다크블러로 세련되게").
            // 반투명 검정만 깔면 그 아래 당구대 초록이 비쳐 글자가 뜬다 — 진한 바탕 + 강한 블러로 배경을 지운다.
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-[#07100C]/88 backdrop-blur-2xl animate-in fade-in duration-200"
        >
            <span className="text-[11px] font-bold tracking-[0.34em] text-white/35">{t("sim.intro.title")}</span>
            <div className="flex items-center gap-4">
                {[0, 1].map((i) => {
                    const me = i === myIndex;
                    return (
                        <div key={i} className="contents">
                            {i === 1 && <span className="text-[13px] font-bold tracking-wider text-white/30">VS</span>}
                            {/* 내 쪽은 통째로 칠하지 않는다 — 초록 덩어리가 화면을 먹는다. 얇은 테두리·숫자 색·"나" 칩으로만 구분한다. */}
                            <div className={cn(
                                "min-w-[128px] max-w-[160px] rounded-[20px] px-5 pt-3 pb-4 text-center bg-white/[0.06] ring-1",
                                me ? "ring-brand/55" : "ring-white/10",
                            )}>
                                <div className="h-4 flex items-center justify-center">
                                    {me && <span className="rounded-pill bg-brand px-1.5 py-[2px] text-[9.5px] font-bold leading-none tracking-wide text-brand-fg">{t("sim.intro.me")}</span>}
                                </div>
                                <div className={cn("mt-1 text-[14px] font-bold truncate", me ? "text-white" : "text-white/85")}>{names[i] || "-"}</div>
                                <div className={cn("mt-1.5 rk-num text-[30px] font-bold leading-none", me ? "text-brand" : "text-white")}>{targets[i]}</div>
                                <div className="mt-1.5 text-[10px] font-semibold tracking-wide text-white/40">{t("sim.intro.target")}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex flex-col items-center gap-1">
                {h && h.total > 0 && (
                    <span className="rk-num text-[13px] font-semibold text-white/90">
                        {t("sim.rematch.nth").replace("{n}", String(h.total + 1))}
                        {" · "}
                        {t("sim.rematch.record").replace("{w}", String(h.wins)).replace("{l}", String(h.losses))}
                    </span>
                )}
                {handicap && <span className="text-[11px] font-medium text-white/40 px-10 text-center leading-relaxed">{t("sim.intro.handicap")}</span>}
            </div>
        </button>
    );
}
