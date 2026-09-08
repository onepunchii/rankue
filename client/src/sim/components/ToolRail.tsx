import { memo, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 오른쪽 툴바. 원형 아이콘 버튼을 세로로 쌓는다 — 묶음(groups) 사이는 12 px, 묶음 안은 8 px(compact: 8 / 6). 탭 대상 사이 ≥ 6 px.
 * 간격·크기 숫자는 railLayout.ts(RAIL_MD / RAIL_SM)와 같아야 한다 — 페이지가 그 산술로 md 가 열에 들어가는지 미리 정한다.
 * 아이콘만 두고(글자 라벨은 12 px 미만이라 금지) aria-label 로 이름을 주며, 탭하면 왼쪽에 12 px 알약(hint)이 1.2 s 떴다 사라져
 * 아이콘의 뜻을 익히게 한다. 알약은 position: fixed(버튼 rect 기준) — 툴바가 짧은 화면에서 세로 스크롤(overflow)이 돼도 잘리지 않는다.
 * 상태:
 *  - toggle: aria-pressed + 켜지면 brand 틴트(다이아몬드 · 3D 보기 · 소리)
 *  - active(비토글): 값이 있는 도구(큐 각 > 0°) 를 brand 틴트로만 표시
 *  - caption: 아이콘 아래 12 px 숫자("10°")
 * size: "md" = 44 px(기본), "sm" = 40 px(짧은 화면의 compact 모드 — 탭 대상 하한 40 px).
 * 페이지가 어떤 버튼을 넣을지 정한다(모드·렌더러·단계에 따라). 이 컴포넌트는 배열을 그리기만 한다.
 */
export interface RailItem {
    readonly id: string;
    /** aria-label · title. */
    readonly label: string;
    /** 탭 뒤 알약에 보일 짧은 이름. 없으면 label. */
    readonly hint?: string;
    readonly icon: ReactNode;
    readonly onPress: () => void;
    /** 토글 버튼: aria-pressed 를 낸다. */
    readonly toggle?: boolean;
    /** 켜짐(토글) 또는 값 있음(도구): brand 틴트. */
    readonly active?: boolean;
    /** 흐리게(소리 끔). */
    readonly dim?: boolean;
    readonly disabled?: boolean;
    /** 아이콘 아래 12 px 숫자. */
    readonly caption?: string | null;
    /** 버튼 껍데기(흰 원·테두리·그림자) 없이 아이콘만 — 아이콘이 스스로 원을 그릴 때(길 찾기의 길 칩). */
    readonly bare?: boolean;
}

export interface ToolRailProps {
    /** 위에서부터 묶음 순서대로. 빈 묶음은 건너뛴다. */
    readonly groups: readonly (readonly RailItem[])[];
    readonly size?: "md" | "sm";
    readonly className?: string;
}

/** 탭 뒤 이름 알약이 보이는 시간. */
export const HINT_MS = 1200;

const BTN = "relative shrink-0 rounded-pill border flex flex-col items-center justify-center rk-shadow active:bg-surface-3 disabled:opacity-40 disabled:pointer-events-none";

interface Hint { readonly id: string; readonly text: string; readonly right: number; readonly y: number }

export const ToolRail = memo(function ToolRail({ groups, size = "md", className }: ToolRailProps) {
    const [hint, setHint] = useState<Hint | null>(null);
    useEffect(() => {
        if (!hint) return;
        const h = setTimeout(() => setHint(null), HINT_MS);
        return () => clearTimeout(h);
    }, [hint]);
    const sm = size === "sm";

    return (
        <div className={cn("flex flex-col items-end", sm ? "gap-2" : "gap-3", className)}>
            {hint && (
                <span
                    className="fixed z-[6] -translate-y-1/2 whitespace-nowrap rk-chip bg-surface-1 border border-surface-line text-ink-2 pointer-events-none"
                    style={{ right: hint.right, top: hint.y }}
                    aria-hidden="true"
                >
                    {hint.text}
                </span>
            )}
            {groups.map((g, gi) => g.length === 0 ? null : (
                <div key={gi} className={cn("flex flex-col", sm ? "gap-1.5" : "gap-2")}>
                    {g.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            aria-label={item.label}
                            title={item.label}
                            aria-pressed={item.toggle ? !!item.active : undefined}
                            disabled={item.disabled}
                            onClick={(e) => {
                                const r = e.currentTarget.getBoundingClientRect();
                                const vw = typeof window !== "undefined" ? window.innerWidth : r.right;
                                setHint({ id: item.id, text: item.hint ?? item.label, right: vw - r.left + 8, y: r.top + r.height / 2 });
                                item.onPress();
                            }}
                            className={cn(
                                item.bare ? "relative shrink-0 rounded-pill flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none" : BTN,
                                sm ? "h-10 w-10" : "h-11 w-11",
                                !item.bare && (item.active
                                    ? "bg-brand/[0.08] border-brand/45 text-brand"
                                    : cn("bg-surface-1 border-surface-line", item.dim ? "text-ink-4" : "text-ink-2")),
                            )}
                        >
                            {item.icon}
                            {item.caption && (
                                <span className="rk-num text-[12px] font-semibold leading-none -mt-0.5">{item.caption}</span>
                            )}
                        </button>
                    ))}
                </div>
            ))}
        </div>
    );
});
