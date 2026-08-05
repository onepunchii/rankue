import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useSeo } from "@/hooks/useSeo";
import { BilliardBall } from "@/components/hiq/ui/BilliardBall";

// 공유용 공개 결과 페이지 (/r/:id) — 로그인 없이 열린다.
// 이미지 파일을 주고받는 대신 링크 하나를 던지는 방식: 앱 재빌드(=스토어 재심사)가 필요 없고,
// 링크를 받은 사람이 결과를 본 뒤 그 자리에서 앱으로 들어올 수 있다.
// 카톡 미리보기 카드는 server/prerender.ts 가 봇에게 내려주는 OG 메타가 담당한다.

const BALL = ["white", "yellow", "red", "red"] as const;

export default function SharedResult() {
    const [, params] = useRoute("/r/:id");
    const [, setLocation] = useLocation();
    const gameId = params?.id;

    const { data: game, isLoading } = useQuery<any>({
        queryKey: ["/api/hiq/game", gameId],
        queryFn: async () => await apiRequest(`/api/hiq/game/${gameId}`),
        enabled: !!gameId,
        retry: false,
    });

    const typeLabel = game?.gameType === "3c" ? "3쿠션" : "4구";
    const innings = Number(game?.totalInnings) || 0;

    const players = [1, 2, 3, 4]
        .map((n) => ({
            name: game?.[`player${n}Name`] as string | null,
            score: Number(game?.[`player${n}Score`]) || 0,
            target: Number(game?.[`player${n}Target`]) || 0,
            highRun: Number(game?.[`player${n}HighRun`]) || 0,
            ball: BALL[n - 1],
            isWinner: !!game?.winnerId && game?.[`player${n}Id`] === game?.winnerId,
        }))
        .filter((p) => p.name);

    // 승자 표시: winnerId 가 없으면(게스트 승 등) 목표 도달한 슬롯을 승자로 본다.
    const hasWinnerFlag = players.some((p) => p.isWinner);
    const view = players.map((p) => ({
        ...p,
        win: hasWinnerFlag ? p.isWinner : p.target > 0 && p.score >= p.target,
    }));

    const title = game
        ? `${typeLabel} ${view.map((p) => `${p.name} ${p.score}`).join(" : ")} · 랭큐`
        : "경기 결과 · 랭큐";

    useSeo({
        title,
        description: game
            ? `${typeLabel} 경기 결과 — ${view.map((p) => `${p.name} ${p.score}점`).join(", ")} (${innings}이닝). 손안의 당구 점수판, 랭큐.`
            : "랭큐에서 기록한 당구 경기 결과입니다.",
        path: `/r/${gameId ?? ""}`,
        image: "https://www.rankue.co.kr/og.png",
    });

    return (
        <div className="min-h-screen w-full bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] font-sans">
            <div className="mx-auto max-w-md px-5 py-10">
                {isLoading ? (
                    <div className="h-64 rounded-3xl bg-black/[0.04] animate-pulse" />
                ) : !game ? (
                    <div className="rounded-3xl bg-white p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                        <p className="text-[15px] font-semibold text-ink-1">경기를 찾을 수 없어요</p>
                        <p className="mt-1 text-[13px] text-black/50">링크가 만료되었거나 삭제된 경기입니다.</p>
                    </div>
                ) : (
                    <>
                        <div className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                            <div className="flex items-center justify-between">
                                <span className="rounded-full bg-brand/10 px-3 py-1 text-[12px] font-bold text-brand">
                                    {typeLabel}
                                </span>
                                <span className="text-[12px] font-medium text-black/40">
                                    {game.createdAt ? new Date(game.createdAt).toLocaleDateString("ko-KR") : ""}
                                </span>
                            </div>

                            <div className="mt-5 flex flex-col gap-2.5">
                                {view.map((p, i) => (
                                    <div
                                        key={i}
                                        className={`flex items-center gap-3 rounded-2xl p-3.5 ${p.win ? "bg-brand/[0.07]" : "bg-black/[0.02]"}`}
                                    >
                                        <BilliardBall color={p.ball as any} size={26} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="truncate text-[15px] font-bold text-ink-1">{p.name}</span>
                                                {p.win && (
                                                    <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                                        승
                                                    </span>
                                                )}
                                            </div>
                                            {p.highRun > 0 && (
                                                <p className="mt-0.5 text-[12px] font-medium text-black/45 tabular-nums">
                                                    하이런 {p.highRun}
                                                </p>
                                            )}
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <span className={`text-[26px] font-bold tabular-nums ${p.win ? "text-brand" : "text-ink-1"}`}>
                                                {p.score}
                                            </span>
                                            {p.target > 0 && (
                                                <span className="ml-0.5 text-[13px] font-medium text-black/35 tabular-nums">/{p.target}</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {innings > 0 && (
                                <p className="mt-4 text-center text-[12.5px] font-semibold text-black/45 tabular-nums">
                                    총 {innings}이닝
                                </p>
                            )}
                        </div>

                        {/* 링크를 받고 들어온 사람을 앱으로 — 이미지 공유엔 없던 유입 경로 */}
                        <div className="mt-6 rounded-3xl bg-brand p-6 text-center shadow-[0_8px_24px_rgba(0,98,65,0.20)]">
                            <p className="text-[17px] font-bold text-white">손안의 당구 점수판</p>
                            <p className="mt-1.5 text-[13px] font-medium text-white/80">
                                터치로 점수 기록, 이닝·평균·하이런 자동 계산
                            </p>
                            <button
                                onClick={() => setLocation("/")}
                                className="mt-5 h-11 w-full rounded-full bg-white text-[14px] font-bold text-brand active:scale-[0.98] transition-transform"
                            >
                                랭큐 시작하기
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
