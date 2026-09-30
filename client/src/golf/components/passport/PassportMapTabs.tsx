/**
 * 도장깨기 지도 보기 전환(2026-09-30) — 지역 정복(묶음별로 칠한 지도) ↔ 발자국(처음 간 순서로 걷는 점 지도).
 * 두 지도는 그림이 달라(지역 도형 vs 골프장 점) 한 장에 겹치지 않고 바꿔 본다. 고른 쪽은 이 기기에 기억한다.
 * 처음 여는 사람은 발자국부터(2026-09-30 오너 결정) — 지역 정복을 직접 고른 기기만 그쪽으로 연다.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { LucideFootprints, LucideMapTrifold } from "@/lib/icons";

export type PassportMapMode = "region" | "footprints";
const STORE_KEY = "rk-golf-passport-map";

/** 마지막으로 본 지도 — 고른 적 없거나 저장소를 못 쓰는 환경(사생활 보호 창)에선 발자국으로 */
export function usePassportMapMode(): [PassportMapMode, (m: PassportMapMode) => void] {
    const [mode, setMode] = useState<PassportMapMode>(() => {
        try { return localStorage.getItem(STORE_KEY) === "region" ? "region" : "footprints"; } catch { return "footprints"; }
    });
    const set = (m: PassportMapMode) => {
        setMode(m);
        try { localStorage.setItem(STORE_KEY, m); } catch { /* 저장 못 해도 화면은 바뀐다 */ }
    };
    return [mode, set];
}

export function PassportMapTabs({ value, onChange }: { value: PassportMapMode; onChange: (m: PassportMapMode) => void }) {
    const tabs = [
        { id: "footprints" as const, label: "발자국", Icon: LucideFootprints },
        { id: "region" as const, label: "지역 정복", Icon: LucideMapTrifold },
    ];
    return (
        <div className="flex justify-center mb-6">
            <div role="tablist" aria-label="도장깨기 지도" className="inline-flex p-1 rounded-full bg-[#FFFFFF0D] ring-1 ring-inset ring-[#FFFFFF14]">
                {tabs.map(({ id, label, Icon }) => {
                    const on = value === id;
                    return (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => onChange(id)}
                            className={cn(
                                "h-9 px-4 rounded-full inline-flex items-center gap-1.5 text-[13.5px] font-semibold transition-colors",
                                on ? "bg-[#ffffff] text-[#0A0A0A] shadow-sm" : "text-[#FFFFFFB3] active:text-[#ffffff]",
                            )}
                        >
                            <Icon weight={on ? "fill" : "bold"} className="w-4 h-4" />
                            {label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
