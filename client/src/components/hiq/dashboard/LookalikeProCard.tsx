/**
 * 홈 온라인게임 카드 아래 "내 온라인 실력, 닮은 프로는?"(2026-09-27, 오너 승인 시안 → 같은 날 콤팩트 개편:
 * "닮은 프로·등급·사다리는 살리고 디자인 업, 나머지는 표·버튼으로").
 * 온라인 3쿠션 최근 10판 에버리지(핸디 계산과 같은 값)로 에버리지가 가장 가까운 PBA·LPBA 선수, 재미 등급·사다리,
 * 비교표(나 | 닮은 프로 | 다음 목표 프로 — 에버·하이런·핸디)와 [한 판 하기][프로][공유]. 3판 전에는 진행 막대.
 * 온라인 물리와 실제 테이블은 다르다 — 카드에 '재미로 보세요'를 늘 적는다. 로그인 전에는 그리지 않는다.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { shareImage } from "@/lib/shareImage";
import { GameController } from "@/lib/icons";
import { proRatio, type LookalikeResponse } from "@shared/proCompare";
import { drawCompareCard } from "@/components/hiq/compare/compareCard";
import { CardActions, CompareTable, NeedMore, NextCell, ProTwinHeader, fill, proName } from "@/components/hiq/compare/lookalikeUi";

export function LookalikeProCard() {
    const { t, locale } = useT();
    const { member } = useAuth();
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [sharing, setSharing] = useState(false);
    const q = useQuery<LookalikeResponse>({ queryKey: ["/api/hiq/sim/lookalike"], enabled: !!member, staleTime: 60_000, retry: false });
    const d = q.data;
    if (!member || !d) return null;

    const play = () => setLocation("/online-game");
    const head = (
        <div className="flex items-center justify-between gap-2">
            <h3 className="text-[14.5px] font-bold text-ink-1 shrink-0">🎮 {t("lookalike.titleShort")}</h3>
            {d.ready && <span className="text-[11px] text-ink-4 min-w-0 truncate">{t("lookalike.funShort")}</span>}
        </div>
    );

    if (!d.ready || d.avg == null || !d.pro) {
        const left = Math.max(1, d.needed - d.matches);
        return (
            <section className="col-span-2 rk-card rounded-3xl p-4">
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
        <section className="col-span-2 rk-card rounded-3xl p-4">
            {head}
            <ProTwinHeader pro={pro} tier={d.tier} pos={d.pos} onOpen={() => openPro(pro.memCode)} />
            <CompareTable
                cols={[
                    { label: t("compare.me"), tone: "me" },
                    { label: proName(pro, locale) },
                    { label: next ? `${t("lookalike.colNext")} ${proName(next, locale)}` : t("lookalike.colNext"), tone: "next" },
                ]}
                rows={[
                    { label: t("lookalike.rowAvg"), cells: [d.avg.toFixed(2), pro.average.toFixed(2), next ? <NextCell value={next.average.toFixed(2)} gap={next.average - d.avg} /> : "🏆"] },
                    { label: t("lookalike.rowHighRun"), cells: [d.highRun ?? "—", pro.highRun ?? "—", next?.highRun ?? "—"] },
                    { label: t("lookalike.rowHandi"), cells: [d.target ?? "—", "—", "—"] },
                ]}
            />
            <CardActions
                primary={{ label: t("lookalike.playOnline"), icon: GameController, onClick: play }}
                onPro={() => openPro(pro.memCode)}
                onShare={() => void share()} sharing={sharing}
            />
        </section>
    );
}
