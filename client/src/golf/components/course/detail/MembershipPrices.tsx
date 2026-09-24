/**
 * 회원권 시세(2026-09-24) — TGM 시세(만원 단위). 종목(일반·법인·여자·분양 …)을 골라 현재가·전일 대비·1년 흐름·연중 최고·최저.
 * 색은 한국 관례: 오름 빨강 · 내림 파랑.
 */
import { Suspense, lazy, useMemo, useState } from "react";
import { LucideExternalLink } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { kstDateLabel } from "@/lib/kst";
import { manwonText } from "@shared/golfCourse";
import type { CoursePrice } from "@/golf/lib/courseApi";
import { Card, Section, Skel, trendColor } from "./ui";

const PriceChart = lazy(() => import("./PriceChart"));

/** 서버의 대표 시세와 같은 순서 — '일반' → '개인' → 가장 싼 것. */
export function topPrice(prices: CoursePrice[]): CoursePrice | null {
    const rank = (l: string) => (l === "일반" ? 0 : l === "개인" ? 1 : 2);
    let best: CoursePrice | null = null;
    for (const p of prices) if (!best || rank(p.label) < rank(best.label) || (rank(p.label) === rank(best.label) && p.price < best.price)) best = p;
    return best;
}

function Arrow({ n, unit = "만원" }: { n: number | null; unit?: string }) {
    // null = 모른다(이력이 한 점뿐) — '보합'이라고 지어내지 않는다. 0 일 때만 보합.
    if (n == null) return null;
    if (n === 0) return <span className="text-[#FFFFFF80]">보합</span>;
    return <span style={{ color: trendColor(n) }}>{n > 0 ? "▲" : "▼"} {Math.abs(n).toLocaleString("ko-KR")}{unit}</span>;
}

export function MembershipPrices({ prices }: { prices: CoursePrice[] }) {
    const [sel, setSel] = useState(() => topPrice(prices)?.itemId ?? prices[0]?.itemId);
    const p = prices.find((x) => x.itemId === sel) ?? prices[0];

    // 기간 변화 — 이력의 첫 점과 지금. 이력이 1년이 안 되면 그 기간으로 말한다.
    const span = useMemo(() => {
        const h = p?.history ?? [];
        if (h.length < 2) return null;
        const first = h[0];
        const days = Math.round((Date.parse(h[h.length - 1].d) - Date.parse(first.d)) / 86_400_000);
        const label = days >= 330 ? "1년 전보다" : days >= 45 ? `${Math.round(days / 30)}개월 전보다` : `${days}일 전보다`;
        const diff = p.price - first.p;
        return { label, diff, pct: first.p ? (diff / first.p) * 100 : 0 };
    }, [p]);

    if (!p) return null;
    const lineColor = span && span.diff ? trendColor(span.diff) : "#E6E6E6";
    const hi = p.yearHigh, lo = p.yearLow;
    const pos = hi != null && lo != null && hi > lo ? Math.min(1, Math.max(0, (p.price - lo) / (hi - lo))) : null;

    return (
        <Section id="price" title="회원권 시세" aside={p.asOf ? <span className="text-[12px] text-[#FFFFFF66]">{kstDateLabel(`${p.asOf}T12:00:00+09:00`)} 기준</span> : undefined}>
            {prices.length > 1 && (
                <div className="-mx-4 px-4 mb-3 flex gap-1.5 overflow-x-auto scrollbar-hide">
                    {prices.map((x) => (
                        <button
                            key={x.itemId} type="button" onClick={() => setSel(x.itemId)} aria-pressed={x.itemId === p.itemId}
                            className={cn(
                                "shrink-0 h-9 px-3 rounded-full text-[13px] font-medium border whitespace-nowrap transition-colors",
                                x.itemId === p.itemId ? "bg-[#FFFFFF] text-[#0A0A0A] border-transparent" : "bg-transparent border-[#FFFFFF1F] text-[#FFFFFFB3]",
                            )}
                        >
                            {x.label}
                        </button>
                    ))}
                </div>
            )}
            <Card className="p-4">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <div className="text-[30px] leading-none font-semibold tracking-tight text-white tabular-nums">{manwonText(p.price)}</div>
                    <div className="text-[14px] font-medium tabular-nums">
                        <span className="text-[#FFFFFF66] mr-1.5">전일</span><Arrow n={p.change} />
                    </div>
                </div>
                {span && (
                    <div className="mt-2 text-[13px] tabular-nums">
                        <span className="text-[#FFFFFF80] mr-1.5">{span.label}</span>
                        {span.diff ? (
                            <span style={{ color: trendColor(span.diff) }}>
                                {span.diff > 0 ? "▲" : "▼"} {manwonText(Math.abs(span.diff))} · {Math.abs(span.pct).toFixed(1)}%
                            </span>
                        ) : <span className="text-[#FFFFFF80]">변동 없음</span>}
                    </div>
                )}

                {p.history.length >= 2 && (
                    <div className="mt-3">
                        <Suspense fallback={<Skel className="h-[168px]" />}>
                            <PriceChart data={p.history} color={lineColor} id={p.itemId} />
                        </Suspense>
                    </div>
                )}

                {hi != null && lo != null && (
                    <div className="mt-4 pt-3 border-t border-[#FFFFFF0F]">
                        {pos != null ? (
                            <>
                                <div className="flex justify-between text-[12px] text-[#FFFFFF80]">
                                    <span>연중 최저</span><span>연중 최고</span>
                                </div>
                                <div className="relative mt-2 h-1.5 rounded-full bg-[#FFFFFF14]">
                                    <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#FFFFFF] border-2 border-[#0A0A0A]" style={{ left: `${pos * 100}%` }} />
                                </div>
                                <div className="mt-2 flex justify-between text-[13px] font-medium text-white tabular-nums">
                                    <span>{manwonText(lo)}</span><span>{manwonText(hi)}</span>
                                </div>
                            </>
                        ) : (
                            <div className="flex justify-between text-[13px]">
                                <span className="text-[#FFFFFF80]">연중 최고·최저</span>
                                <span className="font-medium text-white tabular-nums">{manwonText(hi)}</span>
                            </div>
                        )}
                    </div>
                )}
            </Card>
            <a
                href="https://www.tgmpark.com/exchange/golf" target="_blank" rel="noopener noreferrer"
                className="mt-2 flex items-center justify-end gap-1 h-9 text-[13px] text-[#FFFFFF80] active:text-white"
            >
                회원권 매매 상담은 TGM<LucideExternalLink className="w-3.5 h-3.5" />
            </a>
        </Section>
    );
}
