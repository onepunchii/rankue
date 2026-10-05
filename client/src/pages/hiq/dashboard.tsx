import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { HiqMember } from "@shared/schema";
import { useSport } from "@/contexts/SportContext";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { AppInstallCard } from "@/components/hiq/AppInstallCard";
import GolfDashboard from "@/golf/pages/Dashboard";

// New Components
import { DashboardHeader } from "@/components/hiq/dashboard/DashboardHeader";
import { RealHandicapCard } from "@/components/hiq/dashboard/RealHandicapCard";
import { RankingListCard } from "@/components/hiq/dashboard/RankingListCard";
import { WorldRankingCard } from "@/components/hiq/umb/WorldRankingCard";
import { PbaRankingCard, PBA_CARD_L } from "@/components/hiq/pba/PbaRankingCard";
import { OngoingGameBanner } from "@/components/hiq/dashboard/OngoingGameBanner";
import { SimMatchBanner } from "@/components/hiq/dashboard/SimMatchBanner";
import { HomeSectionHeader, ScoreboardActions, ExploreActions } from "@/components/hiq/dashboard/QuickActions";
import { OnlineGameCard } from "@/components/hiq/dashboard/OnlineGameCard";
import { LookalikeProCard } from "@/components/hiq/dashboard/LookalikeProCard";
import { HomeGuideDialog, type HomeGuideTopic } from "@/components/hiq/dashboard/HomeGuideDialog";
import { useRankPreview } from "@/components/hiq/dashboard/RankPreview";
import { GameCreationModal } from "@/components/hiq/dashboard/GameCreationModal";
import { PinCodeModal } from "@/components/hiq/dashboard/PinCodeModal";
import { ScoreCorrectionModal } from "@/components/hiq/dashboard/ScoreCorrectionModal";
import { RPGuideModal } from "@/components/hiq/dashboard/RPGuideModal";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useAuth } from "@/hooks/useAuth";
import { GuestJoinCta, useGuestGate } from "@/components/hiq/GuestGate";
import { GUEST_SAMPLE } from "@shared/guestSample";
import { useT } from "@/lib/i18n";

import { useLocation, useSearch } from "wouter";

// 서버 GET /api/hiq/rankings 는 항상 상위 20명만 잘라서 준다(getTopRankings(storeId, 20, type)).
// 응답 길이가 이 값에 닿았다면 뒤에 몇 명이 더 있는지 알 수 없다.
const RANKINGS_API_LIMIT = 20;

function HiqDashboardBilliards() {
    const { t, locale } = useT();
    const [, setLocation] = useLocation();

    // Local State for Ranking Tab
    const [rankingTab, setRankingTab] = useState<'3c' | '4c'>('4c');
    // 랭킹 섹션 소스 — 기본 세계(UMB), 토글로 PBA·매장
    const [rankingSource, setRankingSource] = useState<'world' | 'pba' | 'store'>('world');
    // 랭킹 카드는 3명까지 보이고 펼치면 10명(2026-10-04) — 세 소스가 같은 접힘 상태를 쓴다
    const rankPreview = useRankPreview();
    // 구역 머리 '설명' 창 — 점수판·온라인게임·둘러보기
    const [guide, setGuide] = useState<HomeGuideTopic | null>(null);

    // Use Custom Hook for Data
    const { member, history, rankings, isLoading } = useDashboardStats(rankingTab);

    // Dedicated 3-cushion ranking list, fetched independently of the ranking tab so the
    // header '상위 N%' percentile is computed against the correct 3c population even when
    // the bottom 매장 랭킹 tab is on 4구. Shares the react-query cache with useDashboardStats'
    // rankings query when rankingTab === '3c' (same key + queryFn).
    // 로그인 필수 API 라 비로그인은 부르지 않는다 — 홈을 비로그인에 열면서(2026-10-05) enabled 가 없으면 401 이 재시도까지 두 번 난다.
    const { data: rankings3c } = useQuery<HiqMember[]>({
        queryKey: ["/api/hiq/rankings", "3c"],
        queryFn: async () => await apiRequest("/api/hiq/rankings?type=3c"),
        enabled: !!member,
    });

    // 비로그인 홈(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다 — 랭킹 1위와 내 수지를 비슷하게.
    // 내 기록을 쌓으려 할 때 가입을 유도한다"). 예전엔 비로그인이면 로그인 안내(LoginGate) 한 장으로 끝냈다.
    //  · sample: 비로그인이 **확인된** 때만 예시 인물(shared/guestSample). '내 실전 기록'·점수판의 내 다마·매장 랭킹 세 곳이 같은 사람을 그린다.
    //  · gate.guard: 회원이면 동작을 그대로 실행하고, 비로그인이면 가입 안내 시트를 연다.
    // 회원에게는 sample 이 null 이고 guard 가 그냥 지나가므로 화면도 동작도 예전 그대로다.
    const gate = useGuestGate();
    const sample = gate.isGuest ? GUEST_SAMPLE.billiards : null;

    // UI Logic Helpers (Keep strict UI logic here or move to utils if generic)
    const getPercentile = useCallback((type: '3c' | '4c') => {
        if (!member) return null;

        // Pick a population that matches the requested type, independent of the ranking tab.
        // (3c always uses the dedicated 3c list; 4c only meaningful when the tab is on 4c.)
        const source = type === '3c' ? rankings3c : (rankingTab === '4c' ? rankings : null);
        if (!source) return null;

        // 목록이 상한에 걸렸으면 이건 매장 전체가 아니라 '상위 20명'일 뿐이다.
        // 이걸 모집단으로 쓰면 회원 400명 매장에서도 "상위 50%" 같은 거짓 숫자가 나오므로,
        // 모집단을 확신할 수 없을 땐 백분위를 포기한다(DashboardHeader는 null이면 '분석 중'을 띄운다).
        if (source.length >= RANKINGS_API_LIMIT) return null;

        const field = type === '3c' ? 'rating3c' : 'rating4c';
        const ranked = source
            .filter(r => (r[field] ?? 0) > 0)
            .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0));

        // Match by member id (not score value) so ties / duplicate scores don't mis-rank.
        const myIndex = ranked.findIndex(r => r.id === member.id);
        if (myIndex === -1) return null;

        return Math.max(1, Math.round(((myIndex + 1) / ranked.length) * 100));
    }, [rankings, rankings3c, member, rankingTab]);

    // Modal State Management
    const [modalState, setModalState] = useState({
        game: false,
        join: false,
        score: false,
        rpGuide: false
    });

    const [startGameMode, setStartGameMode] = useState<"practice" | "match">("practice");

    const toggleModal = (key: keyof typeof modalState, value: boolean) => {
        setModalState(prev => ({ ...prev, [key]: value }));
    };

    // 채팅의 매칭 대결 카드에서 방장이 이어받아 들어오는 길:
    // /dashboard?match=<code>&gameType=<3c|4c>&seats=<n>&target=<n>
    // 카드가 들고 있던 핀을 그대로 경기 만들기 화면에 넘긴다(새 핀을 만들면 카드의 코드가 죽는다).
    const search = useSearch();
    const [matchInvite, setMatchInvite] = useState<{ code: string; gameType?: "3c" | "4c"; seats?: number; target?: number } | null>(null);
    const matchParamRef = useRef(false);

    // 온라인게임에서 닫기·나가기로 돌아오면(?sec=game) 당구 게임 구역으로 내려 준다 — 홈이 입구다(2026-10-04 오너: "홈에서 다").
    // 카드가 그려진 뒤에 내려야 해서 한 박자 늦게, 내린 뒤엔 주소를 깨끗이 돌려 둔다(새로고침해도 다시 내려가지 않게).
    useEffect(() => {
        if (!member || isLoading) return;
        const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
        if (p.get("sec") !== "game") return;
        let tries = 0;
        let timer = 0;
        const go = () => {
            const el = document.getElementById("home-game");
            if (!el && ++tries < 20) { timer = window.setTimeout(go, 75); return; }
            el?.scrollIntoView({ block: "start" });
            setLocation("/dashboard", { replace: true });
        };
        timer = window.setTimeout(go, 60);
        return () => window.clearTimeout(timer);
    }, [member, isLoading, search, setLocation]);

    // 점수판의 입구는 전부 이 두 함수를 거친다 — 점수판 카드(경기 시작)·혼자 연습·'내 실전 기록'의 경기 시작·설명 창의 단추, 그리고 PIN 합류.
    // 그래서 비로그인을 막는 자리도 여기 한 곳이다: 빈 생성 창이 뜨거나 PIN 여섯 자리를 다 누른 뒤에야 실패하지 않게 **입구에서** 가입 안내로 잇는다.
    const handleStartGameClick = (mode: "practice" | "match") => {
        gate.guard(() => {
            // 홈 버튼으로 여는 길은 예전 그대로 — 지난 카드의 핀을 물고 들어가지 않게 비운다.
            setMatchInvite(null);
            setStartGameMode(mode);
            toggleModal('game', true);
        }, {
            title: t(mode === "match" ? "guestHome.gateMatchTitle" : "guestHome.gatePracticeTitle"),
            desc: t(mode === "match" ? "guestHome.gateMatchDesc" : "guestHome.gatePracticeDesc"),
            from: "/dashboard",
        });
    };

    const handleJoinGameClick = () => {
        gate.guard(() => toggleModal('join', true), {
            title: t("guestHome.gatePinTitle"),
            desc: t("guestHome.gatePinDesc"),
            from: "/dashboard",
        });
    };

    useEffect(() => {
        // 로그인 전이면 주소를 건드리지 않는다 — 머리의 '로그인'·가입 안내 한 줄이 이 주소로 되돌아온다(goLogin 이 지금 주소를 기억한다).
        if (!member || matchParamRef.current) return;

        const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
        const code = (params.get("match") || "").trim();
        if (!code) return;
        matchParamRef.current = true;

        const rawType = params.get("gameType");
        const seats = Number(params.get("seats"));
        const target = Number(params.get("target"));
        setMatchInvite({
            code,
            gameType: rawType === "3c" || rawType === "4c" ? rawType : undefined,
            seats: Number.isFinite(seats) && seats >= 2 && seats <= 4 ? seats : undefined,
            target: Number.isFinite(target) && target > 0 ? Math.round(target) : undefined,
        });
        setStartGameMode("match");
        toggleModal('game', true);

        // 주소는 바로 지운다. 안 그러면 새로고침·뒤로가기 때마다 이미 시작한 경기의 핀으로 또 열린다.
        setLocation("/dashboard", { replace: true });
    }, [member, search, setLocation]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-surface-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-black/10 border-t-brand rounded-full animate-spin" />
            </div>
        );
    }

    // 비로그인 방문자(검색 유입이 하단 '홈' 탭을 누른 경우)도 여기서 끝내지 않고 아래 홈을 그대로 본다(2026-10-05 오너 결정).
    // 맨 처음엔 null 을 돌려줘 흰 화면이었고(고장으로 보였다), 그다음엔 로그인 안내 한 장이었다 — 무엇을 하는 앱인지 보기도 전에 가입부터 요구했다.
    // 골프에서 온 한국어 방문자의 '내 골프 홈' 안내도 걷었다: 그 사람은 이제 종목이 골프라 맨 아래 HiqDashboard 가 골프 홈을 끼운다.
    // 아래에서 member 는 없을 수 있다(undefined) — 회원의 것은 카드마다 숨기거나 sample 로 그린다.

    // 예시 랭킹 — 지금 탭(3쿠션·4구)의 다섯 줄. 이름은 사전 키로 그린다(다섯 언어). 1위가 예시 인물이고 '내 실전 기록' 예시와 같은 숫자다.
    const sampleRankings = sample
        ? (sample.rankings[rankingTab].map((r) => ({ ...r, name: t(r.nameKey) })) as unknown as HiqMember[])
        : null;

    return (
        <div className="min-h-screen bg-surface-0 px-5 pb-nav">

            {/* Header / Profile */}
            <DashboardHeader member={member} />

            {/* 진행 중 경기 이어하기 — 이탈한 경기로 돌아갈 유일한 입구.
                이게 없어서 앱을 껐다 켜면 경기가 영구히 미완료로 남았다(완주율 33% 실측). */}
            <OngoingGameBanner />
            {/* 시뮬레이터 대전에서 내 차례 — 푸시를 놓쳐도 여기서 돌아간다 */}
            <SimMatchBanner />

            {/* 프로필 완성 넛지 — 가입에서 설정으로 옮긴 선택 정보(성별·출생연도) 채움 유도 */}
            {member && (!(member as any).gender || !(member as any).birthYear) && (
                <button
                    onClick={() => setLocation("/settings")}
                    className="w-full mb-4 px-4 py-3 rounded-tile bg-brand/10 border border-brand/25 flex items-center justify-between text-left active:scale-[0.99] transition-transform"
                >
                    <span className="text-[13px] font-semibold text-brand">{t("dashboard.completeProfile")}</span>
                    <span className="text-[12px] text-brand/70">{t("dashboard.completeProfileCta")}</span>
                </button>
            )}

            {/* 내 실전 기록 — 맨 위(2026-10-04 오너: "3쿠션·4구 RP 카드와 전적 카드는 중복 — 실전 핸디 카드에 통합해 맨 위로").
                머리 아래 기록 띠(랭킹 점수·전적·최근 5경기) + 닮은 프로·비교표. 공식 경기가 없으면 첫 경기 안내. */}
            <RealHandicapCard
                onStartMatch={() => handleStartGameClick("match")}
                onOpenRpGuide={() => toggleModal('rpGuide', true)}
                getPercentile={getPercentile}
                history={history as any}
                onPreview={() => setGuide("scoreboard")}
                sample={sample}
            />
            {/* 예시 카드 바로 아래 가입 안내 한 줄 — 비로그인에게만. 가입하면 지금 보던 홈으로 돌아온다 */}
            {sample && (
                <GuestJoinCta
                    className="mt-3"
                    title={t("guestHome.recordCtaTitle")}
                    desc={t("guestHome.recordCtaDesc")}
                />
            )}

            {/* 홈 구역(2026-10-04 오너: "빠른 실행보다 각 섹션별로 — 점수판 / 당구 게임 / 기타").
                점수판 구역은 입구 셋(점수판·혼자 연습·PIN으로 합류)만 — 기록은 위 카드로 모였다. */}
            <section className="mt-10 mb-10">
                <HomeSectionHeader title={t("home.secScoreboard")} desc={t("home.secScoreboardDesc")} onGuide={() => setGuide("scoreboard")} />
                <ScoreboardActions onStartGame={handleStartGameClick} onJoinGame={handleJoinGameClick} sample={sample} />
            </section>

            {/* 당구 게임(예전 이름 온라인게임) — 혼자 치기 · 같이 치기 · 내 온라인 실력(대전 기록 띠 + 닮은 프로).
                홈이 온라인게임의 입구다(2026-10-04) — 게임·멀티방·랭킹을 닫으면 ?sec=game 으로 이 구역에 돌아온다. */}
            <section id="home-game" className="mb-10 scroll-mt-4">
                <HomeSectionHeader title={t("home.secOnline")} desc={t("home.secOnlineDesc")} onGuide={() => setGuide("online")} />
                <div className="space-y-3">
                    <OnlineGameCard />
                    <LookalikeProCard />
                </div>
            </section>

            {/* 둘러보기 — 매장 찾기·커뮤니티 */}
            <section className="mb-10">
                <HomeSectionHeader title={t("home.secExplore")} desc={t("home.secExploreDesc")} onGuide={() => setGuide("explore")} />
                <ExploreActions />
            </section>

            {/* 랭킹 섹션 — 기본은 UMB 세계랭킹(볼거리·매주 갱신), PBA·매장 랭킹은 토글로.
                매장 데이터가 쌓이면 기본값 재검토 (오너 결정 2026-08-05) */}
            <div className="mb-10">
                <header className="mb-4 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-[19px] font-bold tracking-tight text-ink-1 truncate">
                            {rankingSource === "world" ? t("umb.title")
                                : rankingSource === "pba" ? (PBA_CARD_L[locale] ?? PBA_CARD_L.ko).title
                                    : t("rankingListCard.title")}
                        </h2>
                        <p className="text-black/55 text-[13px] mt-1 font-medium truncate">
                            {/* 예시 랭킹에 '실시간 상위 10명'이라고 쓰면 거짓이다 — 비로그인에겐 가입하면 보이는 것을 적는다 */}
                            {rankingSource === "world" ? t("umb.subtitle")
                                : rankingSource === "pba" ? (PBA_CARD_L[locale] ?? PBA_CARD_L.ko).subtitle
                                    : sample ? t("guestHome.rankSubtitle") : t("rankingListCard.subtitle")}
                        </p>
                    </div>
                    <div className="flex bg-brand/[0.08] p-1 rounded-full relative h-9 shrink-0">
                        <div
                            className="absolute top-1 bottom-1 rounded-full bg-brand transition-all duration-300 ease-out z-0 shadow-[0_1px_3px_rgba(0,98,65,0.25)]"
                            style={{
                                width: "calc((100% - 8px) / 3)",
                                left: `calc(4px + ${["world", "pba", "store"].indexOf(rankingSource)} * (100% - 8px) / 3)`,
                            }}
                        />
                        {([
                            ["world", t("umb.sourceWorld")],
                            ["pba", "PBA"],
                            ["store", t("umb.sourceStore")],
                        ] as const).map(([src, label]) => (
                            <button
                                key={src}
                                onClick={() => setRankingSource(src)}
                                className={`px-3 rounded-full text-[13px] font-bold relative z-10 transition-colors ${rankingSource === src ? "text-white" : "text-brand/60"}`}
                            >{label}</button>
                        ))}
                    </div>
                </header>

                {rankingSource === "world" ? (
                    <WorldRankingCard preview={rankPreview} />
                ) : rankingSource === "pba" ? (
                    <PbaRankingCard preview={rankPreview} />
                ) : (
                    <>
                        {/* 매장 랭킹은 회원의 것(로그인 필수) — 비로그인은 예시 다섯 줄을 "예시" 표시와 함께 본다 */}
                        <RankingListCard
                            rankings={sampleRankings ?? rankings}
                            activeTab={rankingTab}
                            onTabChange={setRankingTab}
                            currentMemberId={sample ? sample.member.id : member?.id ?? ""}
                            hideHeader
                            preview={rankPreview}
                            sample={!!sample}
                        />
                        {/* 매장 랭킹이 비어 있는 초기엔 이 링크가 매장 탭의 실질 콘텐츠다 */}
                        <button
                            onClick={() => setLocation("/stores")}
                            className="mt-3 w-full h-12 rounded-2xl bg-white text-[14px] font-semibold text-brand shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:scale-[0.99] transition-transform"
                        >
                            {({ ko: "전국 당구장 1,197곳 찾아보기", en: "Browse 1,197 billiards halls", vi: "Xem 1.197 quán bi-a", tr: "1.197 bilardo salonuna göz at", es: "Explorar 1.197 salones" } as Record<string, string>)[locale] ?? "Browse billiards halls"} →
                        </button>
                    </>
                )}
            </div>

            {/* 앱 설치 카드 — 오너 지정 자리(세계랭킹 아래). 앱/PWA 안이면 스스로 안 그린다. */}
            <AppInstallCard className="mt-6" />

            {/* Modals */}
            <GameCreationModal
                open={modalState.game}
                onOpenChange={(v) => {
                    toggleModal('game', v);
                    // 닫으면 이어받은 핀도 놓는다 — 다음에 홈 버튼으로 열 때 죽은 코드를 물고 있으면 안 된다.
                    if (!v) setMatchInvite(null);
                }}
                member={member}
                history={history}
                initialMode={startGameMode}
                initialCode={matchInvite?.code}
                initialGameType={matchInvite?.gameType}
                initialSeats={matchInvite?.seats}
                initialTarget={matchInvite?.target}
            />

            <HomeGuideDialog
                topic={guide}
                onClose={() => setGuide(null)}
                onStartGame={handleStartGameClick}
                onJoinGame={handleJoinGameClick}
            />

            <PinCodeModal
                open={modalState.join}
                onOpenChange={(v) => toggleModal('join', v)}
            />

            {/* 회원 행이 있어야 그리는 창 — 비로그인에겐 여는 길도 없다 */}
            {member && (
                <ScoreCorrectionModal
                    open={modalState.score}
                    onOpenChange={(v) => toggleModal('score', v)}
                    member={member}
                />
            )}

            <RPGuideModal
                open={modalState.rpGuide}
                onOpenChange={(v) => toggleModal('rpGuide', v)}
            />

            {/* 가입 안내 시트 — 점수판 입구의 guard 가 여는 것. 한 번만 그린다 */}
            {gate.sheet}

            <HiqNavigation />
        </div>
    );
}

/**
 * 홈 진입 — 종목에 따라 통째로 다른 화면을 마운트한다.
 * 예전엔 당구 대시보드 **안에서** 훅을 부르기 전에 골프로 return 했다. 그러면 골프↔당구를 오갈 때
 * 훅 개수가 달라져 React 가 화면을 통째로 떨어뜨렸다(2026-09-09 검토에서 확인).
 * 두 화면을 형제로 두면 그런 일이 없다 — 애초에 서로 다른 플랫폼이라 섞을 이유도 없다.
 */
export default function HiqDashboard() {
    const { currentSport } = useSport();
    const { isLoading } = useAuth();
    // 로그인 확인 중의 골프 홈(2026-10-05) — 한국어 화면은 확인을 기다리지 않고 저장된 종목(골프)으로 시작한다(useGolfVisible).
    // 골프 홈에는 '확인 중' 모습이 없어서 그대로 끼우면 빈 숫자(0.0)를 먼저 그렸다가 예시(방문자)나 내 기록(회원)으로 바뀐다 — 그동안은 돌림표만.
    // 종목이 이미 골프라 토큰이 검정 바탕·라임으로 풀린다. '나'가 저장돼 있는 회원은 확인 중이 없어 예전처럼 곧장 골프 홈이다.
    if (currentSport === "GOLF" && isLoading) {
        return (
            <div className="min-h-screen bg-surface-0 flex items-center justify-center" aria-busy="true">
                <div className="w-8 h-8 border-2 border-surface-line border-t-brand rounded-full animate-spin" />
            </div>
        );
    }
    return currentSport === "GOLF" ? <GolfDashboard /> : <HiqDashboardBilliards />;
}
