import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { BallDot } from "@/components/hiq/BallDot";
import { LucideChevronLeft, LucideChevronRight, LucideTrophy } from "@/lib/icons";
import { CREW_CARD, CREW_TEXT, CrewError, CrewSection, CrewSkeleton, IconButton } from "@/components/hiq/crew-ui";
import { formatKstDate } from "@/components/hiq/poll/crewTimeFormat";

// 크루 명예의 전당 — 전용 페이지(오너 결정 2026-08-30).
//
// 홈에 끼워 넣었더니 목록 다섯 줄이 똑같이 생겨서 누가 왕인지 안 보였다. 전당은 스쳐 보는
// 곳이 아니라 **보러 오는** 곳이라 페이지를 따로 줬다.
//
// 색 언어는 당구장 그대로다:
//   라사 초록(--cloth) = 바탕(테이블 천) · 금색(--gold) = 우승 의례
//   빨간 공 = 3쿠션 · 노란 공 = 4구 · 카드(surface-1) = 그 위에 놓인 것들
// 승패에는 공 색을 쓰지 않는다(BallDot.tsx 규칙). 여기서 공 색은 종목 표시 전용이다.
//
// 2026-09-26 크루 정비: 불러오기 실패를 "아직 끝난 대회가 없어요"로 보여 주던 것을 오류로 구분했다(CrewError).
// 카드는 크루 공통 카드(CREW_CARD)로 — bg-white·그림자 리터럴은 골프(어두운 테마)에서 흰 판으로 떴다.
// 역대 대회에 끝난 날(KST)을 붙였다. 경기를 치고 돌아왔을 때 새 챔피언이 바로 보이도록 들어올 때마다 새로 받는다.

interface Honor {
    memberId: string; nickname: string; gameType: "3c" | "4c";
    wins: number; runnerUp: number; semi: number; played: number;
}
interface Past {
    id: string; title: string; gameType: "3c" | "4c"; format: "knockout" | "league";
    championId: string | null; championName: string | null; endedAt: string;
}
interface Data { current: Past | null; honors: Honor[]; history: Past[] }

export default function CrewHallOfFame() {
    const { id } = useParams<{ id: string }>();
    const [, setLocation] = useLocation();
    const { t, locale } = useT();

    const { data: crewData } = useQuery<any>({ queryKey: [`/api/hiq/crews/${id}`], enabled: !!id });
    const { data, isLoading, isError, refetch } = useQuery<Data>({
        queryKey: [`/api/hiq/crews/${id}/tournaments/hall-of-fame`],
        enabled: !!id,
        refetchOnMount: "always",
    });

    const crewName = crewData?.crew?.name ?? "";
    // 3쿠션 왕·4구 왕은 당구 전용이다. 골프 크루는 대회 자체를 안 열므로 이 화면도 없다.
    // (홈에서 진입로는 감췄지만 주소로 들어올 수 있어 여기서도 막는다, 2026-09-09)
    const isGolfCrew = crewData?.crew?.sportCategory === "GOLF";
    const back = () => setLocation(`/crew/${id}/tournament`);
    useEffect(() => { if (isGolfCrew) setLocation(`/crew/${id}`, { replace: true }); }, [isGolfCrew, id, setLocation]);

    // 종목별 왕 — 그 종목에서 우승이 가장 많은 사람. 3쿠션과 4구는 실력 스케일이 달라
    // 한 줄로 세우면 한 사람이 모든 왕관을 쓴다.
    const kingOf = (type: "3c" | "4c") =>
        (data?.honors ?? []).filter((h) => h.gameType === type && h.wins > 0).sort((a, b) => b.wins - a.wins)[0] ?? null;

    const champions = (data?.honors ?? []).filter((h) => h.wins > 0);
    const podiumOnly = (data?.honors ?? []).filter((h) => h.wins === 0 && (h.runnerUp > 0 || h.semi > 0));

    return (
        <div className="min-h-[100dvh] bg-surface-0">
            {/* ── 라사 밴드: 헤더 + 현 챔피언 ─────────────────────────── */}
            <div className="relative bg-cloth text-white">
                <div className="flex items-center gap-1 px-2 pt-[env(safe-area-inset-top)] min-h-14">
                    <IconButton label={t("common.back")} onClick={back} className="text-white/85 active:bg-white/10">
                        <LucideChevronLeft />
                    </IconButton>
                    <h1 className="text-[17px] font-semibold text-white">{t("hallOfFame.title")}</h1>
                    {crewName && <span className="min-w-0 text-[13px] font-medium text-white/60 truncate">· {crewName}</span>}
                </div>

                <div className="px-4 pb-9 pt-3">
                    {isLoading ? (
                        <div className="mx-auto h-[132px] max-w-[240px] rounded-card bg-white/10 animate-pulse" aria-busy="true" />
                    ) : data?.current?.championName ? (
                        <div className="flex flex-col items-center text-center">
                            <BigTrophy />
                            <span className="mt-2 text-[12px] font-semibold tracking-[0.18em] text-gold rk-num">
                                {t("hallOfFame.currentChampion")}
                            </span>
                            <span className="mt-1 text-[22px] leading-tight font-semibold text-white break-words">
                                {data.current.championName}
                            </span>
                            <span className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-3 py-1.5 text-[13px] font-medium text-white/80">
                                <BallDot type={data.current.gameType} size={10} />
                                {data.current.title}
                            </span>
                        </div>
                    ) : !isError ? (
                        <div className="flex flex-col items-center text-center py-4">
                            <BigTrophy dim />
                            <p className="mt-3 text-[13px] font-medium text-white/65 leading-relaxed max-w-[16rem]">
                                {t("hallOfFame.empty")}
                            </p>
                        </div>
                    ) : <div className="h-6" />}
                </div>

                {/* 라사 아래로 카드가 걸치게 — 트로피룸 느낌 */}
                <div className="absolute inset-x-0 -bottom-px h-6 bg-surface-0 rounded-t-[1.5rem]" />
            </div>

            <div className="px-4 pb-nav flex flex-col gap-6 -mt-1">
                {isError && <CrewError onRetry={() => refetch()} />}
                {isLoading && <CrewSkeleton rows={3} height={64} />}

                {/* ── 종목별 왕 ─────────────────────────────────────── */}
                {(kingOf("3c") || kingOf("4c")) && (
                    <CrewSection title={t("hallOfFame.kings")}>
                        <div className="grid grid-cols-2 gap-3">
                            <KingCard type="3c" honor={kingOf("3c")} />
                            <KingCard type="4c" honor={kingOf("4c")} />
                        </div>
                    </CrewSection>
                )}

                {/* ── 우승 순위 ─────────────────────────────────────── */}
                {champions.length > 0 && (
                    <CrewSection title={t("hallOfFame.winners")}>
                        <div className="flex flex-col gap-2">
                            {champions.map((h, i) => (
                                <div
                                    key={`${h.memberId}:${h.gameType}`}
                                    className={cn(CREW_CARD, "flex items-center gap-3 py-3.5", i === 0 && "ring-1 ring-gold")}
                                >
                                    <span className={cn("w-6 shrink-0 text-center text-[15px] font-semibold rk-num", i === 0 ? "text-gold" : "text-ink-3")}>
                                        {i + 1}
                                    </span>
                                    <BallDot type={h.gameType} size={13} />
                                    <span className="flex-1 min-w-0 truncate text-[15px] font-semibold text-ink-1">{h.nickname}</span>
                                    {/* 우승은 숫자보다 컵을 늘어놓는 게 한눈에 들어온다(4개까지). */}
                                    <span className="flex items-center gap-0.5 shrink-0" aria-label={t("hallOfFame.winCount").replace("{n}", String(h.wins))}>
                                        {h.wins <= 4
                                            ? Array.from({ length: h.wins }, (_, k) => <LucideTrophy key={k} className="w-4 h-4 text-gold" />)
                                            : (
                                                <>
                                                    <LucideTrophy className="w-4 h-4 text-gold" />
                                                    <span className="text-[15px] font-semibold text-gold rk-num">×{h.wins}</span>
                                                </>
                                            )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CrewSection>
                )}

                {/* ── 준우승·4강 (우승 못 해도 볼 게 있어야 한다) ────────── */}
                {podiumOnly.length > 0 && (
                    <CrewSection title={t("hallOfFame.podium")}>
                        <div className="rk-card overflow-hidden">
                            {podiumOnly.map((h, i) => (
                                <div
                                    key={`${h.memberId}:${h.gameType}`}
                                    className={cn("flex items-center gap-3 px-4 min-h-12 py-2", i > 0 && "border-t border-surface-line")}
                                >
                                    <BallDot type={h.gameType} size={11} />
                                    <span className="flex-1 min-w-0 truncate text-[15px] font-medium text-ink-1">{h.nickname}</span>
                                    <span className="flex items-center gap-1.5 shrink-0">
                                        {h.runnerUp > 0 && (
                                            <span className="rk-chip bg-brand/10 text-brand text-[12px]">
                                                {t("hallOfFame.runnerUp").replace("{n}", String(h.runnerUp))}
                                            </span>
                                        )}
                                        {h.semi > 0 && (
                                            <span className="rk-chip bg-surface-3 text-ink-2 text-[12px]">
                                                {t("hallOfFame.semi").replace("{n}", String(h.semi))}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CrewSection>
                )}

                {/* ── 역대 대회 ─────────────────────────────────────── */}
                {(data?.history?.length ?? 0) > 0 && (
                    <CrewSection title={t("crewHall.pastTitle")} count={data!.history.length}>
                        <div className="flex flex-col gap-2">
                            {data!.history.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setLocation(`/crew/${id}/tournament?open=${p.id}`)}
                                    className={cn(CREW_CARD, "relative overflow-hidden w-full flex items-center gap-2 pl-5 text-left active:scale-[0.99] transition-transform")}
                                >
                                    {/* 종목을 왼쪽 띠로 — 목록을 훑을 때 색만 보고 갈린다 */}
                                    <span aria-hidden="true" className="absolute left-0 inset-y-0 w-1"
                                        style={{ background: p.gameType === "3c" ? "var(--ball-red)" : "var(--ball-yellow)" }} />
                                    <span className="flex-1 min-w-0">
                                        <span className="block truncate text-[15px] font-semibold text-ink-1">{p.title}</span>
                                        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] font-medium text-ink-3">
                                            <LucideTrophy className="w-3.5 h-3.5 text-gold shrink-0" />
                                            <span className="font-semibold text-ink-2">{p.championName ?? "-"}</span>
                                            <span className="text-ink-4">·</span>
                                            <span>{p.gameType === "3c" ? t("crewTournament.type3c") : t("crewTournament.type4c")}</span>
                                            {p.endedAt && (
                                                <><span className="text-ink-4">·</span><span className="rk-num">{formatKstDate(p.endedAt, locale)}</span></>
                                            )}
                                        </span>
                                    </span>
                                    <LucideChevronRight className="w-4 h-4 text-ink-4 shrink-0" />
                                </button>
                            ))}
                        </div>
                    </CrewSection>
                )}
            </div>
        </div>
    );
}

/** 종목별 왕 — 카드 액센트가 곧 그 종목의 공 색이다. */
function KingCard({ type, honor }: { type: "3c" | "4c"; honor: Honor | null }) {
    const { t } = useT();
    const color = type === "3c" ? "var(--ball-red)" : "var(--ball-yellow)";
    return (
        <div className={cn(CREW_CARD, "relative overflow-hidden")} style={{ borderTop: `3px solid ${color}` }}>
            <div className="flex items-center gap-1.5">
                <BallDot type={type} size={12} />
                <span className={CREW_TEXT.caption}>{type === "3c" ? t("crewTournament.type3c") : t("crewTournament.type4c")}</span>
            </div>
            {honor ? (
                <>
                    <div className="mt-2 truncate text-[17px] font-semibold text-ink-1">{honor.nickname}</div>
                    <div className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-gold rk-num">
                        <LucideTrophy className="w-3.5 h-3.5" />
                        {t("hallOfFame.winCount").replace("{n}", String(honor.wins))}
                    </div>
                </>
            ) : (
                <div className="mt-2 text-[13px] font-medium text-ink-3 leading-snug">{t("hallOfFame.noKing")}</div>
            )}
        </div>
    );
}

/** 라사 위에 놓인 금색 트로피. 우승 의례에만 쓰는 색이라 여기서 제일 크게 쓴다. */
function BigTrophy({ dim = false }: { dim?: boolean }) {
    return (
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
            className={cn("shrink-0", dim ? "text-white/25" : "text-gold")} aria-hidden="true">
            <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
            <path d="M17 5h2.5a2.5 2.5 0 0 1 0 5H17" />
            <path d="M7 5H4.5a2.5 2.5 0 0 0 0 5H7" />
            <path d="M12 14v4" />
            <path d="M8.5 20h7" />
            <path d="M10 18h4l1 2H9l1-2Z" />
        </svg>
    );
}
