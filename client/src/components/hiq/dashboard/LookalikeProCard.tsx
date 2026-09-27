/**
 * 홈 온라인게임 카드 아래 "내 온라인 실력, 닮은 프로는?"(2026-09-27, 오너 승인 시안).
 * 온라인 3쿠션 최근 10판 에버리지(핸디 계산과 같은 값)로 에버리지가 가장 가까운 PBA·LPBA 선수, 재미 등급(프로 분포에서 내 자리),
 * 다음 목표(한 단계 위 프로)와 [한 판]. 3판 전에는 진행 막대와 [온라인 대전 한 판].
 * 온라인 물리와 실제 테이블은 다르다 — 카드에 '온라인 기준 · 재미로 보세요'를 늘 적는다. 로그인 전에는 그리지 않는다.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { shareImage } from "@/lib/shareImage";
import { flagEmoji } from "@/lib/flag";
import { GameController, LucideChevronRight, LucideShare2, LucideLoader2 } from "@/lib/icons";
import { crewColors } from "@shared/crewBrand";
import { proRatio, type LookalikeResponse } from "@shared/proCompare";
import { drawCompareCard } from "@/components/hiq/compare/compareCard";

const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m));
const LADDER = [1, 2, 3, 4] as const;

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
    const nameOf = (p: { nameKo: string; nameEn: string | null }) => (locale === "ko" ? p.nameKo : (p.nameEn || p.nameKo));
    const head = (
        <div className="text-[13px] font-semibold text-brand">🎱 {t("lookalike.title")}</div>
    );

    // 3판 전 — 진행 막대와 한 판
    if (!d.ready || d.avg == null || !d.pro) {
        const left = Math.max(0, d.needed - d.matches);
        return (
            <section className="col-span-2 rk-card rounded-3xl p-4">
                {head}
                <div className="flex items-center gap-3 mt-3">
                    <span className="w-14 h-14 shrink-0 rounded-full bg-surface-3 text-ink-4 text-[24px] font-bold flex items-center justify-center" aria-hidden="true">?</span>
                    <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-semibold">{fill(t("lookalike.needTitle"), { n: d.needed })}</div>
                        <div className="text-[12.5px] text-ink-3 mt-0.5 rk-num">{fill(t("lookalike.needSub"), { m: Math.min(d.matches, d.needed), left: left || 1 })}</div>
                        <div className="mt-2 h-1.5 rounded-full bg-surface-line overflow-hidden">
                            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.round((d.matches / d.needed) * 100))}%` }} />
                        </div>
                    </div>
                </div>
                <button type="button" onClick={play} className="w-full h-11 mt-3.5 rounded-full bg-brand text-brand-fg text-[14.5px] font-semibold inline-flex items-center justify-center gap-1.5">
                    <GameController className="w-[18px] h-[18px]" />{t("lookalike.playCta")}
                </button>
            </section>
        );
    }

    const pro = d.pro;
    const [c0, c1] = crewColors(pro.memCode);
    const tierName = d.tier != null ? t(`lookalike.tier${d.tier}`) : null;
    const share = async () => {
        if (sharing) return;
        setSharing(true);
        try {
            const ratio = proRatio(d.avg!, pro.average);
            const blob = await drawCompareCard({
                title: fill(t("compare.cardTitle"), { name: nameOf(pro) }),
                meLabel: t("compare.me"), proLabel: nameOf(pro),
                heroValue: ratio != null ? `${ratio}%` : "",
                heroLabel: fill(t("lookalike.ofPro"), { name: nameOf(pro) }),
                sub: tierName ? fill(t("lookalike.cardSub"), { tier: tierName }) : t("lookalike.fun"),
                rows: [{ label: t("lookalike.myAvg"), me: d.avg, pro: pro.average, fmt: (v) => v.toFixed(3) }],
                footer: t("compare.cardFooter"),
            });
            const outcome = await shareImage({ blob, filename: "rankue-lookalike.png", title: t("lookalike.title"), text: `${t("lookalike.title")} ${nameOf(pro)} · https://www.rankue.co.kr/online-game` });
            if (outcome === "downloaded") toast({ title: t("playerCard.saved") });
            else if (outcome === "failed") toast({ title: t("playerCard.failed"), variant: "destructive" });
        } catch {
            toast({ title: t("playerCard.failed"), variant: "destructive" });
        } finally { setSharing(false); }
    };

    return (
        <section className="col-span-2 rk-card rounded-3xl p-4">
            {head}
            {/* 닮은 프로 — 누르면 그 선수 페이지 */}
            <a href={`/pba-player/${encodeURIComponent(pro.memCode)}`} onClick={(e) => { e.preventDefault(); setLocation(`/pba-player/${encodeURIComponent(pro.memCode)}`); }}
                className="flex items-center gap-3 mt-3 active:opacity-80">
                <span className="w-14 h-14 shrink-0 rounded-full text-white text-[22px] font-bold flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${c0}, ${c1})` }}>{nameOf(pro).trim().charAt(0)}</span>
                <span className="flex-1 min-w-0">
                    <span className="block text-[12px] font-semibold text-ink-3">{t("lookalike.twin")}</span>
                    <span className="block text-[19px] font-bold leading-tight truncate">
                        {pro.league} {nameOf(pro)} <span className="text-[13px]">{flagEmoji(pro.nationCode ?? "")}</span>
                        <span className="rk-num text-[13.5px] font-semibold text-ink-3 ml-1">{t("compare.avgShort")} {pro.average.toFixed(2)}</span>
                    </span>
                    {tierName && <span className="inline-flex mt-1 h-6 px-2.5 rounded-full items-center text-[12px] font-semibold bg-[#F5B721]/20 text-[#8a6a0a]">🏅 {tierName}</span>}
                </span>
                <LucideChevronRight className="w-4 h-4 text-ink-4 shrink-0" />
            </a>

            {/* 사다리 — 프로 분포에서 내 자리(금색 점) */}
            {d.pos != null && d.tier != null && (
                <div className="mt-3.5" aria-hidden="true">
                    <div className="relative h-2 rounded-full bg-gradient-to-r from-brand/15 to-brand/90">
                        <span className="absolute top-1/2 w-[18px] h-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F5B721] border-[3px] border-surface-1 shadow" style={{ left: `${d.pos}%` }} />
                    </div>
                    <div className="grid grid-cols-4 mt-1.5 text-[10.5px] font-semibold text-ink-4">
                        {LADDER.map((n, i) => (
                            <span key={n} className={cn("truncate", i === 0 ? "text-left" : i === 3 ? "text-right" : "text-center", d.tier === n && "text-brand")}>{t(`lookalike.tier${n}`)}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* 숫자 3칸 */}
            <div className="grid grid-cols-3 gap-2 mt-3.5">
                {[
                    [d.avg.toFixed(2), t("lookalike.myAvg")],
                    [d.highRun != null ? String(d.highRun) : "—", t("lookalike.highRun")],
                    [d.target != null ? String(d.target) : "—", t("lookalike.target")],
                ].map(([v, l]) => (
                    <div key={l} className="rounded-tile bg-surface-3 py-2.5 text-center">
                        <div className="rk-num text-[20px] font-bold">{v}</div>
                        <div className="text-[11px] font-semibold text-ink-3 mt-0.5">{l}</div>
                    </div>
                ))}
            </div>

            {/* 다음 목표 + 한 판 */}
            <div className="mt-3 flex items-center gap-2.5 rounded-tile bg-brand/[0.07] p-3">
                <p className="flex-1 min-w-0 text-[13px] leading-snug">
                    {d.next ? (
                        <>
                            {t("lookalike.nextLabel")} <b>{d.next.league} {nameOf(d.next)}</b> <span className="rk-num">{d.next.average.toFixed(2)}</span>
                            <span className="block text-[12px] text-ink-3">{fill(t("lookalike.nextGap"), { gap: `+${(d.next.average - d.avg).toFixed(2)}` })}</span>
                        </>
                    ) : <b>{t("lookalike.top")}</b>}
                </p>
                <button type="button" onClick={play} className="h-10 px-3.5 shrink-0 rounded-full bg-brand text-brand-fg text-[13.5px] font-semibold inline-flex items-center gap-1">
                    <GameController className="w-4 h-4" />{t("lookalike.play")}
                </button>
            </div>

            <div className="flex items-center justify-between mt-2.5 text-[12px] text-ink-3">
                <span className="min-w-0 truncate">{t("lookalike.fun")}</span>
                <button type="button" onClick={() => void share()} disabled={sharing} className="inline-flex items-center gap-1 min-h-9 shrink-0 font-semibold text-ink-2 disabled:opacity-60">
                    {sharing ? <LucideLoader2 className="w-3.5 h-3.5 animate-spin" /> : <LucideShare2 className="w-3.5 h-3.5" />}{t("lookalike.share")}
                </button>
            </div>
        </section>
    );
}
