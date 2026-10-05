/**
 * 준비물 체크(2026-10-05 오너: "이모지 및 아이콘을 활용하자" → "순서대로"의 2번) — 늘 챙기는 아홉 가지를 눌러 지워 간다.
 *
 * 글은 shared/golfPack(검색엔진용 화면과 같은 글). 체크 표시는 **이 브라우저에만** 남는다(localStorage) — 서버에 보내지 않는다.
 * 골프장 상세의 날씨 카드(접힌 한 줄 → 펼치면 두 칸 격자)와 /golf/checklist(설명이 붙은 한 줄씩)가 같은 표시를 본다.
 *
 * ⚠️ 비로그인(당구 테마)에서도 열리는 화면 — 색은 리터럴만(CourseShell 머리말). 글자 12px 이상.
 */
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { LucideCheck } from "@/lib/icons";
import { PACK_BASE, PACK_STORE_KEY, parsePackChecked } from "@shared/golfPack";

const read = (): string[] => { try { return parsePackChecked(localStorage.getItem(PACK_STORE_KEY)); } catch { return []; } };
const write = (keys: string[]) => { try { localStorage.setItem(PACK_STORE_KEY, JSON.stringify(keys)); } catch { /* 사생활 보호 창 — 이번 화면에서만 기억한다 */ } };

/** 체크된 것들 — 같은 화면에 목록이 둘 떠 있어도(날씨 카드의 개수 표시와 격자) 같이 움직이게 창 이벤트로 맞춘다 */
const EVT = "rankue:golf-pack";
export function usePackChecked() {
    const [checked, setChecked] = useState<string[]>(read);
    useEffect(() => {
        const sync = () => setChecked(read());
        window.addEventListener(EVT, sync);
        window.addEventListener("storage", sync);
        return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
    }, []);
    const save = useCallback((keys: string[]) => { write(keys); setChecked(keys); window.dispatchEvent(new Event(EVT)); }, []);
    const toggle = useCallback((key: string) => { const cur = read(); save(cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]); }, [save]);
    const clear = useCallback(() => save([]), [save]);
    return { checked, toggle, clear };
}

function Tick({ on }: { on: boolean }) {
    return (
        <span className={cn("w-[22px] h-[22px] shrink-0 rounded-full flex items-center justify-center transition-colors", on ? "bg-[#64DD17]" : "ring-1 ring-inset ring-[#FFFFFF40]")} aria-hidden>
            {on && <LucideCheck weight="bold" className="w-3.5 h-3.5 text-[#0A0A0A]" />}
        </span>
    );
}

/**
 * grid — 두 칸 격자(이름만), list — 한 줄씩(설명까지).
 * 다 챙겼으면 한마디, 하나라도 눌렀으면 '처음부터' 단추.
 */
export function PackList({ variant = "grid", className }: { variant?: "grid" | "list"; className?: string }) {
    const { checked, toggle, clear } = usePackChecked();
    const done = checked.length === PACK_BASE.length;
    return (
        <div className={className}>
            <ul className={variant === "grid" ? "grid grid-cols-2 gap-x-3" : "divide-y divide-[#FFFFFF0A]"}>
                {PACK_BASE.map((p) => {
                    const on = checked.includes(p.key);
                    return (
                        <li key={p.key}>
                            <button
                                type="button" role="checkbox" aria-checked={on} onClick={() => toggle(p.key)}
                                className={cn("w-full flex items-center gap-2.5 text-left active:opacity-70 transition-opacity", variant === "grid" ? "h-10" : "py-3")}
                            >
                                <Tick on={on} />
                                <span className="text-[17px] leading-none shrink-0" aria-hidden>{p.emoji}</span>
                                <span className="min-w-0">
                                    <span className={cn("block truncate transition-colors", variant === "grid" ? "text-[14px]" : "text-[15px] font-medium", on ? "text-[#FFFFFF73]" : "text-[#FFFFFFE6]")}>{p.label}</span>
                                    {variant === "list" && p.note && <span className="block mt-0.5 text-[13px] text-[#FFFFFF73] break-keep">{p.note}</span>}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
            {checked.length > 0 && (
                <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-[13px] text-[#FFFFFF99] tabular-nums" aria-live="polite">
                        {done ? "다 챙겼어요. 굿샷!" : `${checked.length}/${PACK_BASE.length} 챙겼어요`}
                    </p>
                    <button type="button" onClick={clear} className="h-8 px-2 -mr-2 text-[13px] font-medium text-[#FFFFFF99] active:text-white">처음부터</button>
                </div>
            )}
        </div>
    );
}
