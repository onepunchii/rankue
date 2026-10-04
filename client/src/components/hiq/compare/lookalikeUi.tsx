/**
 * 홈 "닮은 프로" 카드 공용 조각(2026-09-27, 오너: "닮은 프로·등급·사다리 부분은 최대한 살리고 디자인 업, 나머지는 표·버튼으로 콤팩트하게").
 *  - ProTwinHeader: 닮은 프로(동그라미 + 리그 배지·이름·국기·에버/하이런) + 등급 메달 칩 + 5칸 사다리(내 자리 '나' 점)
 *  - CompareTable: 나 | 비교 대상 | 다음 목표 — 줄마다 에버·하이런·핸디
 *  - CardActions: 큰 버튼 하나 + 작은 버튼(프로·공유)
 * 온라인 카드(LookalikeProCard)와 실전 카드(RealHandicapCard)가 같이 쓴다.
 */
import { useState, type ComponentType, type ReactNode } from "react";
import { PlayerPhoto } from "@/components/hiq/PlayerPhoto";
import { CrewAvatar } from "@/components/hiq/crew-ui";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { flagEmoji } from "@/lib/flag";
import { HelpCircle, LucideChevronRight, LucideLoader2, LucideShare2, LucideUser } from "@/lib/icons";
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

export interface TableCol {
    label: ReactNode;
    tone?: "me" | "other" | "next";
    /** 칸 머리 얼굴(나·프로 사진·다음 목표) — 하나라도 있으면 얼굴 머리 + 가운데 정렬 표로 그린다 */
    avatar?: ReactNode;
    /** 얼굴 위 작은 꼬리표(예: '다음 목표') */
    tag?: string;
}
const AV = 34;
/** 비교표 얼굴 — 나(프로필 사진·금테) */
export function MeAvatar() {
    const { member } = useAuth();
    return <CrewAvatar src={(member as any)?.profileImageUrl} name={member?.name ?? "나"} size={AV} className="ring-2 ring-[#F5B721] ring-offset-2 ring-offset-surface-1" />;
}
/** 비교표 얼굴 — PBA·LPBA 선수(사진, 없으면 이니셜) */
export function ProAvatar({ pro, next }: { pro: Pick<ComparePro, "memCode" | "nameKo" | "nameEn">; next?: boolean }) {
    const { locale } = useT();
    return <PlayerPhoto memCode={pro.memCode} name={proName(pro as ComparePro, locale)} size={AV} className={next ? "ring-2 ring-brand ring-offset-2 ring-offset-surface-1" : "ring-1 ring-surface-line"} />;
}
/** 비교표 얼굴 — 사람이 아닌 목표(다음 핸디 숫자·같은 핸디 무리) */
export function BadgeAvatar({ children, next }: { children: ReactNode; next?: boolean }) {
    return (
        <span className={cn("inline-flex items-center justify-center rounded-full rk-num font-bold text-[14px]",
            next ? "bg-brand text-brand-fg ring-2 ring-brand/30 ring-offset-2 ring-offset-surface-1" : "bg-surface-3 text-ink-2")}
            style={{ width: AV, height: AV }}>{children}</span>
    );
}

/**
 * 비교표 — 첫 칸은 항목, 나머지는 숫자. 칸 색: 나 = 금, 다음 목표 = 초록.
 * 얼굴 머리(2026-09-27 오너: "나·선수·다음이 비교 느낌이 안 난다"): 칸마다 얼굴 + 이름, 나와 둘째 칸 사이에 VS,
 * 나·다음 칸은 세로로 옅게 물들여 한 줄씩 견줘 읽힌다.
 */
export function CompareTable({ cols, rows }: { cols: TableCol[]; rows: { label: string; cells: ReactNode[] }[] }) {
    const tone = (t?: TableCol["tone"]) => (t === "me" ? GOLD_TEXT : t === "next" ? "text-brand" : "text-ink-3");
    const faces = cols.some((c) => c.avatar);
    if (!faces) {
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
    const tint = (t?: TableCol["tone"]) => (t === "me" ? "bg-[#F5B721]/[0.09]" : t === "next" ? "bg-brand/[0.06]" : "");
    const last = rows.length - 1;
    return (
        <table className="w-full mt-3 rk-num text-[13px] table-fixed border-separate border-spacing-0">
            <colgroup>
                <col className="w-[19%]" />
                {cols.map((_, i) => <col key={i} />)}
            </colgroup>
            <thead>
                <tr>
                    <th />
                    {cols.map((c, i) => (
                        <th key={i} className={cn("relative px-1 pt-2 pb-1.5 align-bottom rounded-t-tile", tint(c.tone))}>
                            {/* 나 ↔ 둘째 칸 사이 VS */}
                            {i === 1 && cols[0]?.tone === "me" && (
                                <span className="absolute left-0 top-[27px] -translate-x-1/2 -translate-y-1/2 z-10 w-[22px] h-[22px] rounded-full bg-ink-1 text-surface-1 text-[9px] font-black italic flex items-center justify-center ring-2 ring-surface-1">VS</span>
                            )}
                            <span className="flex flex-col items-center gap-1 min-w-0">
                                {c.avatar}
                                <span className={cn("block max-w-full truncate text-[11.5px] font-bold leading-tight", tone(c.tone))}>
                                    {c.tag && <span className="font-semibold opacity-80">{c.tag} </span>}{c.label}
                                </span>
                            </span>
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((r, ri) => (
                    <tr key={r.label}>
                        <td className="py-2 pl-0.5 text-left text-[12.5px] font-semibold text-ink-3 border-t border-surface-line">{r.label}</td>
                        {r.cells.map((c, i) => (
                            <td key={i} className={cn("py-2 px-1 text-center whitespace-nowrap border-t border-surface-line", tint(cols[i]?.tone),
                                ri === last && cols[i]?.tone && cols[i]?.tone !== "other" ? "rounded-b-tile" : "",
                                cols[i]?.tone === "me" ? "font-bold text-ink-1 text-[14px]" : "font-semibold text-ink-2")}>{c}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/** 다음 목표 칸 — 값 + (남은 차이) 초록. 차이가 0.01 미만이면 셋째 자리까지(둘째 자리로 자르면 "+0.00"이 된다) */
export function NextCell({ value, gap }: { value: string; gap?: number | null }) {
    // 얼굴 표에서는 칸이 가운데 정렬이라 남은 차이를 값 아래 작게 둔다(한 줄이면 칸을 넘친다)
    return (
        <span className="inline-flex flex-col items-center leading-tight">
            {value}
            {gap != null && gap > 0 && <span className="text-brand text-[10.5px] font-bold">+{gapText(gap)}</span>}
        </span>
    );
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

/**
 * 기록 띠(2026-10-04 오너: "3쿠션·4구 RP 카드와 전적 카드가 중복 — 이 카드(실전 핸디)에 통합, 디자인은 최대한 살려서").
 * 카드 머리 바로 아래 세 칸, 가는 선으로만 나눈다(상자 안에 상자를 겹치지 않게).
 *  실전: 랭킹 점수(상위 %) · 전적 · 최근 5경기 / 온라인: 대전 전적 · 랭킹 · 진행 중(내 차례).
 * 칸을 누르면 그 기록 화면으로 간다.
 */
export interface StripCell {
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    subTone?: "brand" | "muted";
    onClick?: () => void;
    /** 라벨 옆 작은 '?' — 누르면 설명이 열리는 칸(랭킹 점수 → RP 안내) */
    hint?: boolean;
}
export function RecordStrip({ cells }: { cells: StripCell[] }) {
    return (
        <div
            className="mt-3 grid rounded-tile border border-surface-line divide-x divide-surface-line overflow-hidden"
            style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
        >
            {cells.map((c, i) => {
                const body = (
                    <>
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-3 min-w-0">
                            <span className="truncate">{c.label}</span>
                            {c.hint && <HelpCircle className="w-3 h-3 shrink-0 text-ink-4" aria-hidden="true" />}
                        </span>
                        <span className="block mt-1.5 h-[18px] text-[16px] leading-[18px] font-bold text-ink-1 rk-num truncate">{c.value}</span>
                        <span className={cn("block mt-1.5 text-[11px] font-semibold rk-num truncate", c.subTone === "brand" ? "text-brand" : "text-ink-4")}>
                            {c.sub ?? " "}
                        </span>
                    </>
                );
                return c.onClick ? (
                    <button key={i} type="button" onClick={c.onClick} className="min-w-0 px-2.5 py-2.5 text-left transition-colors active:bg-surface-3">{body}</button>
                ) : (
                    <div key={i} className="min-w-0 px-2.5 py-2.5">{body}</div>
                );
            })}
        </div>
    );
}

/**
 * 전적 값 — "{w}승 {l}패" 같은 번역 틀에서 숫자는 크게, 글자는 작게(2026-10-04 리뷰: 360px 폰에서 '103승 97패'가 잘렸다).
 * 언어마다 틀이 달라도({w}W {l}L · {w}G {l}M) 같은 방식으로 나눈다.
 */
export function RecordValue({ template, w, l }: { template: string; w: number; l: number }) {
    const parts = template.split(/(\{w\}|\{l\})/).filter(Boolean);
    return (
        <>
            {parts.map((p, i) => p === "{w}" || p === "{l}"
                ? <span key={i}>{p === "{w}" ? w : l}</span>
                : <span key={i} className="text-[11.5px] font-semibold text-ink-2">{p}</span>)}
        </>
    );
}

/** 최근 경기 점 — 새것이 왼쪽. 승 초록·패 빨강, 비어 있으면 옅은 테두리 점 다섯 */
export function FormDots({ results }: { results: ("W" | "L")[] }) {
    const { t } = useT();
    const five = results.slice(0, 5);
    return (
        <span className="inline-flex items-center gap-1 align-middle" role="img" aria-label={five.map((r) => t(r === "W" ? "formBadges.win" : "formBadges.loss")).join(" ")}>
            {five.length
                ? five.map((r, i) => <span key={i} className={cn("w-2.5 h-2.5 rounded-full", r === "W" ? "bg-brand" : "bg-[#E5484D]")} />)
                : Array.from({ length: 5 }, (_, i) => <span key={i} className="w-2.5 h-2.5 rounded-full border border-surface-line-strong" />)}
        </span>
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
