/**
 * 홈 당구 게임 구역의 "내 온라인 실력"(2026-09-27, 오너 승인 시안 → 같은 날 콤팩트 개편:
 * "닮은 프로·등급·사다리는 살리고 디자인 업, 나머지는 표·버튼으로").
 * 온라인 3쿠션 최근 10판 에버리지(핸디 계산과 같은 값)로 에버리지가 가장 가까운 PBA·LPBA 선수, 재미 등급·사다리,
 * 비교표(나 | 닮은 프로 | 다음 목표 프로 — 에버·하이런·핸디)와 [한 판 하기][프로][공유]. 3판 전에는 진행 막대.
 * 온라인 물리와 실제 테이블은 다르다 — 카드에 '재미로 보세요'를 늘 적는다. 로그인 전에는 그리지 않는다.
 *
 * 2026-10-04 오너: "내 대전 기록도 이 카드 디자인을 살려 통합" → "3구·4구 토글로 보기 편하게" → "온라인게임 페이지로 안 가고 홈에서 다".
 *  - 머리에 3쿠션 | 4구 탭(실전 카드와 같은 모양). 기본은 대전을 더 많이 둔 종목.
 *  - 기록 띠: 대전 전적 · 랭킹(몇 명 중) · 내 다마수(온라인 핸디 — 예전엔 온라인게임 입구에만 있던 카드). → 2026-10-12 내 다마수만 남김(아래).
 *  - 3쿠션: 닮은 프로·비교표 그대로. 4구: 프로 기록이 없어 기록 띠 + 한 판 하기만.
 *  - '한 판 하기'는 멀티방으로(닮은 프로는 온라인 대전 기록으로 매긴다). 입구 화면은 거치지 않는다.
 *
 * 2026-10-12: 대전 전적 · 랭킹 칸은 구역 맨 위의 온라인 대전 배너(OnlineHubBanner)가 가져갔다 — 같은 숫자를 한 화면에 두 번 적지 않는다.
 * 이 카드에는 **내 다마수** 한 줄과 닮은 프로가 남는다. 여기의 '재미 등급'(아마추어 ~ PBA 톱10급)은 글자로만 둔다 —
 * 등급 배지 그림은 온라인 대전 등급(아이언 ~ 마스터)에만 쓴다(둘이 나란히 그림이면 헷갈린다).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { shareImage } from "@/lib/shareImage";
import { GameController } from "@/lib/icons";
import { proRatio, type LookalikeResponse } from "@shared/proCompare";
import { drawCompareCard } from "@/components/hiq/compare/compareCard";
import { BadgeAvatar, CardActions, CompareTable, MeAvatar, NeedMore, NextCell, ProAvatar, ProTwinHeader, fill, proName } from "@/components/hiq/compare/lookalikeUi";
import { useOnlineRecord } from "@/sim/entry/useOnlineRecord";
import { HANDICAP_QUERY_KEY } from "@/sim/entry/HandicapCard";
import { OnlineDamaBadge } from "@/sim/entry/OnlineDamaBadge";
import { BadgeTap } from "@/components/hiq/BadgeGuideSheet";
import { matchApi } from "@/sim/matchApi";

export function LookalikeProCard() {
    const { t, locale } = useT();
    const { member } = useAuth();
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [sharing, setSharing] = useState(false);
    const [tab, setTab] = useState<"3c" | "4c" | null>(null);
    const q = useQuery<LookalikeResponse>({ queryKey: ["/api/hiq/sim/lookalike"], enabled: !!member, staleTime: 60_000, retry: false });
    // 종목별 판 수 — 기본 탭(많이 둔 종목)을 정한다. 전적 · 순위는 위의 배너가 그린다. 내 다마수는 진입 화면 '내 다마수' 카드와 같은 캐시.
    const { boards } = useOnlineRecord();
    const hc = useQuery({ queryKey: HANDICAP_QUERY_KEY, queryFn: () => matchApi.getMyHandicap(), enabled: !!member, staleTime: 60_000 });
    const d = q.data;
    if (!member) return null;

    const boardOf = (g: "3c" | "4c") => boards.find((b) => b.gameType === g);
    const cur: "3c" | "4c" = tab ?? ((boardOf("4c")?.matches ?? 0) > (boardOf("3c")?.matches ?? 0) ? "4c" : "3c");
    const handi = (Array.isArray(hc.data?.boards) ? hc.data!.boards : []).find((b) => b.gameType === cur);

    // 한 판 하기 = 멀티방(닮은 프로는 온라인 대전 기록으로 매긴다).
    const play = () => setLocation("/online-game?rooms=1");
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
    // 내 다마수(온라인 핸디) 한 줄 — 예전 기록 띠의 세 칸 가운데 이것만 남았다(전적 · 랭킹은 배너로).
    // 2026-10-12 오너: "이것도 배지로" — 숫자를 온라인 다마 배지(육각 초록 판) 가운데에 얹는다. 실전의 다마 메달과는 다른 그림이다(눈금이 다르다 — sim/entry/OnlineDamaBadge).
    const strip = (
        <div className="mt-3 rounded-tile border border-surface-line px-3 py-2 flex items-center gap-3" data-testid="online-handi">
            {/* 누르면 배지 안내(온라인 쪽) */}
            <BadgeTap guide={{ kind: "online", dama: handi?.target ?? null }}>
                <OnlineDamaBadge
                    target={handi?.target ?? null} size={46}
                    label={handi ? `${t("sim.entry.handicapTitle")} ${handi.target}${t("sim.entry.handicapUnit")}` : undefined}
                />
            </BadgeTap>
            <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-bold text-ink-1 truncate">
                    {t("sim.entry.handicapTitle")}
                    {handi && <span className="ml-1.5 rk-num text-ink-3 font-semibold">{handi.target}{t("sim.entry.handicapUnit")}</span>}
                </span>
                <span className="block mt-0.5 text-[11.5px] font-semibold text-ink-4 rk-num truncate">
                    {handi?.fromRecord ? fill(t("home.handiAvgShort"), { avg: handi.avg.toFixed(3) }) : t("home.handiDefault")}
                </span>
            </span>
        </div>
    );
    const head = (
        <>
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-[14.5px] font-bold text-ink-1 truncate">🎮 {t("lookalike.titleShort")}</h3>
                {tabs}
            </div>
            {strip}
        </>
    );

    // 닮은 프로를 불러오는 중이거나 실패해도 머리·내 다마수 줄은 보인다 — 아래만 자리를 잡아 둔다(2026-10-04 리뷰)
    if (!d && cur === "3c") {
        return (
            <section className="rk-card rounded-3xl p-4">
                {head}
                {!q.isError && <div className="mt-3 h-[208px] rounded-tile bg-surface-3 animate-pulse" aria-hidden="true" />}
                {q.isError && <CardActions primary={{ label: t("lookalike.playOnline"), icon: GameController, onClick: play }} />}
            </section>
        );
    }

    // 4구 — 닮은 프로는 3쿠션 프로 기록으로만 매긴다. 내 다마수 줄과 한 판 하기만.
    if (cur === "4c" || !d) {
        return (
            <section className="rk-card rounded-3xl p-4">
                {head}
                <p className="text-[11.5px] text-ink-4 mt-2.5">{t("home.online4cNote")}</p>
                <CardActions primary={{ label: t("lookalike.playOnline"), icon: GameController, onClick: play }} />
            </section>
        );
    }

    if (!d.ready || d.avg == null || !d.pro) {
        const left = Math.max(1, d.needed - d.matches);
        return (
            <section className="rk-card rounded-3xl p-4">
                {head}
                <NeedMore
                    title={fill(t("lookalike.needTitle"), { n: d.needed })}
                    sub={fill(t("lookalike.needSub"), { m: Math.min(d.matches, d.needed), left })}
                    pct={(d.matches / d.needed) * 100}
                    action={{ label: t("lookalike.playCta"), icon: GameController, onClick: play }}
                />
            </section>
        );
    }

    const pro = d.pro;
    const next = d.next;
    const openPro = (memCode: string) => setLocation(`/pba-player/${encodeURIComponent(memCode)}`);
    const share = async () => {
        if (sharing) return;
        setSharing(true);
        try {
            const ratio = proRatio(d.avg!, pro.average);
            const tierName = d.tier != null ? t(`lookalike.tier${d.tier}`) : null;
            const blob = await drawCompareCard({
                title: fill(t("compare.cardTitle"), { name: proName(pro, locale) }),
                meLabel: t("compare.me"), proLabel: proName(pro, locale),
                heroValue: ratio != null ? `${ratio}%` : "",
                heroLabel: fill(t("lookalike.ofPro"), { name: proName(pro, locale) }),
                sub: tierName ? fill(t("lookalike.cardSub"), { tier: tierName }) : t("lookalike.fun"),
                rows: [
                    { label: t("lookalike.myAvg"), me: d.avg, pro: pro.average, fmt: (v) => v.toFixed(3) },
                    { label: t("lookalike.highRun"), me: d.highRun, pro: pro.highRun ?? null, fmt: (v) => String(v) },
                ],
                footer: t("compare.cardFooter"),
            });
            const outcome = await shareImage({ blob, filename: "rankue-lookalike.png", title: t("lookalike.title"), text: `${t("lookalike.title")} ${proName(pro, locale)} · https://www.rankue.co.kr/online-game` });
            if (outcome === "downloaded") toast({ title: t("playerCard.saved") });
            else if (outcome === "failed") toast({ title: t("playerCard.failed"), variant: "destructive" });
        } catch {
            toast({ title: t("playerCard.failed"), variant: "destructive" });
        } finally { setSharing(false); }
    };

    return (
        <section className="rk-card rounded-3xl p-4">
            {head}
            <ProTwinHeader pro={pro} tier={d.tier} pos={d.pos} onOpen={() => openPro(pro.memCode)} />
            <CompareTable
                cols={[
                    { label: t("compare.me"), tone: "me", avatar: <MeAvatar /> },
                    { label: proName(pro, locale), avatar: <ProAvatar pro={pro} /> },
                    next
                        ? { label: proName(next, locale), tag: t("lookalike.colNext"), tone: "next", avatar: <ProAvatar pro={next} next /> }
                        : { label: t("lookalike.colNext"), tone: "next", avatar: <BadgeAvatar next>🏆</BadgeAvatar> },
                ]}
                rows={[
                    { label: t("lookalike.rowAvg"), cells: [d.avg.toFixed(2), pro.average.toFixed(2), next ? <NextCell value={next.average.toFixed(2)} gap={next.average - d.avg} /> : "🏆"] },
                    { label: t("lookalike.rowHighRun"), cells: [d.highRun ?? "—", pro.highRun ?? "—", next?.highRun ?? "—"] },
                    { label: t("lookalike.rowHandi"), cells: [d.target ?? "—", "—", "—"] },
                ]}
            />
            {/* 재미로 — 머리 자리를 탭이 써서 비교표 아래로 옮겼다 */}
            <p className="text-[11.5px] text-ink-4 mt-2">{t("lookalike.funShort")}</p>
            <CardActions
                primary={{ label: t("lookalike.playOnline"), icon: GameController, onClick: play }}
                onPro={() => openPro(pro.memCode)}
                onShare={() => void share()} sharing={sharing}
            />
        </section>
    );
}
