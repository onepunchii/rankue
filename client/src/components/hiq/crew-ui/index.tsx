/**
 * 크루 화면 공통 부품(2026-09-26 크루 디자인 정리). 크루 목록·홈·게시판·사진첩·투표·대회·설정이 **같은 모양**을 쓰게 한다.
 *
 * 규칙(새 크루 화면도 이것만 쓴다):
 *  - 색은 토큰만: 글씨 text-ink-1..4, 바탕 bg-surface-0..3, 선 border-surface-line(-strong), 강조 brand, 위험 destructive, 금 gold.
 *    text-black/*, bg-white, #hex, red-500 같은 값은 골프(어두운 테마)에서 깨진다 — 쓰지 않는다.
 *  - 글자 크기는 다섯 단계: 12(캡션) · 13(보조) · 15(본문) · 17(섹션 제목) · 22(화면 제목). 굵기는 semibold(제목)·medium(나머지), 숫자는 rk-num.
 *  - 카드는 CREW_CARD(rk-card + 안쪽 16px). 화면 좌우 여백은 16px(px-4).
 *  - 누르는 것은 최소 44px(h-11 / min-h-11). 아이콘만 있는 버튼은 IconButton(aria-label 필수).
 *  - 지우기·강퇴처럼 되돌릴 수 없는 것은 window.confirm 대신 ConfirmDialog.
 */
import { type ReactNode } from "react";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const CREW_CARD = "rk-card p-4";
/** 화면 제목(22) · 섹션 제목(17) · 본문(15) · 보조(13) · 캡션(12) */
export const CREW_TEXT = {
    title: "text-[22px] font-semibold text-ink-1 tracking-[-0.01em]",
    section: "text-[17px] font-semibold text-ink-1",
    body: "text-[15px] font-medium text-ink-1",
    sub: "text-[13px] font-medium text-ink-3",
    caption: "text-[12px] font-medium text-ink-3",
} as const;
export const CREW_BTN = {
    primary: "h-11 px-4 rounded-pill bg-brand text-brand-fg text-[15px] font-semibold active:bg-brand-strong disabled:opacity-50 inline-flex items-center justify-center gap-1.5",
    secondary: "h-11 px-4 rounded-pill border border-surface-line-strong bg-surface-1 text-ink-1 text-[15px] font-semibold active:bg-surface-3 disabled:opacity-50 inline-flex items-center justify-center gap-1.5",
    ghost: "h-11 px-3 rounded-pill text-ink-2 text-[13px] font-semibold active:bg-surface-3 disabled:opacity-50 inline-flex items-center justify-center gap-1",
    danger: "h-11 px-4 rounded-pill bg-destructive text-destructive-foreground text-[15px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5",
    /** 머리·카드 안의 작은 만들기 알약(연한 초록) — "+ 투표 만들기"처럼. 높이는 44 그대로, 글자·좌우만 줄인다. */
    add: "h-11 px-3.5 rounded-pill bg-brand/10 text-brand text-[14px] font-semibold active:bg-brand/20 disabled:opacity-50 inline-flex items-center justify-center gap-1 [&_svg]:w-4 [&_svg]:h-4",
    /** 카드 발의 주 동작(참석하기 등) — 좁은 카드에서 오른쪽 끝에 붙는 알약 */
    primarySm: "h-11 px-5 rounded-pill bg-brand text-brand-fg text-[14px] font-semibold active:bg-brand-strong disabled:opacity-50 inline-flex items-center justify-center gap-1.5",
    secondarySm: "h-11 px-4 rounded-pill border border-surface-line-strong bg-surface-1 text-ink-1 text-[14px] font-semibold active:bg-surface-3 disabled:opacity-50 inline-flex items-center justify-center gap-1.5",
} as const;

/**
 * 섹션 머리: 제목(17) + 선택 숫자 + 오른쪽 동작.
 * 정렬 규칙(2026-09-26 크루 안쪽 정리): 만들기는 **언제나 머리 오른쪽의 연한 초록 알약**(add), 목록 화면으로 가는 건 그 옆
 * '전체보기 ›' 글자. 예전엔 정모는 맨 아래 가로 전체 버튼, 투표는 왼쪽 글자 링크로 섹션마다 자리가 달랐다.
 */
export function CrewSection({ title, count, action, add, children, className }: {
    title: ReactNode;
    count?: number;
    action?: { label: string; onClick: () => void };
    add?: { label: string; onClick: () => void; icon?: ReactNode };
    children?: ReactNode;
    className?: string;
}) {
    return (
        <section className={cn("flex flex-col gap-2.5", className)}>
            <header className="flex items-center justify-between gap-2 min-h-11">
                <h2 className={cn(CREW_TEXT.section, "min-w-0 truncate")}>
                    {title}
                    {count !== undefined && <span className="rk-num ml-1.5 text-brand">{count}</span>}
                </h2>
                <span className="flex items-center gap-1 shrink-0">
                    {add && (
                        <button type="button" onClick={add.onClick} className={CREW_BTN.add}>
                            {add.icon ?? <span aria-hidden="true" className="text-[16px] leading-none">+</span>}
                            {add.label}
                        </button>
                    )}
                    {action && (
                        <button type="button" onClick={action.onClick} className="h-11 -mr-2 px-2 text-[13px] font-semibold text-ink-3 active:text-ink-1">
                            {action.label} ›
                        </button>
                    )}
                </span>
            </header>
            {children}
        </section>
    );
}

/**
 * 탭 화면 머리(게시판·사진첩·투표·대회) — [뒤로] 제목(17)+숫자 …… [보조 동작] [만들기]. 한 줄 하나로 끝낸다.
 * 예전엔 투표·대회가 '‹ 투표' 줄 아래 '크루 투표' 제목을 또 두었고, 게시판은 머리 없이 떠 있는 둥근 버튼 둘(정산·글쓰기)이었다.
 */
export function CrewTabHeader({ title, count, onBack, backLabel, children, className }: {
    title: ReactNode;
    count?: number;
    onBack?: () => void;
    backLabel?: string;
    /** 오른쪽 동작들(CREW_BTN.add / secondarySm / IconButton) */
    children?: ReactNode;
    className?: string;
}) {
    return (
        <header className={cn("flex items-center gap-1 min-h-14 px-4", onBack && "pl-1", className)}>
            {onBack && (
                <IconButton label={backLabel ?? ""} onClick={onBack}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </IconButton>
            )}
            <h2 className={cn(CREW_TEXT.section, "flex-1 min-w-0 truncate")}>
                {title}
                {count !== undefined && <span className="rk-num ml-1.5 text-brand">{count}</span>}
            </h2>
            <span className="flex items-center gap-1.5 shrink-0">{children}</span>
        </header>
    );
}

/** 비어 있음 — 아이콘·제목·설명·(선택) 버튼. 카드 안에 가운데 정렬. */
export function CrewEmpty({ icon, title, desc, action, className }: {
    icon?: ReactNode;
    title: string;
    desc?: string;
    action?: { label: string; onClick: () => void };
    className?: string;
}) {
    return (
        <div className={cn(CREW_CARD, "flex flex-col items-center text-center py-8 gap-1.5", className)}>
            {icon && <div className="w-12 h-12 rounded-full bg-surface-3 text-ink-3 flex items-center justify-center mb-1 [&_svg]:w-6 [&_svg]:h-6">{icon}</div>}
            <p className={CREW_TEXT.body}>{title}</p>
            {desc && <p className={cn(CREW_TEXT.sub, "max-w-[280px] leading-relaxed")}>{desc}</p>}
            {action && <button type="button" onClick={action.onClick} className={cn(CREW_BTN.primary, "mt-3")}>{action.label}</button>}
        </div>
    );
}

/** 불러오기 실패 — '비어 있음'과 구분한다(실패를 "글이 없어요"로 보여 주지 않는다). */
export function CrewError({ onRetry, message, className }: { onRetry?: () => void; message?: string; className?: string }) {
    const { t } = useT();
    return (
        <div className={cn(CREW_CARD, "flex items-center justify-between gap-3", className)} role="alert">
            <p className={CREW_TEXT.sub}>{message ?? t("crewUi.loadFailed")}</p>
            {onRetry && <button type="button" onClick={onRetry} className={CREW_BTN.secondary}>{t("crewUi.retry")}</button>}
        </div>
    );
}

/** 불러오는 중 — 실제 줄 높이에 맞춘 뼈대 n 개. */
export function CrewSkeleton({ rows = 3, height = 72, className }: { rows?: number; height?: number; className?: string }) {
    return (
        <div className={cn("flex flex-col gap-2", className)} aria-busy="true">
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="rk-card animate-pulse bg-surface-3" style={{ height }} />
            ))}
        </div>
    );
}

/** 아이콘만 있는 44px 버튼. label 은 aria-label·title 로 간다. */
export function IconButton({ label, onClick, children, className, disabled, tone = "default" }: {
    label: string;
    onClick?: () => void;
    children: ReactNode;
    className?: string;
    disabled?: boolean;
    tone?: "default" | "danger";
}) {
    return (
        <button
            type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
            className={cn(
                "w-11 h-11 shrink-0 rounded-full inline-flex items-center justify-center active:bg-surface-3 disabled:opacity-40 [&_svg]:w-5 [&_svg]:h-5",
                tone === "danger" ? "text-destructive" : "text-ink-2",
                className,
            )}
        >
            {children}
        </button>
    );
}

/** 거르기 칩(가로 스크롤 줄 안). 선택은 채움으로 말한다. */
export function CrewChip({ selected, onClick, children, count }: { selected: boolean; onClick: () => void; children: ReactNode; count?: number }) {
    return (
        <button
            type="button" aria-pressed={selected} onClick={onClick}
            className={cn(
                "h-9 px-3.5 shrink-0 rounded-pill text-[13px] font-semibold inline-flex items-center gap-1 border",
                selected ? "bg-ink-1 text-surface-1 border-transparent" : "bg-surface-1 text-ink-2 border-surface-line active:bg-surface-3",
            )}
        >
            {children}
            {count !== undefined && <span className={cn("rk-num", selected ? "opacity-70" : "text-ink-4")}>{count}</span>}
        </button>
    );
}

/**
 * 가로 스크롤 칩 줄. 크루 화면은 탭 컨테이너가 motion drag="x"(좌우로 밀어 탭 넘기기)라, 칩 줄을 밀면 탭이 넘어갔다.
 * pointerdown 을 여기서 멈춰 드래그가 시작되지 않게 한다(가로 스크롤은 브라우저 기본 동작이라 그대로 된다).
 */
export function CrewChipRow({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
    return (
        <div role="group" aria-label={label} data-no-swipe="" onPointerDown={(e) => e.stopPropagation()} className={cn("flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide", className)}>
            {children}
        </div>
    );
}

/** 사람 동그라미 — 사진이 없으면 이름 첫 글자. */
export function CrewAvatar({ src, name, size = 40, className }: { src?: string | null; name?: string | null; size?: number; className?: string }) {
    const initial = (name ?? "").trim().charAt(0) || "?";
    return src ? (
        <img src={src} alt="" loading="lazy" className={cn("shrink-0 rounded-full object-cover bg-surface-3", className)} style={{ width: size, height: size }} />
    ) : (
        <span
            aria-hidden="true"
            className={cn("shrink-0 rounded-full bg-surface-3 text-ink-2 font-semibold inline-flex items-center justify-center", className)}
            style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
        >
            {initial}
        </span>
    );
}

/** 역할 배지 — 크루장(금)·운영진(초록)·승인 대기(회색 테두리). 일반 멤버는 그리지 않는다. */
export function CrewRoleBadge({ role }: { role?: string | null }) {
    const { t } = useT();
    if (role === "leader") return <span className="rk-chip bg-[var(--gold-soft)] text-gold">{t("crewUi.roleLeader")}</span>;
    if (role === "manage") return <span className="rk-chip bg-brand/10 text-brand">{t("crewUi.roleManager")}</span>;
    if (role === "pending") return <span className="rk-chip border border-surface-line-strong text-ink-3">{t("crewUi.rolePending")}</span>;
    return null;
}

/** 되돌릴 수 없는 동작 확인(window.confirm 대신). */
export function ConfirmDialog({ open, onOpenChange, title, desc, confirmLabel, onConfirm, danger = true, busy }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    desc?: string;
    confirmLabel: string;
    onConfirm: () => void;
    danger?: boolean;
    busy?: boolean;
}) {
    const { t } = useT();
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="w-[calc(100%-32px)] max-w-sm rounded-card">
                <AlertDialogHeader className="text-left">
                    <AlertDialogTitle className="text-[17px] font-semibold text-ink-1">{title}</AlertDialogTitle>
                    {desc && <AlertDialogDescription className="text-[13px] font-medium text-ink-3 leading-relaxed">{desc}</AlertDialogDescription>}
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row gap-2">
                    <AlertDialogCancel className="flex-1 h-11 mt-0 rounded-pill">{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={busy}
                        onClick={(e) => { e.preventDefault(); onConfirm(); }}
                        className={cn("flex-1 h-11 rounded-pill", danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-brand text-brand-fg hover:bg-brand/90")}
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
