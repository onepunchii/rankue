/**
 * 도장깨기 보기 전환 — 발자국 · 지역 정복 · 앨범(2026-09-30).
 *
 * 둘째 판(같은 날 오너: "토글 사이즈가 아쉽다 — 가로 길이를 카드 넓이와 균일하게… 앨범을 넣어서 메뉴가 3개가 되어도 좋고"):
 * 가운데 작은 알약 → **지도 카드와 같은 폭**의 세 칸 탭. 라운드 시트의 '스코어카드 | 앨범' 탭과 같은 모양(흰 칸 = 지금 보기).
 * 고른 쪽은 이 기기에 기억한다. 처음 여는 사람은 발자국부터(오너 결정) — 지역 정복·앨범을 직접 고른 기기만 그쪽으로 연다.
 * 앨범 칸에는 사진 수를 붙인다(라운드 시트와 같은 작은 알약).
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { LucideFootprints, LucideImage, LucideMapTrifold } from "@/lib/icons";

export type PassportMapMode = "footprints" | "region" | "album";
const STORE_KEY = "rk-golf-passport-map";

/** 마지막으로 본 칸 — 고른 적 없거나 저장소를 못 쓰는 환경(사생활 보호 창)에선 발자국으로 */
export function usePassportMapMode(): [PassportMapMode, (m: PassportMapMode) => void] {
    const [mode, setMode] = useState<PassportMapMode>(() => {
        try {
            const v = localStorage.getItem(STORE_KEY);
            return v === "region" || v === "album" ? v : "footprints";
        } catch { return "footprints"; }
    });
    const set = (m: PassportMapMode) => {
        setMode(m);
        try { localStorage.setItem(STORE_KEY, m); } catch { /* 저장 못 해도 화면은 바뀐다 */ }
    };
    return [mode, set];
}

const TABS = [
    { id: "footprints" as const, label: "발자국", Icon: LucideFootprints },
    { id: "region" as const, label: "지역 정복", Icon: LucideMapTrifold },
    { id: "album" as const, label: "앨범", Icon: LucideImage },
];

export function PassportMapTabs({ value, onChange, albumCount = 0 }: { value: PassportMapMode; onChange: (m: PassportMapMode) => void; albumCount?: number }) {
    return (
        <div role="tablist" aria-label="도장깨기 보기" className="mb-6 grid grid-cols-3 p-1 rounded-2xl bg-[#FFFFFF0A] ring-1 ring-inset ring-[#FFFFFF0A]">
            {TABS.map(({ id, label, Icon }) => {
                const on = value === id;
                return (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => onChange(id)}
                        className={cn(
                            "h-10 min-w-0 rounded-xl inline-flex items-center justify-center gap-1.5 text-[14px] font-semibold transition-colors",
                            on ? "bg-[#ffffff] text-[#0A0A0A] shadow-sm" : "text-[#FFFFFFA6] active:text-[#ffffff]",
                        )}
                    >
                        <Icon weight={on ? "fill" : "bold"} className="w-4 h-4 shrink-0" />
                        <span className="truncate">{label}</span>
                        {id === "album" && albumCount > 0 && (
                            <span className={cn("shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-[12px] leading-5 tabular-nums", on ? "bg-[#64DD17] text-[#051907]" : "bg-[#FFFFFF1A] text-[#FFFFFFCC]")}>
                                {albumCount > 99 ? "99+" : albumCount}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
