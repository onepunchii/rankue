/**
 * 진입 화면 배경 샘플(2026-09-08 오너: "온라인 게임스러운 디자인 샘플"). `?bg=arena|hero|board` 로 골라 본다 — 기본은 지금 화면(clean).
 * 색은 전부 토큰(라사·먹·브랜드)이고 그라디언트·발광은 쓰지 않는다. 고른 뒤 하나만 남기고 나머지는 지운다.
 */
export type EntryTheme = "clean" | "arena" | "hero" | "board";

export const ENTRY_THEMES: readonly EntryTheme[] = ["clean", "arena", "hero", "board"];

export function readEntryTheme(search: string): EntryTheme {
    const v = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("bg");
    return (ENTRY_THEMES as readonly string[]).includes(v ?? "") ? (v as EntryTheme) : "clean";
}

export interface EntryStyle {
    /** 화면 전체 바탕 */
    readonly page: string;
    /** 제목 줄 */
    readonly title: string;
    readonly close: string;
    /** 3D 테이블 자리 */
    readonly showcase: string;
    /** 카드 */
    readonly card: string;
    readonly cardTitle: string;
    readonly cardSub: string;
    readonly cardBig: string;
    readonly cardNote: string;
    /** 알약(부 동작) */
    readonly pill: string;
    /** 주 동작 */
    readonly primary: string;
    /** 카드 사이 여백 */
    readonly gap: string;
    /** "내 차례 n" 배지 */
    readonly badge: string;
}

const CLEAN: EntryStyle = {
    page: "bg-surface-1",
    title: "text-ink-1",
    close: "border border-surface-line text-ink-2 active:bg-surface-3",
    showcase: "relative w-full h-[228px] rounded-card overflow-hidden bg-surface-3 mb-4",
    card: "rounded-card bg-surface-1 border border-surface-line rk-shadow overflow-hidden",
    cardTitle: "text-ink-1",
    cardSub: "text-ink-3",
    cardBig: "text-ink-1",
    cardNote: "text-ink-2",
    pill: "border border-surface-line bg-surface-1 text-ink-2 active:bg-surface-3",
    primary: "bg-brand text-brand-fg active:bg-brand-strong",
    gap: "gap-3",
    badge: "border border-brand text-brand",
};

/** A. 아레나 — 화면 전체가 라사 위. 카드는 어두운 유리판, 3D 테이블은 위쪽에 꽉 차게. */
const ARENA: EntryStyle = {
    page: "bg-cloth",
    title: "text-white",
    close: "border border-white/25 text-white/90 active:bg-white/10",
    showcase: "relative h-[240px] -mx-5 w-[calc(100%+40px)] overflow-hidden bg-cloth mb-4",
    card: "rounded-card bg-black/25 border border-white/15 overflow-hidden",
    cardTitle: "text-white",
    cardSub: "text-white/60",
    cardBig: "text-white",
    cardNote: "text-white/75",
    pill: "border border-white/20 bg-white/5 text-white/90 active:bg-white/15",
    primary: "bg-ball-yellow text-ink-1 active:opacity-90",
    gap: "gap-3",
    badge: "border border-ball-yellow text-ball-yellow",
};

/** B. 히어로 — 테이블이 위쪽을 가로로 꽉 채우고 그 아래로 카드가 겹쳐 올라온다(스크린샷 같은 첫인상). */
const HERO: EntryStyle = {
    page: "bg-[var(--surface-0)]",
    title: "text-white",
    close: "border border-white/30 text-white active:bg-white/10",
    showcase: "relative h-[260px] -mx-5 -mt-4 w-[calc(100%+40px)] overflow-hidden bg-cloth mb-0",
    card: "rounded-card bg-surface-1 border border-surface-line rk-shadow overflow-hidden",
    cardTitle: "text-ink-1",
    cardSub: "text-ink-3",
    cardBig: "text-ink-1",
    cardNote: "text-ink-2",
    pill: "border border-surface-line bg-surface-1 text-ink-2 active:bg-surface-3",
    primary: "bg-brand text-brand-fg active:bg-brand-strong",
    gap: "gap-3",
    badge: "border border-brand text-brand",
};

/** C. 스코어보드 — 검은 판 위 흰 글씨, 큰 숫자가 주인공(콘솔 게임 메뉴). */
const BOARD: EntryStyle = {
    page: "bg-[#131512]",
    title: "text-white",
    close: "border border-white/25 text-white/90 active:bg-white/10",
    showcase: "relative w-full h-[200px] rounded-card overflow-hidden bg-[#0E1A14] mb-4",
    card: "rounded-card bg-white/[0.06] border border-white/10 overflow-hidden",
    cardTitle: "text-white",
    cardSub: "text-white/55",
    cardBig: "text-ball-yellow",
    cardNote: "text-white/75",
    pill: "border border-white/15 bg-transparent text-white/85 active:bg-white/10",
    primary: "bg-brand text-brand-fg active:bg-brand-strong",
    gap: "gap-2.5",
    badge: "border border-ball-yellow text-ball-yellow",
};

export function entryStyle(theme: EntryTheme): EntryStyle {
    return theme === "arena" ? ARENA : theme === "hero" ? HERO : theme === "board" ? BOARD : CLEAN;
}
