/**
 * 홈 맨 위 "내 실전 기록"(2026-09-27 "내 실전 핸디" 오너 승인 시안 → 콤팩트 개편 →
 * 2026-10-04 오너: "3쿠션·4구 RP 카드와 전적 카드가 중복 — 이 카드가 마음에 드니 디자인을 최대한 살려 통합, 맨 위로").
 * 머리 바로 아래 기록 띠(RecordStrip) 세 칸 — 랭킹 점수(상위 %, ?는 RP 안내) · 전적(승률) · 최근 5경기. 3쿠션·4구 탭을 따른다.
 * 그 아래는 예전 그대로.
 * 실전 매칭 대결 기록만 — 3쿠션은 닮은 프로·재미 등급·사다리 + 비교표(나 | 닮은 프로 | 다음 핸디),
 * 4구는 프로 기록이 없어 랭큐 회원 순위 + 비교표(나 | 같은 핸디 회원 평균 | 다음 핸디). 버튼 [매칭 대결][프로][공유].
 * '다음 핸디까지'는 핸디를 매기는 기준(최근 공식 10경기 평균, shared/realHandicap)으로 센다 — 실제로 오르는 값과 맞게.
 * 온라인 에버는 한 줄 비교로만 보인다(계산에 섞지 않는다). 공식 경기 5판 전에는 진행 막대.
 *
 * 비로그인(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다" — "랭킹 1위와 내 수지를 비슷하게").
 * 예전엔 로그인 전이면 통째로 사라졌다. 이제 홈이 예시 인물(shared/guestSample)을 sample 로 넘기면 **같은 카드 모양**을 그 숫자로 그리고
 * 제목 옆에 "예시" 표시를 단다. 전적·최근 5경기 칸은 눌리지 않고(/history 는 내 기록 화면이다)
 * 공유 단추는 뺀다(예시 숫자가 내 기록인 것처럼 밖으로 나가면 안 된다). '경기 시작'은 홈의 문(guard)이 가입 안내로 잇는다.
 * 회원에게는 sample 이 없어 아무것도 달라지지 않는다.
 *
 * 예시 카드의 프로와 '나' 얼굴(2026-10-06 오너 결정: "실제 '나'를 우리 로고로 사용하고 프로도 실존 인물로 해줘. 그래야 실감나지").
 *  - 규칙: **예시 자료(GUEST_SAMPLE)에는 실제 선수를 넣지 않는다. 프로는 화면이 공개 API 로 그때 불러온다.**
 *    예시 인물의 3쿠션 에버리지로 GET /api/hiq/compare/avg(로그인 불필요 — 선수 페이지 '나와 비교하기'와 같은 쿼리·캐시)를 불러
 *    닮은 프로(pros[0])·재미 등급(tier·pos)·랭큐 회원 분포에서의 자리(members)를 3쿠션 칸에 덧씌운다 → 회원과 같은 프로 갈래가 그려진다.
 *    members 도 응답 것을 쓴다 — 예시 자료의 members 는 예시 다섯 명 안 순위라 '랭큐 회원 상위 n%' 칩에 넣으면 지어낸 통계가 된다.
 *  - 받는 동안·실패했을 때(오프라인 등)·4구 탭은 예전의 '회원끼리' 예시 갈래 그대로다 — 그 갈래의 4구 전용 문구 둘(순위 이름·아래 한 줄)은 예시용 문구.
 *    옛 본문(CDN 캐시)에는 tier·pos 가 없다 — 그때는 등급 칩·사다리 없이 프로와 비교표만 그린다.
 *  - 프로 갈래에서도 예시는: 공유 단추 없음, 온라인 에버 줄 없음(로그아웃 뒤 캐시에 남은 이전 회원 값이 섞이지 않게),
 *    "내 숫자는 예시예요. 프로 기록은 실제입니다…" 한 줄. 프로 페이지로 가는 단추는 둔다(공개 페이지).
 *  - '나' 얼굴은 글자 대신 랭큐 로고(/icon-192.png, 금색 테 유지). 회원은 그대로 MeAvatar.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { shareImage } from "@/lib/shareImage";
import { LucidePlay } from "@/lib/icons";
import { proRatio, type CompareAvgResponse, type LookalikeResponse, type RealCompareResponse, type RealSide } from "@shared/proCompare";
import { drawCompareCard } from "@/components/hiq/compare/compareCard";
import { SampleBadge } from "@/components/hiq/GuestGate";
import { CrewAvatar } from "@/components/hiq/crew-ui";
import type { GuestSampleBilliards } from "@shared/guestSample";
import { BadgeAvatar, CardActions, CompareTable, FormDots, GOLD_TEXT, MeAvatar, NeedMore, NextCell, ProAvatar, ProTwinHeader, RecordStrip, RecordValue, fill, gapText, proName } from "@/components/hiq/compare/lookalikeUi";

type HistoryRow = { sportCategory?: string | null; gameMode?: string | null; isRanked?: boolean | null; gameType?: string | null; isWinner?: boolean | null };

export function RealHandicapCard({ onStartMatch, onOpenRpGuide, getPercentile, history, onPreview, sample }: {
    onStartMatch: () => void;
    /** 랭킹 점수 칸 — RP 안내 창 */
    onOpenRpGuide?: () => void;
    /** 상위 % (홈이 랭킹 목록으로 계산) */
    getPercentile?: (type: "3c" | "4c") => number | null;
    /** 내 경기 기록(최신순) — 전적·최근 5경기 */
    history?: HistoryRow[];
    /** 공식 경기가 하나도 없을 때 '점수판 미리 보기' */
    onPreview?: () => void;
    /** 비로그인 홈의 예시 인물 — 넘기면 내 기록 대신 이 숫자로 같은 카드를 그리고 "예시" 표시를 단다. 회원이면 넘기지 않는다 */
    sample?: GuestSampleBilliards | null;
}) {
    const { t, locale } = useT();
    const { member } = useAuth();
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [sharing, setSharing] = useState(false);
    const q = useQuery<RealCompareResponse>({ queryKey: ["/api/hiq/compare/real"], enabled: !!member, staleTime: 60_000, retry: false });
    // 온라인 에버 한 줄 — 온라인 카드와 같은 쿼리(캐시를 같이 쓴다)
    const online = useQuery<LookalikeResponse>({ queryKey: ["/api/hiq/sim/lookalike"], enabled: !!member, staleTime: 60_000, retry: false });
    const [tab, setTab] = useState<"3c" | "4c" | null>(null);
    // 예시일 땐 서버 응답·회원 행·경기 기록 자리에 예시 값을 넣는다 — 아래 그리는 코드는 회원과 같은 길을 탄다.
    // (비로그인은 위 두 쿼리가 꺼져 있다. 캐시에 남은 옛 답이 있어도 예시가 먼저다)
    const data = sample ? sample.real : q.data;
    const me = sample ? sample.member : member;
    const games: HistoryRow[] | undefined = sample ? sample.history : history;
    // 예시 카드의 닮은 프로(2026-10-06 오너: "프로도 실존 인물로") — 예시 자료에는 실제 선수가 없으니, 예시 인물의 3쿠션 에버리지로
    // 공개 API 를 그때 부른다. 선수 페이지 '나와 비교하기'(ProCompareCard)와 같은 키라 캐시를 같이 쓴다(서버가 소수 둘째 자리로 자른다).
    // 예시일 때만 켠다 — 회원은 /compare/real 이 자기 기록으로 같은 값을 준다. 실패하면 '회원끼리' 갈래로 남으면 되니 다시 묻지 않는다.
    const sampleAvg3c = sample?.real["3c"].avg ?? null;
    const twin = useQuery<CompareAvgResponse>({
        queryKey: [`/api/hiq/compare/avg?avg=${(sampleAvg3c ?? 0).toFixed(2)}`],
        enabled: !!sample && sampleAvg3c != null,
        staleTime: 10 * 60_000,
        retry: false,
    });
    useEffect(() => { if (data && tab === null) setTab(data.preferred); }, [data, tab]);
    // 로그인 확인 중이거나, 예시도 회원도 없을 때만 비운다 — 비로그인 홈은 sample 을 넘기므로 카드가 사라지지 않는다
    if (!me) return null;
    const cur: "3c" | "4c" = tab ?? data?.preferred ?? "3c";

    // 기록 띠 — 고른 종목의 공식(랭크) 매칭만. history 는 최신순.
    const mine = (Array.isArray(games) ? games : []).filter((g) => g.sportCategory === "BILLIARDS" && g.gameMode === "match" && g.isRanked && g.gameType === cur);
    const wins = mine.filter((g) => g.isWinner).length;
    const losses = mine.length - wins;
    const rating = (cur === "3c" ? (me as any).rating3c : (me as any).rating4c) ?? 0;
    // 예시의 상위 % 는 예시 랭킹 다섯 줄 안에서 센 값이다(진짜 회원 통계가 아니다 — 이 카드의 "예시" 표시 아래에서만 쓴다)
    const pct = sample ? sample.percentile[cur] : getPercentile?.(cur) ?? null;
    // 전적·최근 5경기 칸은 내 기록 화면으로 간다 — 예시에서는 누를 곳이 아니다(눌러서 로그인 안내에 떨어지지 않게)
    const openHistory = sample ? undefined : () => setLocation("/history");
    const strip = (
        <RecordStrip cells={[
            {
                label: t("real.stripRp"),
                value: <>{rating}<span className="ml-0.5 text-[11px] font-bold text-brand">RP</span></>,
                // 상위 % 는 홈 랭킹 목록으로 셀 수 있을 때만(모집단을 모르면 비운다 — 예전 헤더의 '분석 중' 은 대부분 영원히 그대로였다)
                sub: pct ? fill(t("real.stripTop"), { n: pct }) : undefined,
                subTone: "brand",
                onClick: onOpenRpGuide,
                hint: !!onOpenRpGuide,
            },
            {
                label: t("performanceCard.title"),
                value: <RecordValue template={t("real.stripRecord")} w={wins} l={losses} />,
                sub: mine.length ? fill(t("real.stripRate"), { n: Math.round((wins / mine.length) * 100) }) : t("real.stripNone"),
                onClick: openHistory,
            },
            {
                label: t("performanceCard.recentFive"),
                value: <FormDots results={mine.slice(0, 5).map((g) => (g.isWinner ? "W" : "L"))} />,
                onClick: openHistory,
            },
        ]} />
    );

    const tabs = (
        <div className="inline-flex p-[3px] rounded-full bg-surface-3 shrink-0" role="tablist">
            {(["3c", "4c"] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={cur === k} onClick={() => setTab(k)}
                    className={cn("h-7 px-3 rounded-full text-[12.5px] font-bold transition-colors", cur === k ? "bg-surface-1 text-ink-1 shadow-sm" : "text-ink-3")}>
                    {k === "3c" ? t("real.tab3c") : t("real.tab4c")}
                </button>
            ))}
        </div>
    );
    const title = <h3 className="text-[14.5px] font-bold text-ink-1 truncate">🎱 {t("real.titleRecord")}</h3>;
    const head = (
        <>
            {/* 예시 숫자는 진짜처럼 보이면 안 된다 — 제목 바로 옆에 "예시" 표시(회원은 제목만, 예전 그대로).
                제목이 긴 언어(영어·스페인어)에서는 표시 때문에 제목이 잘리지 않게 탭이 아래 줄로 내려간다(flex-wrap — 예시일 때만). */}
            <div className={cn("flex items-center justify-between gap-2", sample && "flex-wrap")}>
                {sample ? <div className="flex items-center gap-1.5 min-w-0">{title}<SampleBadge /></div> : title}
                {tabs}
            </div>
            {strip}
        </>
    );

    // 실전 비교(닮은 프로·비교표)는 따로 불러온다 — 그동안 머리·기록 띠는 먼저 보이고 아래만 자리를 잡아 둔다
    if (!data) {
        return (
            <section className="rk-card rounded-3xl p-4">
                {head}
                {!q.isError && <div className="mt-3 h-[208px] rounded-tile bg-surface-3 animate-pulse" aria-hidden="true" />}
            </section>
        );
    }
    // 예시의 3쿠션 칸에 실제 프로를 덧씌운다 — 공개 API 가 답했을 때만. 그러면 아래 프로 갈래가 회원과 같은 코드로 그린다.
    // members 는 응답 것(실제 랭큐 회원 분포에서 이 에버리지의 자리)으로 바꾼다 — 예시 자료의 members 는 예시 다섯 명 안 순위다.
    // tier·pos 는 옛 본문(CDN 캐시)에 없을 수 있다 → null 이면 ProTwinHeader 가 등급 칩·사다리를 그리지 않는다.
    // 회원(sample 없음)은 twin 을 읽지 않는다 — 꺼진 쿼리라도 선수 페이지에서 받아 둔 같은 키의 캐시가 있을 수 있다.
    const twinRes = sample && cur === "3c" ? twin.data ?? null : null;
    // 닮은 프로 = 에버리지가 가장 가까운 한 명(pros[0], 회원용 /real 과 같은 고르는 법). 모양이 어긋난 답이면 쓰지 않는다(아래에서 toFixed 를 부른다)
    const twinFirst = twinRes && Array.isArray(twinRes.pros) ? twinRes.pros[0] ?? null : null;
    const twinPro = twinFirst && twinFirst.memCode && typeof twinFirst.average === "number" ? twinFirst : null;
    const d: RealSide = twinRes && twinPro
        ? { ...data[cur], pro: twinPro, tier: twinRes.tier ?? null, pos: twinRes.pos ?? null, members: twinRes.members ?? null }
        : data[cur];
    // 받는 동안만 — 프로 갈래로 바뀔 때 카드가 한꺼번에 길어지지 않게 그 차이만큼 자리를 잡아 둔다(아래 '회원끼리' 갈래에서 쓴다)
    const twinLoading = !!sample && cur === "3c" && twin.isLoading;

    const matchAction = { label: t("real.match"), icon: LucidePlay, onClick: onStartMatch };

    if (!d.ready || d.avg == null) {
        return (
            <section className="rk-card rounded-3xl p-4">
                {head}
                <NeedMore
                    title={fill(t("real.needTitle"), { n: d.needed })}
                    sub={fill(t("real.needSub"), { m: Math.min(d.games, d.needed), left: Math.max(1, d.needed - d.games) })}
                    pct={(d.games / d.needed) * 100}
                    action={matchAction}
                />
                {mine.length === 0 && onPreview && (
                    <button type="button" onClick={onPreview} className="w-full mt-2 h-9 rounded-full text-[13px] font-semibold text-ink-2 hover:bg-surface-3 transition-colors">
                        {t("home.firstGamePreview")} →
                    </button>
                )}
            </section>
        );
    }

    const next = d.nextHandi;
    const nextCol = next ? fill(t("real.nextHandi"), { n: next.handi }) : t("real.topHandi");
    // 다음 칸 얼굴 — 사람이 아니라 핸디라서 숫자 동그라미(최고 핸디면 트로피)
    const nextColFace = { label: next ? fill(t("real.nextHandi"), { n: "" }).trim() : nextCol, tone: "next" as const, avatar: <BadgeAvatar next>{next ? next.handi : "🏆"}</BadgeAvatar> };
    // 비교표 '나' 칸의 얼굴. 예시일 땐 MeAvatar 를 쓰지 않는다 — MeAvatar 는 로그인한 회원의 사진·이름만 보고, 없으면 한글 "나"를 그대로 적는다
    // (예전엔 비로그인이면 이 카드가 통째로 없어 닿지 않던 길이다). 영어·스페인어·터키어·베트남어 방문자에게 칸 이름은 Me 인데 얼굴만 한글이 됐다.
    // 2026-10-06 오너: "실제 '나'를 우리 로고로 사용" — 예시는 글자 대신 랭큐 로고(앱 아이콘 /icon-192.png)를 같은 금테 동그라미로 그린다.
    // 언어와 상관없는 그림이라 다섯 언어가 같은 얼굴이다(칸 이름은 그대로 compare.me). 회원은 그대로 MeAvatar.
    const meFace = sample
        ? <CrewAvatar src="/icon-192.png" name={t("compare.me")} size={34} className="ring-2 ring-[#F5B721] ring-offset-2 ring-offset-surface-1" />
        : <MeAvatar />;
    const share = async () => {
        if (sharing) return;
        setSharing(true);
        try {
            const other = d.type === "3c" && d.pro ? proName(d.pro, locale) : t("real.peersAvg");
            const ratio = d.type === "3c" && d.pro ? proRatio(d.avg!, d.pro.average) : null;
            const blob = await drawCompareCard({
                title: d.type === "3c" && d.pro ? fill(t("compare.cardTitle"), { name: other }) : t("real.cardTitle4c"),
                meLabel: t("compare.me"), proLabel: other,
                heroValue: ratio != null ? `${ratio}%` : d.members ? fill(t("compare.topPct"), { n: d.members.topPct }) : `${d.handi}`,
                heroLabel: ratio != null ? fill(t("compare.ofPro"), { name: other }) : t("compare.amongMembers"),
                sub: [fill(t("real.handiLine"), { n: d.handi ?? "-" }), next ? fill(t("real.nextLine"), { n: next.handi, gap: gapText(next.gap) }) : ""].filter(Boolean).join(" · "),
                rows: [
                    { label: t("lookalike.rowAvg"), me: d.avg, pro: d.type === "3c" ? d.pro?.average ?? null : d.peers?.avg ?? null, fmt: (v) => v.toFixed(3) },
                    { label: t("lookalike.rowHighRun"), me: d.highRun, pro: d.type === "3c" ? d.pro?.highRun ?? null : d.peers?.highRun != null ? Math.round(d.peers.highRun) : null, fmt: (v) => String(v) },
                ],
                footer: t("compare.cardFooter"),
            });
            const outcome = await shareImage({ blob, filename: "rankue-handicap.png", title: t("real.title"), text: `${t("real.title")} · https://www.rankue.co.kr` });
            if (outcome === "downloaded") toast({ title: t("playerCard.saved") });
            else if (outcome === "failed") toast({ title: t("playerCard.failed"), variant: "destructive" });
        } catch {
            toast({ title: t("playerCard.failed"), variant: "destructive" });
        } finally { setSharing(false); }
    };

    // 온라인 에버는 회원의 것 — 예시에서는 읽지 않는다(쿼리는 꺼져 있어도, 로그아웃 뒤 캐시에 남은 이전 회원의 값이 예시 카드에 찍히면 안 된다)
    const foot = (
        <p className="text-[11.5px] text-ink-4 mt-2 rk-num">
            {[
                !sample && online.data?.ready && online.data.avg != null && d.type === "3c" ? fill(t("real.onlineAvg"), { v: online.data.avg.toFixed(2) }) : "",
                fill(t("real.games"), { n: d.games }),
                t("real.handiNote"),
            ].filter(Boolean).join(" · ")}
        </p>
    );

    if (d.type === "3c" && d.pro) {
        const pro = d.pro;
        const openPro = () => setLocation(`/pba-player/${encodeURIComponent(pro.memCode)}`);
        return (
            <section className="rk-card rounded-3xl p-4">
                {head}
                <ProTwinHeader
                    pro={pro} tier={d.tier} pos={d.pos} onOpen={openPro}
                    extra={d.members ? <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold bg-surface-1 text-ink-2 rk-num">{fill(t("compare.topPctLong"), { n: d.members.topPct })}</span> : null}
                />
                <CompareTable
                    cols={[{ label: t("compare.me"), tone: "me", avatar: meFace }, { label: proName(pro, locale), avatar: <ProAvatar pro={pro} /> }, nextColFace]}
                    rows={[
                        { label: t("lookalike.rowAvg"), cells: [d.avg.toFixed(2), pro.average.toFixed(2), next ? <NextCell value={next.avg.toFixed(2)} gap={next.gap} /> : "🏆"] },
                        { label: t("lookalike.rowHighRun"), cells: [d.highRun ?? "—", pro.highRun ?? "—", "—"] },
                        { label: t("lookalike.rowHandi"), cells: [d.handi ?? "—", "—", next ? next.handi : "—"] },
                    ]}
                />
                {foot}
                {/* 예시 카드에 실제 선수가 섞인다 — 어느 숫자가 예시이고 어느 것이 실제인지 한 줄로 갈라 준다(나 = 예시, 프로 = 실제 기록) */}
                {sample && <p className="text-[12px] text-ink-3 mt-1">{t("guestHome.sampleProNote")}</p>}
                {/* 예시는 공유하지 않는다 — 예시 숫자가 '프로와 견준 내 실전 핸디' 그림으로 밖에 나가면 안 된다. 프로 단추는 공개 선수 페이지라 둔다 */}
                <CardActions primary={matchAction} onPro={openPro} onShare={sample ? undefined : () => void share()} sharing={sharing} />
            </section>
        );
    }

    // 4구 — 랭큐 회원끼리. 예시의 3쿠션도 프로를 받는 동안·못 받았을 때는 이 갈래다
    const m = d.members;
    return (
        <section className="rk-card rounded-3xl p-4">
            {head}
            <div className="mt-3 flex items-center gap-3 rounded-tile bg-brand/[0.05] p-3">
                <span className={cn("w-12 h-12 shrink-0 rounded-xl bg-[#F5B721]/20 flex flex-col items-center justify-center rk-num", GOLD_TEXT)}>
                    <b className="text-[15px] leading-none">{m ? `${m.topPct}%` : "—"}</b>
                    <span className="text-[9.5px] font-bold mt-0.5">{t("real.topWord")}</span>
                </span>
                <span className="flex-1 min-w-0">
                    {/* 예시의 순위는 예시 랭킹 다섯 줄 안에서 센 값 — '랭큐 회원 4구 순위'라고 쓰면 진짜 회원 통계로 읽힌다 */}
                    <span className="block text-[11.5px] font-semibold text-ink-3">{t(sample ? "guestHome.sampleRank" : "real.rank4c")}</span>
                    <span className="block text-[15px] font-bold rk-num truncate">{m ? fill(t("real.rankLine"), { total: m.total.toLocaleString(), rank: m.rank.toLocaleString() }) : "—"}</span>
                </span>
            </div>
            {/* 예시의 닮은 프로를 받는 동안만: 프로 머리(사진·등급 칩·사다리)가 이 상자보다 긴 만큼 자리를 잡아 둔다 — 답이 오면 아래 표·단추가 덜 밀린다 */}
            {twinLoading && <div className="mt-2 h-20 rounded-tile bg-surface-3 animate-pulse" aria-hidden="true" />}
            <CompareTable
                cols={[{ label: t("compare.me"), tone: "me", avatar: meFace }, { label: t("real.peersAvg"), avatar: <BadgeAvatar>{d.handi ?? "–"}</BadgeAvatar> }, nextColFace]}
                rows={[
                    { label: t("lookalike.rowAvg"), cells: [d.avg.toFixed(2), d.peers?.avg != null ? d.peers.avg.toFixed(2) : "—", next ? <NextCell value={next.avg.toFixed(2)} gap={next.gap} /> : "🏆"] },
                    { label: t("lookalike.rowHighRun"), cells: [d.highRun ?? "—", d.peers?.highRun != null ? Math.round(d.peers.highRun) : "—", "—"] },
                    { label: t("lookalike.rowHandi"), cells: [d.handi ?? "—", d.peers ? fill(t("real.peersCount"), { h: d.handi ?? "-", n: d.peers.count }) : "—", next ? next.handi : "—"] },
                ]}
            />
            <p className="text-[11.5px] text-ink-4 mt-2">{t(sample ? "guestHome.sampleNote" : "real.note4c")}</p>
            {/* 예시는 공유하지 않는다 — 예시 숫자가 내 실전 핸디 그림으로 밖에 나가면 안 된다 */}
            <CardActions primary={matchAction} onShare={sample ? undefined : () => void share()} sharing={sharing} />
        </section>
    );
}
