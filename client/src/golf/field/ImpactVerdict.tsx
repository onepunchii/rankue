/**
 * 임팩트 판정 표시(오너 피드백 2026-09-15: "바로 없어져서 내가 적당한 타이밍에 했나 헷갈림").
 * 탭한 순간부터 공이 멈출 때까지 스윙 패드 자리에 남는다 — 멈춘 임팩트 바(내가 친 자리 마커) + 등급 + 이유 + 날아가는 거리.
 */
import { cn } from "@/lib/utils";
import type { ImpactDiag } from "@shared/golf/field/types";

export type Grade = "perfect" | "great" | "good" | "miss";
export interface Verdict { grade: Grade; label: string; reason: string; color: string }

const CONTACT_KO: Record<string, string> = { pure: "정타", fat: "뒷땅", thin: "얇게", top: "탑", shank: "생크", sky: "스카이" };

/** 타이밍(창 대비)과 컨택을 합쳐 한 등급으로. 화면 어디서나 같은 규칙을 쓴다 */
export function verdictOf(d: ImpactDiag, noTap: boolean): Verdict {
    const at = Math.abs(d.tNorm);
    const early = d.tNorm < 0;
    const ms = Math.round(d.tNorm * d.zoneMs);
    const timing = at <= 0.33 ? "완벽한 타이밍" : `${Math.abs(ms)} ms ${early ? "이르게" : "늦게"}`;
    if (noTap) return { grade: "miss", label: "미스", reason: "타이밍을 놓쳤어요 · 얇게", color: "#ff7043" };
    if (d.contact !== "pure") return { grade: "miss", label: "미스", reason: `${CONTACT_KO[d.contact]} · ${timing}`, color: "#ff7043" };
    if (at <= 0.33) return { grade: "perfect", label: "퍼펙트", reason: `${timing} · 정타`, color: "#64DD17" };
    if (at <= 1) return { grade: "great", label: "굿샷", reason: `${timing} · 정타`, color: "#9ccc65" };
    if (at <= 1.6) return { grade: "good", label: "무난", reason: `${timing} · 페이스가 ${early ? "닫혔어요" : "열렸어요"}`, color: "#e0e0e0" };
    return { grade: "miss", label: "미스", reason: `${timing} · 페이스가 크게 ${early ? "닫힘" : "열림"}`, color: "#ff7043" };
}

interface Props {
    verdict: Verdict;
    diag: ImpactDiag;
    sweepMs: number;
    /** 날아가는 중 현재 거리(m) — 멈추면 총거리 */
    liveDistM: number;
    flying: boolean;
}

export function ImpactVerdict({ verdict, diag, sweepMs, liveDistM, flying }: Props) {
    const zoneFrac = Math.min(0.5, diag.zoneMs / sweepMs);
    const perfectFrac = zoneFrac * 0.33;
    const tapFrac = Math.max(0, Math.min(1, 0.5 + (diag.tNorm * diag.zoneMs) / sweepMs));
    return (
        <div className="absolute inset-0 rounded-[1.5rem] bg-[#101010] border border-white/10 flex flex-col items-center justify-center gap-2 px-4">
            {/* 내가 친 자리 */}
            <div className="relative w-[86%] h-8 rounded-lg bg-white/[0.07] overflow-hidden">
                <div className="absolute top-0 bottom-0 bg-[#64DD17]/20" style={{ left: `${(0.5 - zoneFrac) * 100}%`, width: `${zoneFrac * 200}%` }} />
                <div className="absolute top-0 bottom-0 bg-[#64DD17]/55" style={{ left: `${(0.5 - perfectFrac) * 100}%`, width: `${perfectFrac * 200}%` }} />
                <div className="absolute top-0 bottom-0 w-[2px] bg-white/40 left-1/2 -translate-x-1/2" />
                <div className="absolute top-0 bottom-0 w-[4px] rounded-full" style={{ left: `calc(${tapFrac * 100}% - 2px)`, background: verdict.color, boxShadow: `0 0 10px ${verdict.color}` }} />
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-white/35">이르게</div>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-white/35">늦게</div>
            </div>
            <div className="text-[26px] font-extrabold leading-none tracking-tight" style={{ color: verdict.color }}>{verdict.label}</div>
            <div className="text-[12px] font-bold text-white/60 text-center">{verdict.reason}</div>
            <div className="text-[13px] font-extrabold tabular-nums text-white/80">
                {liveDistM.toFixed(0)} m <span className="text-[10.5px] font-bold text-white/35">{flying ? "날아가는 중" : "총거리"}</span>
            </div>
            <div className={cn("text-[10px] font-bold text-white/25", flying ? "" : "opacity-0")}>공이 멈추면 샷 카드가 열립니다</div>
        </div>
    );
}
