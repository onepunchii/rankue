/**
 * 홈 "닮은 프로" 카드 공용 조각(2026-09-27, 오너: "닮은 프로·등급·사다리 부분은 최대한 살리고 디자인 업, 나머지는 표·버튼으로 콤팩트하게").
 *  - ProTwinHeader: 닮은 프로(동그라미 + 리그 배지·이름·국기·에버/하이런) + 등급 메달 칩 + 5칸 사다리(내 자리 '나' 점)
 *  - CompareTable: 나 | 비교 대상 | 다음 목표 — 줄마다 에버·하이런·핸디
 *  - CardActions: 큰 버튼 하나 + 작은 버튼(프로·공유)
 * 온라인 카드(LookalikeProCard)와 실전 카드(RealHandicapCard)가 같이 쓴다.
 */
import { useState, type ComponentType, type ReactNode } from "react";
import { PlayerPhoto } from "@/components/hiq/PlayerPhoto";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { flagEmoji } from "@/lib/flag";
import { LucideChevronRight, LucideLoader2, LucideShare2, LucideUser } from "@/lib/icons";
import type { ComparePro } from "@shared/proCompare";

export const GOLD_TEXT = "text-[#8a6a0a]";
const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m));

/** 등급 메달 — 아마추어(당구공) · 동 · 은 · 금 · 왕관. 칩 색도 등급을 따라간다. */
const TIER_STYLE: { icon: string; chip: string }[] = [
    { icon: "🎱", chip: "bg-surface-3 text-ink-2" },
    { icon: "🥉", chip: "bg-[#C77B30]/15 text-[#8a4f16]" },
    { icon: "🥈", chip: "bg-[#8A9BB0]/20 text-[#46566b]" },
    { icon: "🥇", chip: "bg-[#F5B721]/20 text-[#8a6a0a]" },
    { icon: "👑", chip: "bg-brand/10 text-brand" },
];

export function proName(p: Pick<ComparePro, "nameKo" | "nameEn">, locale: string) {
    return locale === "ko" ? p.nameKo : (p.nameEn || p.nameKo);
}

export function TierChip({ tier, className }: { tier: number; className?: string }) {
    const { t } = useT();
    const st = TIER_STYLE[tier] ?? TIER_STYLE[0];
    return (
        <span className={cn("inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[12px] font-bold whitespace-nowrap", st.chip, className)}>
            <span className="text-[13px] leading-none">{st.icon}</span>{t(`lookalike.tier${tier}`)}
        </span>
    );
}

/** 5칸 사다리 — 지나온 칸은 옅은 초록, 내 칸은 진한 초록, 남은 칸은 회색. 점('나')은 내 칸 안의 자리. */
export function TierLadder({ tier, pos }: { tier: number; pos: number }) {
    const { t } = useT();
    return (
        <div className="mt-3" aria-label={t(`lookalike.tier${tier}`)}>
            <div className="relative">
                <div className="grid grid-cols-5 gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <span key={i} className={cn("h-2.5 first:rounded-l-full last:rounded-r-full",
                            i < tier ? "bg-brand/35" : i === tier ? "bg-brand" : "bg-surface-line")} />
                    ))}
                </div>
                <span
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-full bg-[#F5B721] border-[3px] border-surface-1 shadow-[0_1px_4px_rgba(0,0,0,.25)] text-[9.5px] font-bold text-white flex items-center justify-center"
                    style={{ left: `${pos}%` }} aria-hidden="true"
                >{t("lookalike.meDot")}</span>
            </div>
            <div className="grid grid-cols-5 gap-1 mt-1.5">
                {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className={cn("text-center text-[10px] leading-tight font-semibold break-keep", i === tier ? "text-brand" : "text-ink-4")}>
                        {t(`lookalike.tierShort${i}`)}
                    </span>
                ))}
            </div>
        </div>
    );
}

/** 닮은 프로 머리 — 누르면 그 선수 페이지. extra: 등급 칩 옆 작은 칩(예: 랭큐 상위 30%) */
export function ProTwinHeader({ pro, tier, pos, extra, onOpen }: { pro: ComparePro; tier: number | null; pos: number | null; extra?: ReactNode; onOpen: () => void }) {
    const { t, locale } = useT();
    const name = proName(pro, locale);
    const [photo, setPhoto] = useState(false);
    return (
        <div className="mt-3 rounded-tile bg-brand/[0.05] p-3">
            <a href={`/pba-player/${encodeURIComponent(pro.memCode)}`} onClick={(e) => { e.preventDefault(); onOpen(); }} className="flex items-center gap-3 active:opacity-80">
                <PlayerPhoto memCode={pro.memCode} name={name} size={56} className="ring-[3px] ring-surface-1 shadow-[0_2px_8px_rgba(0,0,0,.15)]" onShown={() => setPhoto(true)}>
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 h-4 rounded-full bg-surface-1 text-brand text-[9px] font-bold leading-4 shadow-sm whitespace-nowrap">{pro.league}</span>
                </PlayerPhoto>
                <span className="flex-1 min-w-0">
                    <span className="block text-[11.5px] font-semibold text-ink-3">{t("lookalike.twin")}</span>
                    <span className="flex items-center gap-1 min-w-0">
                        <span className="text-[19px] font-bold leading-tight truncate">{name}</span>
                        <span className="text-[14px] shrink-0">{flagEmoji(pro.nationCode ?? "")}</span>
                    </span>
                    <span className="block rk-num text-[12px] font-medium text-ink-3">
                        {t("compare.avgShort")} {pro.average.toFixed(2)}{pro.highRun ? ` · ${t("lookalike.rowHighRun")} ${pro.highRun}` : ""}
                        {/* 사진 출처 — 사진이 떴을 때만, 짧게 */}
                        {photo && <span className="text-ink-4"> · {t("lookalike.photoCredit")}</span>}
                    </span>
                </span>
                <LucideChevronRight className="w-4 h-4 text-ink-4 shrink-0" />
            </a>
            {(tier != null || extra) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    {tier != null && <TierChip tier={tier} />}
                    {extra}
                </div>
            )}
            {tier != null && pos != null && <TierLadder tier={tier} pos={pos} />}
        </div>
    );
}

export interface TableCol { label: ReactNode; tone?: "me" | "other" | "next" }
/** 비교표 — 첫 칸은 항목, 나머지는 숫자(오른쪽 정렬). 칸 색: 나 = 금, 다음 목표 = 초록 */
export function CompareTable({ cols, rows }: { cols: TableCol[]; rows: { label: string; cells: ReactNode[] }[] }) {
    const tone = (t?: TableCol["tone"]) => (t === "me" ? GOLD_TEXT : t === "next" ? "text-brand" : "text-ink-3");
    return (
        <table className="w-full mt-2.5 rk-num text-[13px]">
            <thead>
                <tr className="border-b border-surface-line">
                    <th className="w-[22%]" />
                    {cols.map((c, i) => (
                        <th key={i} className={cn("py-1.5 text-right text-[11.5px] font-bold truncate max-w-0", tone(c.tone))}>{c.label}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((r) => (
                    <tr key={r.label} className="border-b border-surface-line last:border-0">
                        <td className="py-2 text-left text-[12.5px] font-semibold text-ink-3">{r.label}</td>
                        {r.cells.map((c, i) => (
                            <td key={i} className={cn("py-2 text-right whitespace-nowrap", cols[i]?.tone === "me" ? "font-bold text-ink-1" : "font-semibold text-ink-2")}>{c}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/** 다음 목표 칸 — 값 + (남은 차이) 초록. 차이가 0.01 미만이면 셋째 자리까지(둘째 자리로 자르면 "+0.00"이 된다) */
export function NextCell({ value, gap }: { value: string; gap?: number | null }) {
    return <>{value}{gap != null && gap > 0 && <span className="text-brand"> (+{gapText(gap)})</span>}</>;
}
export const gapText = (gap: number) => (gap >= 0.01 ? gap.toFixed(2) : Math.max(0.001, Math.ceil(gap * 1000) / 1000).toFixed(3));

export function CardActions({ primary, onPro, onShare, sharing }: {
    primary: { label: string; icon: ComponentType<{ className?: string }>; onClick: () => void };
    onPro?: () => void;
    onShare?: () => void;
    sharing?: boolean;
}) {
    const { t } = useT();
    const Icon = primary.icon;
    const sub = "h-10 px-3 rounded-full border border-surface-line-strong bg-surface-1 text-[13px] font-semibold text-ink-1 inline-flex items-center gap-1 shrink-0 disabled:opacity-60";
    return (
        <div className="flex gap-1.5 mt-3">
            <button type="button" onClick={primary.onClick} className="flex-1 min-w-0 h-10 rounded-full bg-brand text-brand-fg text-[13.5px] font-semibold inline-flex items-center justify-center gap-1.5">
                <Icon className="w-4 h-4 shrink-0" /><span className="truncate">{primary.label}</span>
            </button>
            {onPro && <button type="button" onClick={onPro} className={sub}><LucideUser className="w-4 h-4" />{t("lookalike.pro")}</button>}
            {onShare && (
                <button type="button" onClick={onShare} disabled={sharing} className={sub}>
                    {sharing ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : <LucideShare2 className="w-4 h-4" />}{t("lookalike.share")}
                </button>
            )}
        </div>
    );
}

/** 3판·5판 전 — 진행 막대와 큰 버튼 하나 */
export function NeedMore({ title, sub, pct, action }: { title: string; sub: string; pct: number; action: { label: string; icon: ComponentType<{ className?: string }>; onClick: () => void } }) {
    const Icon = action.icon;
    return (
        <>
            <div className="flex items-center gap-3 mt-3">
                <span className="w-12 h-12 shrink-0 rounded-full bg-surface-3 text-ink-4 text-[22px] font-bold flex items-center justify-center" aria-hidden="true">?</span>
                <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-semibold">{title}</div>
                    <div className="text-[12px] text-ink-3 mt-0.5 rk-num">{sub}</div>
                    <div className="mt-2 h-1.5 rounded-full bg-surface-line overflow-hidden"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} /></div>
                </div>
            </div>
            <button type="button" onClick={action.onClick} className="w-full h-10 mt-3 rounded-full bg-brand text-brand-fg text-[13.5px] font-semibold inline-flex items-center justify-center gap-1.5">
                <Icon className="w-4 h-4" />{action.label}
            </button>
        </>
    );
}

export { fill };
