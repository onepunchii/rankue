/**
 * 샷 HUD(오너 지정 2026-09-16 "완벽한 UX"). 필드를 가리지 않는 것이 원칙이다 — 공이 날아가는 동안엔 공을 봐야 한다.
 *
 *   1) 임팩트 순간   : 판정이 화면 가운데에서 크게 떴다가 0.9 초 만에 사라진다(퍼펙트·굿샷·무난·미스·헛스윙)
 *   2) 날아가는 동안 : 위쪽에 작은 알약 하나 — 흐르는 거리와 내가 친 자리(미니 창). 필드는 그대로 보인다
 *   3) 멈춘 뒤      : 아래에 한 줄짜리 결과 바(판정 · 캐리/총/옆). '자세히' 를 눌러야 전체 수치가 펼쳐진다
 *                     아무 데나 탭하면 걷히고 다음 샷
 */
import { cn } from "@/lib/utils";
import type { ImpactDiag, StrokeResult } from "@shared/golf/field/types";

export type Grade = "perfect" | "great" | "good" | "miss";
export interface Verdict { grade: Grade; label: string; reason: string; color: string }

const CONTACT_KO: Record<string, string> = { pure: "정타", fat: "뒷땅", thin: "얇게", top: "대가리", shank: "생크", sky: "스카이" };
const SHAPE_KO: Record<string, string> = { straight: "스트레이트", draw: "드로우", fade: "페이드", hook: "훅", slice: "슬라이스", pull: "풀", push: "푸시", pullhook: "풀훅", pushslice: "푸시슬라이스" };

/** 타이밍과 컨택을 합쳐 한 등급으로. 화면 어디서나 같은 규칙 */
export function verdictOf(d: ImpactDiag, noTap: boolean): Verdict {
    const at = Math.abs(d.tNorm);
    const early = d.tNorm < 0;
    const ms = Math.round(d.tNorm * d.zoneMs);
    const timing = at <= 0.33 ? "완벽한 타이밍" : `${Math.abs(ms)} ms ${early ? "빨리" : "늦게"}`;
    if (noTap) return { grade: "miss", label: "헛스윙", reason: "스윙을 놓쳤어요", color: "#ff7043" };
    if (d.contact !== "pure") return { grade: "miss", label: CONTACT_KO[d.contact], reason: timing, color: "#ff7043" };
    if (at <= 0.33) return { grade: "perfect", label: "퍼펙트", reason: "완벽한 타이밍 · 정타", color: "#64DD17" };
    if (at <= 1) return { grade: "great", label: "굿샷", reason: `${timing} · 정타`, color: "#9ccc65" };
    if (at <= 1.6) return { grade: "good", label: "무난", reason: `${timing} · 페이스가 ${early ? "닫혔어요" : "열렸어요"}`, color: "#ffffff" };
    return { grade: "miss", label: "미스", reason: `${timing} · 페이스가 크게 ${early ? "닫힘" : "열림"}`, color: "#ff7043" };
}

/** ① 임팩트 순간 — 가운데에서 크게 떴다 사라진다 */
export function GradeFlash({ verdict }: { verdict: Verdict }) {
    return (
        <div className="absolute inset-x-0 top-[34%] flex flex-col items-center pointer-events-none" style={{ animation: "rq-flash 900ms ease-out forwards" }}>
            <style>{`@keyframes rq-flash{0%{opacity:0;transform:scale(.72)}18%{opacity:1;transform:scale(1.06)}30%{transform:scale(1)}72%{opacity:1}100%{opacity:0;transform:scale(1.02)}}`}</style>
            <div className="text-[44px] font-extrabold leading-none tracking-tight" style={{ color: verdict.color, textShadow: "0 3px 14px rgba(0,0,0,0.75)" }}>{verdict.label}</div>
            <div className="mt-1 text-[12.5px] font-bold text-white/90" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>{verdict.reason}</div>
        </div>
    );
}

/** ② 날아가는 동안 — 위쪽 작은 알약(흐르는 거리 + 내가 친 자리) */
export function FlightPill({ verdict, diag, sweepMs, distM }: { verdict: Verdict; diag: ImpactDiag; sweepMs: number; distM: number }) {
    const zoneFrac = Math.min(0.46, diag.zoneMs / sweepMs);
    const tapFrac = Math.max(0.02, Math.min(0.98, 0.5 + (diag.tNorm * diag.zoneMs) / sweepMs));
    return (
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-3 h-9 rounded-full backdrop-blur-sm pointer-events-none" style={{ top: 96, background: "rgba(8,10,8,0.7)" }}>
            <span className="text-[12.5px] font-extrabold" style={{ color: verdict.color }}>{verdict.label}</span>
            <span className="relative w-16 h-2 rounded-full bg-white/15 overflow-hidden">
                <span className="absolute inset-y-0 bg-[#64DD17]/60" style={{ left: `${(0.5 - zoneFrac) * 100}%`, width: `${zoneFrac * 200}%` }} />
                <span className="absolute inset-y-0 w-[2px] rounded-full" style={{ left: `calc(${tapFrac * 100}% - 1px)`, background: verdict.color }} />
            </span>
            <span className="text-[13px] font-extrabold tabular-nums text-white">{distM.toFixed(0)}<span className="text-[10px] font-bold text-white/55"> m</span></span>
        </div>
    );
}

/** ③ 멈춘 뒤 — 한 줄 결과 바. '자세히' 로 펼친다 */
export function ResultBar({ verdict, result, input, expanded, onToggle, onNext }: {
    verdict: Verdict; result: StrokeResult; input: { powerPct: number; impactMs: number }; expanded: boolean; onToggle: () => void; onNext: () => void;
}) {
    const d = result.diag, r = result;
    return (
        <div className="absolute inset-x-2 bottom-2 rounded-2xl backdrop-blur-md border border-white/10 overflow-hidden" style={{ background: "rgba(8,10,8,0.82)" }} onPointerDown={onNext}>
            <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-[15px] font-extrabold shrink-0" style={{ color: verdict.color }}>{verdict.label}</span>
                <span className="text-[11.5px] font-bold text-white/55 shrink-0">{SHAPE_KO[d.shape]}</span>
                <span className="flex-1 text-right text-[12.5px] font-extrabold tabular-nums text-white">
                    <span className="text-[#64DD17]">{r.carryM.toFixed(0)}</span>
                    <span className="text-white/40"> + {(r.totalM - r.carryM).toFixed(0)} = </span>
                    <span className="text-[#64DD17]">{r.totalM.toFixed(0)}</span>
                    <span className="text-white/40 text-[10.5px]"> m</span>
                    <span className="text-white/55"> · {r.final.p.x >= 0 ? "우" : "좌"} {Math.abs(r.final.p.x).toFixed(0)}</span>
                </span>
                <button onPointerDown={(e) => { e.stopPropagation(); onToggle(); }} className="shrink-0 h-6 px-2 rounded-full bg-white/10 text-[10px] font-bold text-white/70">{expanded ? "접기" : "자세히"}</button>
            </div>
            {expanded && (
                <div className="px-3 pb-2.5" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="text-[11px] text-white/60 mb-1.5">{verdict.reason}</div>
                    <div className="text-[11px] text-[#9ccc65] mb-1.5">{tipFor(d)}</div>
                    <div className="grid grid-cols-4 gap-x-2 gap-y-1 tabular-nums">
                        <Stat k="임팩트" v={`${input.impactMs >= 0 ? "+" : ""}${input.impactMs} ms`} />
                        <Stat k="페이스" v={`${d.faceDeg >= 0 ? "+" : ""}${d.faceDeg.toFixed(1)}°`} />
                        <Stat k="패스" v={`${d.pathDeg >= 0 ? "+" : ""}${d.pathDeg.toFixed(1)}°`} />
                        <Stat k="컨택" v={CONTACT_KO[d.contact]} />
                        <Stat k="볼스피드" v={`${d.ballSpeed.toFixed(1)} m/s`} />
                        <Stat k="발사각" v={`${d.launchVDeg.toFixed(1)}°`} />
                        <Stat k="스핀" v={`${Math.round(d.spinRpm)}`} />
                        <Stat k="스핀축" v={`${d.tiltDeg >= 0 ? "+" : ""}${d.tiltDeg.toFixed(0)}°`} />
                    </div>
                    <div className="text-[10.5px] text-white/35 mt-1 tabular-nums">정점 {r.apexM.toFixed(0)} m · 체공 {r.airTime.toFixed(1)} s · 파워 {input.powerPct} % · 창 ±{Math.round(d.zoneMs)} ms</div>
                </div>
            )}
            <div className="absolute right-3 bottom-1 text-[9.5px] font-bold text-white/25">탭 = 다음 샷</div>
        </div>
    );
}

/** 한 줄 코치 — 무엇을 고치면 되는지만 */
function tipFor(d: ImpactDiag): string {
    if (d.contact === "fat") return "뒷땅 — 너무 늦었어요. 바늘이 창 가운데 올 때 바로 치세요.";
    if (d.contact === "top") return "대가리 — 너무 빨랐어요. 클럽이 아직 안 내려왔어요.";
    if (d.contact === "thin") return "얇게 — 조금 빨랐어요. 반 박자만 늦게.";
    if (d.contact === "sky") return "스카이 — 공 아래를 쳐서 크라운에 맞았어요.";
    if (d.contact === "shank") return "생크 — 호젤에 맞았어요.";
    if (Math.abs(d.tNorm) <= 0.33) return d.stanceDeg !== 0 ? "퍼펙트. 끌어서 정한 구질 그대로예요." : "퍼펙트. 스퀘어 페이스에 정타.";
    return d.faceDeg > 0 ? "늦어서 페이스가 열렸어요 — 오른쪽으로 휩니다." : "빨라서 페이스가 닫혔어요 — 왼쪽으로 휩니다.";
}

function Stat({ k, v }: { k: string; v: string }) {
    return (
        <div className="min-w-0">
            <div className="text-[9px] font-bold text-white/35 truncate">{k}</div>
            <div className={cn("text-[12px] font-extrabold truncate text-white")}>{v}</div>
        </div>
    );
}
