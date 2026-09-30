/**
 * 경기 화면 머리의 현장 인증 칩(2026-09-30 오너 결정 — 현장 인증 도장).
 *
 *  - 📍 현장 인증됨(라임) · 위치 확인 중 · 현장 인증 안 됨 · 다시 확인(누르면 다시 확인) · 현장 인증 불가(골프장 좌표 없음).
 *  - 조르지 않는다: 인증이 안 된 이유는 **한 줄**로, 이 경기에서 처음 한 번만 잠깐 보여 주고 접는다(7초). 칩을 눌러 다시 확인하면
 *    그 결과를 한 번 더 보여 준다. 권한 창은 칩을 누를 때만 다시 뜬다.
 *  - 인증이 안 된 채 끝내면 점수·평균은 그대로, 도장만 흐린 '기록 도장'이 된다는 걸 그 한 줄이 말한다.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { OnSiteView } from "../../hooks/useOnSiteCheckin";
import { whyLine } from "../../lib/onSiteText";

const seenKey = (matchId: string) => `rankue_onsite_hint_${matchId}`;

export function OnSiteChip({ matchId, view, onRetry, manualAt }: { matchId: string; view: OnSiteView; onRetry: () => void; manualAt: number }) {
    const line = whyLine(view);
    const [open, setOpen] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastManual = useRef(0);

    // 한 줄 이유: 이 경기에서 처음 한 번(세션 저장소) + 칩을 눌러 다시 확인한 결과가 나왔을 때
    useEffect(() => {
        if (!line) { setOpen(false); return; }
        let seen = false;
        try { seen = sessionStorage.getItem(seenKey(matchId)) === "1"; } catch { /* 저장소를 못 쓰는 환경 */ }
        const manual = manualAt > lastManual.current;
        if (seen && !manual) return;
        lastManual.current = manualAt;
        try { sessionStorage.setItem(seenKey(matchId), "1"); } catch { /* 무시 */ }
        setOpen(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setOpen(false), 7000);
    }, [line, matchId, manualAt]);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const base = "h-7 px-2.5 rounded-full inline-flex items-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap";
    let chip: React.ReactNode;
    if (view.kind === "verified") {
        chip = (
            <span className={cn(base, "bg-[#64DD171F] text-[#9BEF5C]")} title={view.byCompanion ? "동반자 위치로 인증됐어요" : "골프장 2km 안에서 확인됐어요"}>
                <span aria-hidden="true">📍</span>현장 인증됨
            </span>
        );
    } else if (view.kind === "checking") {
        chip = (
            <span className={cn(base, "bg-[#FFFFFF0F] text-[#FFFFFFA6]")} role="status">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FFFFFF8C] animate-pulse" aria-hidden="true" />위치 확인 중
            </span>
        );
    } else if (view.kind === "no-course") {
        chip = (
            <button type="button" onClick={() => setOpen((o) => !o)} className={cn(base, "bg-[#FFFFFF0A] text-[#FFFFFF8C]")}>
                현장 인증 불가
            </button>
        );
    } else {
        chip = (
            <button type="button" onClick={onRetry} className={cn(base, "bg-[#FFFFFF0F] text-[#FFFFFFCC] active:bg-[#FFFFFF1A]")} aria-describedby={open ? `onsite-why-${matchId}` : undefined}>
                <span className="w-1.5 h-1.5 rounded-full bg-[#FFC43D]" aria-hidden="true" />
                현장 인증 안 됨 · <span className="text-[#ffffff] font-semibold">다시 확인</span>
            </button>
        );
    }

    return (
        <div className="relative flex items-center">
            {chip}
            {open && line && (
                <p
                    id={`onsite-why-${matchId}`}
                    role="status"
                    onClick={() => setOpen(false)}
                    className="absolute left-0 top-full mt-1.5 z-30 w-[min(340px,calc(100vw-32px))] rounded-xl bg-[#1B1B1B] ring-1 ring-inset ring-[#FFFFFF1A] px-3 py-2 text-[12.5px] leading-snug text-[#FFFFFFCC] shadow-lg shadow-[#00000080] break-keep"
                >
                    {line}
                </p>
            )}
        </div>
    );
}
