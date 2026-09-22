import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useSeo } from "@/hooks/useSeo";
import { BilliardBall } from "@/components/hiq/ui/BilliardBall";
import { useT } from "@/lib/i18n";

// 날짜 표기용 BCP-47 태그 — 로케일별 관례(ko 2026. 9. 22. / es 22/9/2026)를 브라우저에 맡긴다.
const DATE_TAG: Record<string, string> = { ko: "ko-KR", en: "en-US", es: "es-419", tr: "tr-TR", vi: "vi-VN" };

// 공유용 공개 결과 페이지 (/r/:id) — 로그인 없이 열린다.
// 이미지 파일을 주고받는 대신 링크 하나를 던지는 방식: 앱 재빌드(=스토어 재심사)가 필요 없고,
// 링크를 받은 사람이 결과를 본 뒤 그 자리에서 앱으로 들어올 수 있다.
// 카톡 미리보기 카드는 server/prerender.ts 가 봇에게 내려주는 OG 메타가 담당한다.

const BALL = ["white", "yellow", "red", "red"] as const;

export default function SharedResult() {
    const [, params] = useRoute("/r/:id");
    const [, setLocation] = useLocation();
    const { t, locale } = useT();
    const gameId = params?.id;

    const { data: game, isLoading } = useQuery<any>({
        queryKey: ["/api/hiq/game", gameId],
        queryFn: async () => await apiRequest(`/api/hiq/game/${gameId}`),
        enabled: !!gameId,
        retry: false,
    });

    const typeLabel = game?.gameType === "3c" ? t("sharedResult.threeCushion") : t("sharedResult.fourBall");
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

    const brand = t("sharedResult.brand");
    const inningsTxt = t("sharedResult.totalInnings").replace("{n}", String(innings));
    const title = game
        ? `${typeLabel} ${view.map((p) => `${p.name} ${p.score}`).join(" : ")} · ${brand}`
        : `${t("sharedResult.metaTitle")} · ${brand}`;

    useSeo({
        title,
        description: game
            ? t("sharedResult.metaDesc")
                .replace("{type}", typeLabel)
                .replace("{scores}", view.map((p) => t("sharedResult.scoreOf").replace("{name}", p.name ?? "").replace("{score}", String(p.score))).join(", "))
                .replace("{innings}", inningsTxt)
            : t("sharedResult.metaDescFallback"),
        path: `/r/${gameId ?? ""}`,
        image: "https://www.rankue.co.kr/og.png",
    });

    return (
        <div className="min-h-screen w-full bg-surface-0 text-[rgba(0,0,0,0.87)] font-sans">
            <div className="mx-auto max-w-md px-5 py-10">
                {isLoading ? (
                    <div className="h-64 rounded-3xl bg-black/[0.04] animate-pulse" />
                ) : !game ? (
                    <div className="rounded-3xl bg-white p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                        <p className="text-[15px] font-semibold text-ink-1">{t("sharedResult.notFound")}</p>
                        <p className="mt-1 text-[13px] text-black/50">{t("sharedResult.notFoundDesc")}</p>
                    </div>
                ) : (
                    <>
                        <div className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                            <div className="flex items-center justify-between">
                                <span className="rounded-full bg-brand/10 px-3 py-1 text-[12px] font-bold text-brand">
                                    {typeLabel}
                                </span>
                                <span className="text-[12px] font-medium text-black/40">
                                    {game.createdAt ? new Date(game.createdAt).toLocaleDateString(DATE_TAG[locale] ?? "en-US") : ""}
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
                                                        {t("sharedResult.win")}
                                                    </span>
                                                )}
                                            </div>
                                            {p.highRun > 0 && (
                                                <p className="mt-0.5 text-[12px] font-medium text-black/45 tabular-nums">
                                                    {t("sharedResult.highRun")} {p.highRun}
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
                                    {inningsTxt}
                                </p>
                            )}
                        </div>

                        {/* 링크를 받고 들어온 사람을 앱으로 — 이미지 공유엔 없던 유입 경로 */}
                        <div className="mt-6 rounded-3xl bg-brand p-6 text-center shadow-[0_8px_24px_rgba(0,98,65,0.20)]">
                            <p className="text-[17px] font-bold text-white">{t("sharedResult.tagline")}</p>
                            <p className="mt-1.5 text-[13px] font-medium text-white/80">
                                {t("sharedResult.pitch")}
                            </p>
                            <button
                                onClick={() => setLocation("/")}
                                className="mt-5 h-11 w-full rounded-full bg-white text-[14px] font-bold text-brand active:scale-[0.98] transition-transform"
                            >
                                {t("sharedResult.startRankue")}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
