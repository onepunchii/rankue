import type { ReactNode } from "react";

/**
 * 툴바(ToolRail)·상단 띠의 인라인 SVG 아이콘. 전부 stroke="currentColor" 20 px — 버튼 색(ink-2 / brand)을 그대로 따른다.
 * 당점 아이콘만 상태를 그린다(현재 (a, b) 오프셋 위치의 점). 나머지는 정적.
 */
const SVG = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

function Icon({ children, className }: { children: ReactNode; className?: string }) {
    return <svg {...SVG} className={className}>{children}</svg>;
}

/** 공 반지름(뷰박스 단위). 당점 점은 a·b(R 비율, |·| ≤ 0.5) 를 이 반지름에 곱해 놓는다. */
const BALL_R = 8.5;

/** 당점: 공 윤곽 + 현재 당점 위치의 점(+a = 오른쪽, +b = 위). */
export function SpinIcon({ a, b }: { a: number; b: number }) {
    return (
        <Icon>
            <circle cx="12" cy="12" r={BALL_R} />
            <circle cx={12 + a * BALL_R} cy={12 - b * BALL_R} r="2.2" fill="currentColor" stroke="none" />
        </Icon>
    );
}

/** 경고: 삼각형 + 느낌표(미스큐·마세·점프 안내 칩). */
export function WarnIcon({ className }: { className?: string }) {
    return (
        <Icon className={className}>
            <path d="M12 4 3 19h18z" />
            <path d="M12 10v4" />
            <path d="M12 17h.01" />
        </Icon>
    );
}

/** 큐 각: 바닥선 위로 들린 큐대와 각도 원호. */
export function ElevationIcon() {
    return (
        <Icon>
            <path d="M4 18h16" />
            <path d="M4 18 16.5 7" />
            <path d="M10 18a6 6 0 0 0-1.6-4.1" />
        </Icon>
    );
}

/** 해법 찾기: 방사형 반짝임. */
export function SolverIcon() {
    return (
        <Icon>
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
        </Icon>
    );
}

export function DiamondIcon() {
    return (
        <Icon>
            <path d="M12 3 21 12 12 21 3 12z" />
        </Icon>
    );
}

export function CubeIcon() {
    return (
        <Icon>
            <path d="M12 3 21 8v8l-9 5-9-5V8z" />
            <path d="M12 13 21 8M12 13 3 8M12 13v8" />
        </Icon>
    );
}

export function SoundIcon({ muted }: { muted: boolean }) {
    return (
        <Icon>
            <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" />
            {muted ? <path d="m16 9.5 5 5M21 9.5l-5 5" /> : <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18.3 7a7 7 0 0 1 0 10" />}
        </Icon>
    );
}

export function ListIcon() {
    return (
        <Icon>
            <path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" />
        </Icon>
    );
}

export function UndoIcon() {
    return (
        <Icon>
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
        </Icon>
    );
}

export function ShareIcon() {
    return (
        <Icon>
            <path d="M12 3v12M8 7l4-4 4 4" />
            <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
        </Icon>
    );
}

/** 다시 배치: 되감기 화살표. */
export function ResetIcon() {
    return (
        <Icon>
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
        </Icon>
    );
}

export function CloseIcon() {
    return (
        <Icon>
            <path d="M6 6l12 12M18 6 6 18" />
        </Icon>
    );
}

export function FlagIcon() {
    return (
        <Icon>
            <path d="M5 21V4" />
            <path d="M5 4h12l-2 4 2 4H5" />
        </Icon>
    );
}

export function BackIcon() {
    return (
        <Icon>
            <path d="M15 5l-7 7 7 7" />
        </Icon>
    );
}

/** 대전 헤더 오른쪽 끝 — 나가기를 "멈춤"으로 읽히게(2026-09-16 오너가 준 참고 화면). */
export function PauseIcon() {
    return (
        <Icon>
            <path d="M9 5v14" />
            <path d="M15 5v14" />
        </Icon>
    );
}

export function MinusIcon() {
    return (
        <svg {...SVG} width={16} height={16}><path d="M5 12h14" /></svg>
    );
}

export function PlusIcon() {
    return (
        <svg {...SVG} width={16} height={16}><path d="M12 5v14M5 12h14" /></svg>
    );
}

export function ChevronLeftIcon() {
    return (
        <svg {...SVG} width={16} height={16}><path d="M15 5l-7 7 7 7" /></svg>
    );
}

/** 대시보드(막대 셋) — 진입 화면 머리글 */
export function ChartIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 20V11" /><path d="M12 20V4" /><path d="M20 20v-6" />
        </svg>
    );
}

export function ChevronRightIcon() {
    return (
        <svg {...SVG} width={16} height={16}><path d="m9 5 7 7-7 7" /></svg>
    );
}

/**
 * 길 찾기 오른쪽 바의 길 칩(2026-09-08 오너: 원 안에 원 없이, 색 원 하나에 여유 % 만 — 번호 없음).
 * 순위 색: 1 노란 공 · 2 빨간 공 · 3 백구 · 4·5 회색. 고른 칩은 진한 테두리.
 *
 * 4·5 는 **불투명한 회색**이다(2026-09-18 오너: "길4·길5 는 공 모양이 투명이라서 안 보인다"). 예전엔
 * --surface-line 으로 칠했는데 그건 얇은 구분선용 색이라 투명도가 9~12 % 뿐이다 — 칩 바탕으로 쓰니
 * 원이 사라지고 숫자만 떠 있었다. 앱 테마 토큰이 아니라 고정 회색을 쓴다: 이 칩은 어두운 당구 화면에도
 * 밝은 화면에도 같은 원으로 보여야 하고, 흰 글자 대비 4.7:1 이다.
 * 선 색과는 맞출 필요가 없다 — 길은 순위 색이 아니라 공 색(수구·적구)으로 그린다(Overlay).
 */
const PATH_CHIP_GRAY = "bg-[#6E7470] text-white";
const PATH_CHIP = [
    "bg-ball-yellow text-ink-1",
    "bg-ball-red text-white",
    "bg-ball-white text-ink-1 border-surface-line-strong",
    PATH_CHIP_GRAY,
    PATH_CHIP_GRAY,
] as const;

export function PathChip({ rank, pct, active }: { rank: number; pct: number | null; active: boolean }) {
    const cls = PATH_CHIP[Math.min(rank, PATH_CHIP.length) - 1];
    return (
        <span
            className={`rk-num inline-flex h-full w-full items-center justify-center rounded-pill border text-[12px] font-bold leading-none ${cls} ${active ? "border-ink-1 border-2" : rank === 3 ? "" : "border-transparent"}`}
        >
            {pct === null ? "–" : `${pct}%`}
        </span>
    );
}
