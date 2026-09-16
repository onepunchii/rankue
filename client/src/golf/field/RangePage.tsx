/**
 * 필드 골프 연습장(/golf/range) — 3주차 게이트 화면(오너가 "진짜 같은가" 판정).
 * v0.3 레이아웃(오너 피드백 2026-09-15): 클럽은 오른쪽 세로 바, 조준은 스크롤 띠(끌기·휠), 컨택은 당구 당점처럼 공 위에서 고르고,
 * 스윙 패드는 파워 당김 → 왕복 바늘 → 탭. 화면 그림은 코드로(이미지는 마지막 단계). 데스크톱에서도 폰 폭 한 칸.
 * 물리는 shared/golf/field(결정론). 화면은 프레임(120 Hz)을 실시간으로 재생만 한다.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE, type WheelEvent as RWE } from "react";
import { useLocation } from "wouter";
import { LucideChevronLeft, LucideSettings2, LucideX } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLUBS, nominalCarryM } from "@shared/golf/field/clubs";
import { RANGE } from "@shared/golf/field/course";
import { zoneMsFor } from "@shared/golf/field/impact";
import { perfectInput, simulateStroke, type StrokeContext } from "@shared/golf/field/stroke";
import { steadyWind, NO_WIND } from "@shared/golf/field/wind";
import type { ClubId, Preset, StrokeInput, StrokeResult } from "@shared/golf/field/types";
import { FieldCanvas, type Shot } from "./FieldCanvas";
import { GradeFlash, FlightPill, ResultBar, verdictOf, type Verdict } from "./ShotHud";
import { ArcSwing, type SwingResult } from "./ArcSwing";

const CLUB_LIST: ClubId[] = ["D", "3W", "5I", "7I", "9I", "PW", "SW"];
// 스탠스 = 스윙 패스. 드라이버 3° 면 축 14°·옆 30 m(큰 페이드), 1.5° 가 투어 페이드 급. 엔진은 ±15° 까지 받는다
const TRAJ: Array<{ key: number; label: string }> = [{ key: -100, label: "공 뒤(펀치)" }, { key: 0, label: "보통" }, { key: 100, label: "공 앞(하이)" }];
const WINDS: Array<{ key: string; label: string; w: { x: number; y: number } }> = [
    { key: "calm", label: "무풍", w: { x: 0, y: 0 } }, { key: "side5", label: "옆바람 5", w: { x: 5, y: 0 } }, { key: "head5", label: "맞바람 5", w: { x: 0, y: -5 } }, { key: "tail5", label: "뒷바람 5", w: { x: 0, y: 5 } },
];
const PRESET_KO: Record<Preset, string> = { pro: "프로(PGA)", amateur: "아마 0.88", lpga: "여자 프로", ama15: "아마 15핸디" };
const COLORS = ["#64DD17", "#7cc7ff", "#ffb84d", "#ff7ab6", "#c8a2ff", "#fff27a"];
const AIM_MAX = 30, AIM_STEP = 0.5, AIM_DEG_PER_PX = 0.12;

export default function RangePage() {
    const [, setLocation] = useLocation();
    const [club, setClub] = useState<ClubId>("7I");
    const [ballPos, setBallPos] = useState(0);
    const [preset, setPreset] = useState<Preset>("amateur");
    const [windKey, setWindKey] = useState("calm");
    const [aimDeg, setAimDeg] = useState(0);
    const [shots, setShots] = useState<Shot[]>([]);
    const [live, setLive] = useState<{ shot: Shot; result: StrokeResult; input: StrokeInput; verdict: Verdict } | null>(null);
    const [frame, setFrame] = useState(0);
    const [card, setCard] = useState<{ result: StrokeResult; input: StrokeInput; ghost: Float32Array; verdict: Verdict; noTap: boolean } | null>(null);
    const [showOpts, setShowOpts] = useState(false);
    const [flash, setFlash] = useState<Verdict | null>(null);
    const [expanded, setExpanded] = useState(false);
    const rafRef = useRef(0);
    const [pullPower, setPullPower] = useState(0);   // 당기는 중 파워(0 = 안 당김)
    const [pullShape, setPullShape] = useState(0);  // 당기는 중 스탠스(아크 스윙)
    const aimDrag = useRef<{ x: number; a: number } | null>(null);

    const wind = WINDS.find((w) => w.key === windKey)!.w;
    const ctx: StrokeContext = useMemo(() => ({ hole: RANGE, preset, env: wind.x || wind.y ? steadyWind(wind) : NO_WIND, stimp: 10 }), [preset, wind]);
    const aimStance = pullShape;   // 끌면서 정한 드로우/페이드가 곧 스탠스다
    const zoneMs = zoneMsFor(club, "tee", 100, aimStance, ballPos);
    const teed = !CLUBS[club].iron;

    // 파워별 예상 착지(퍼펙트 임팩트·현재 바람·조준) — 20..115 % 를 5 % 간격으로 미리 돌려 두고, 당기는 동안 링이 따라간다
    const carryByPower = useMemo(() => {
        const m = new Map<number, { x: number; y: number; carry: number }>();
        for (let p = 20; p <= 115; p += 5) {
            const inp: StrokeInput = { club, aimDeg10: Math.round(aimDeg * 10), stanceDeg10: aimStance, powerPct: p, ballPos, impactMs: 0, padX: 0, tapX: 0, tapY: 0, mode: 0 };
            const res = simulateStroke({ x: RANGE.tee.x, y: RANGE.tee.y, z: 0 }, inp, ctx);
            const land = res.events.find((e) => e.kind === "land");
            m.set(p, { x: land ? land.p.x : res.final.p.x, y: land ? land.p.y : res.final.p.y, carry: res.carryM });
        }
        return m;
    }, [club, aimDeg, aimStance, ballPos, ctx]);
    /**
     * 화면 배율 — 그 클럽·바람에서 풀파워로 칠 때의 착지점이 화면 위쪽(상단 HUD 아래)에 들어오도록 맞춘다.
     * 티가 화면 아래 290 px, 위쪽 150 px 는 헤더·알약이 쓰므로 실제 쓸 수 있는 세로는 화면의 약 46 % — 그 역수가 2.2 다.
     * (오너 2026-09-16: 드라이버가 150 m 넘어가면 공이 안 보인다)
     */
    const viewLenM = useMemo(() => {
        let far = 0;
        for (const v of carryByPower.values()) far = Math.max(far, Math.sqrt(v.x * v.x + v.y * v.y));
        return Math.round(Math.min(600, Math.max(160, far * 1.15 * 2.2)) / 10) * 10;
    }, [carryByPower]);
    const ringPower = pullPower >= 20 ? Math.min(115, Math.round(pullPower / 5) * 5) : 100;
    const ring = carryByPower.get(ringPower) ?? { x: 0, y: nominalCarryM(club, preset), carry: nominalCarryM(club, preset) };

    const clampAim = (a: number) => Math.max(-AIM_MAX, Math.min(AIM_MAX, Math.round(a / AIM_STEP) * AIM_STEP));
    const onAimDown = (e: RPE) => { aimDrag.current = { x: e.clientX, a: aimDeg }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
    const onAimMove = (e: RPE) => { if (!aimDrag.current) return; setAimDeg(clampAim(aimDrag.current.a + (e.clientX - aimDrag.current.x) * AIM_DEG_PER_PX)); };
    const onAimUp = () => { aimDrag.current = null; };
    const onFieldWheel = (e: RWE) => { const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (d) setAimDeg((a) => clampAim(a + Math.sign(d) * AIM_STEP)); };

    const shoot = (r: SwingResult) => {
        const input: StrokeInput = { club, aimDeg10: Math.round(aimDeg * 10), stanceDeg10: r.stanceDeg10, powerPct: r.powerPct, ballPos, impactMs: r.impactMs, padX: r.padX, tapX: r.tapX, tapY: r.tapY, mode: 0 };
        let result: StrokeResult;
        try { result = simulateStroke({ x: RANGE.tee.x, y: RANGE.tee.y, z: 0 }, input, ctx); } catch (e) { console.warn("[range] 입력 거부", e); return; }
        const ghost = simulateStroke({ x: RANGE.tee.x, y: RANGE.tee.y, z: 0 }, perfectInput(input), ctx).frames;
        const land = result.events.find((e) => e.kind === "land");
        const shot: Shot = { frames: result.frames, landing: land ? { x: land.p.x, y: land.p.y } : null, rest: { x: result.final.p.x, y: result.final.p.y }, color: COLORS[shots.length % COLORS.length] };
        const verdict = verdictOf(result.diag, r.noTap);
        setCard(null); setExpanded(false); setLive({ shot, result, input, verdict }); setFrame(0); setPullPower(0); setPullShape(0);
        setFlash(verdict); window.setTimeout(() => setFlash(null), 900);
        // 실시간 재생(120 Hz 프레임 → 경과 시간으로 인덱스)
        const t0 = performance.now(); const n = result.frames.length / 3;
        cancelAnimationFrame(rafRef.current);
        const loop = () => {
            const i = Math.floor(((performance.now() - t0) / 1000) * 120);
            if (i >= n - 1) { setFrame(n - 1); setShots((s) => [...s, shot]); setLive(null); setCard({ result, input, ghost, verdict, noTap: r.noTap }); if (navigator.vibrate) navigator.vibrate(20); return; }
            setFrame(i); rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        if (navigator.vibrate) navigator.vibrate(verdict.grade === "miss" ? 40 : 12);
    };
    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

    const d = card?.result.diag;
    const r = card?.result;
    // 재생 중인 프레임에서 티로부터의 거리(판정 패널에 흐르는 숫자)
    const liveDist = useMemo(() => {
        if (!live) return 0;
        const f = live.shot.frames, i = Math.min(Math.max(0, frame), f.length / 3 - 1);
        const dx = f[i * 3] - RANGE.tee.x, dy = f[i * 3 + 1] - RANGE.tee.y;
        return Math.sqrt(dx * dx + dy * dy);
    }, [live, frame]);
    const chip = (active: boolean) => cn("shrink-0 h-7 px-2.5 rounded-full", active ? "bg-[#ffffff] text-[#000000]" : "bg-white/[0.06] text-white/60");

    // 링(공의 집) 은 화면 아래 215 px, 티 위의 공은 340 px. 조준 띠는 티 바로 위 — 끌기 영역과 안 겹친다
    // 조작은 반투명이라 필드 위에 겹쳐도 된다 — 티를 아래로 내려 앞쪽 시야를 넓힌다(오너 2026-09-16: 드라이버가 화면 밖으로 나간다)
    const HOME_BOTTOM = 190, TEE_BOTTOM = 290, AIM_BOTTOM = TEE_BOTTOM + 44;   // 조준 띠는 티 위(POWER 글자와 안 겹치게)

    return (
        <div className="h-[100dvh] bg-[#0A0A0A] text-white font-sans overflow-hidden flex justify-center" style={{ overscrollBehavior: "none" }}>
            <div className="relative w-full max-w-[520px] h-full overflow-hidden">
                {/* 필드 — 전체 화면. 휠/트랙패드 스크롤 = 조준 */}
                <div className="absolute inset-0" onWheel={onFieldWheel}>
                    <FieldCanvas
                        hole={RANGE} viewLenM={viewLenM} shots={shots} live={live?.shot ?? null} frameIndex={frame}
                        ghost={card ? card.ghost : null} aimDeg={aimDeg}
                        carryRing={live ? null : { x: ring.x, y: ring.y, label: `${Math.round(ring.carry)} m${pullPower >= 20 ? ` · ${ringPower} %` : ""}` }}
                        windArrow={wind} teeBottomPx={TEE_BOTTOM} radius={0}
                    />
                </div>

                {/* 상단 바 */}
                <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-3 pt-3 pb-4 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0) 100%)", paddingBottom: 26 }}>
                    <button onClick={() => setLocation("/golf/arcade")} className="pointer-events-auto w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center shrink-0" style={{ background: "rgba(8,10,8,0.55)" }} aria-label="뒤로"><LucideChevronLeft className="w-5 h-5" /></button>
                    <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-extrabold leading-tight drop-shadow">필드 골프 연습장 <span className="text-[10px] font-bold text-[#64DD17] align-middle">ENGINE 0.3</span></div>
                        <div className="text-[10.5px] text-white/60 leading-tight truncate drop-shadow">{CLUBS[club].id} · {PRESET_KO[preset]} · {`창 ±${Math.round(zoneMs)} ms · ${viewLenM} m`}{aimStance ? ` · ${aimStance > 0 ? "드로우" : "페이드"} ${Math.abs(aimStance / 10).toFixed(1)}°` : ""} · {WINDS.find((w) => w.key === windKey)!.label}</div>
                    </div>
                    {shots.length > 0 && <button onClick={() => { setShots([]); setCard(null); }} className="pointer-events-auto shrink-0 h-8 px-2.5 rounded-full backdrop-blur-sm text-[11px] font-bold text-white/70" style={{ background: "rgba(8,10,8,0.55)" }}>지우기 {shots.length}</button>}
                    <button onClick={() => setShowOpts(true)} className="pointer-events-auto shrink-0 w-8 h-8 rounded-full backdrop-blur-sm text-white/70 flex items-center justify-center" style={{ background: "rgba(8,10,8,0.55)" }} aria-label="연습장 설정"><LucideSettings2 className="w-4 h-4" /></button>
                </div>


                {/* 클럽 바 */}
                <div className="absolute right-3 flex flex-col gap-[3px] p-[3px] rounded-xl bg-black/50 backdrop-blur-sm" style={{ top: 92 }}>
                    {CLUB_LIST.map((c) => (
                        <button key={c} onClick={() => setClub(c)} className={cn("w-[46px] h-[32px] rounded-lg flex flex-col items-center justify-center leading-none", club === c ? "bg-[#64DD17] text-[#051907]" : "text-white/80")}>
                            <span className="text-[12px] font-extrabold">{c}</span>
                            <span className={cn("text-[9px] font-bold tabular-nums", club === c ? "text-[#051907]/70" : "text-white/45")}>{nominalCarryM(c, preset)}</span>
                        </button>
                    ))}
                </div>

                {/* 스윙 조작 — 화면 전체 오버레이(아크는 위, 큰 공은 아래) */}
                {!live && !card && (
                    <ArcSwing club={club} ballPos={ballPos} teeBottomPx={TEE_BOTTOM} homeBottomPx={HOME_BOTTOM} onShot={shoot} onAim={(p, sh) => { setPullPower(p); setPullShape(sh); }} />
                )}

                {/* 조준 띠 — 칠 때는 사라진다(필드를 가리지 않게) */}
                {!live && !card && (
                    <div className="absolute inset-x-3" style={{ bottom: AIM_BOTTOM }}>
                        <div className="relative h-8 rounded-full backdrop-blur-sm touch-none select-none overflow-hidden" style={{ background: "rgba(8,10,8,0.55)" }} onPointerDown={onAimDown} onPointerMove={onAimMove} onPointerUp={onAimUp} onPointerCancel={onAimUp}>
                            {Array.from({ length: 13 }, (_, i) => -30 + i * 5).map((deg) => (
                                <div key={deg} className={cn("absolute top-1/2 -translate-y-1/2 w-px", deg === 0 ? "h-4 bg-white/60" : "h-2 bg-white/25")} style={{ left: `${((deg + AIM_MAX) / (AIM_MAX * 2)) * 100}%` }} />
                            ))}
                            <div className="absolute top-0 bottom-0 w-[3px] rounded-full bg-[#64DD17] shadow-[0_0_8px_rgba(100,221,23,0.8)]" style={{ left: `calc(${((aimDeg + AIM_MAX) / (AIM_MAX * 2)) * 100}% - 1px)` }} />
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/45">◀ 끌어서 조준</div>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-extrabold tabular-nums text-white/85">{aimDeg > 0 ? "+" : ""}{aimDeg}°</div>
                        </div>
                    </div>
                )}

                {/* 샷 HUD — 필드를 가리지 않는다 */}
                {flash && <GradeFlash verdict={flash} />}
                {live && <FlightPill verdict={live.verdict} diag={live.result.diag} sweepMs={CLUBS[club].sweepMs} distM={liveDist} />}
                {card && (
                    <ResultBar verdict={card.verdict} result={card.result} input={card.input} expanded={expanded}
                        onToggle={() => setExpanded((v) => !v)} onNext={() => { setCard(null); setExpanded(false); }} />
                )}
            </div>

            {/* 연습장 설정 — 매 샷 만지지 않는 것들 */}
            {showOpts && (
                <div className="absolute inset-0 z-20 bg-black/60 flex items-end justify-center" onPointerDown={() => setShowOpts(false)}>
                    <div className="w-full max-w-[520px] rounded-t-3xl bg-[#141414] border-t border-white/10 p-4 pb-6" onPointerDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-[14px] font-extrabold">연습장 설정</div>
                            <button onClick={() => setShowOpts(false)} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center" aria-label="닫기"><LucideX className="w-4 h-4" /></button>
                        </div>
                        <Opt label="바람">{WINDS.map((w) => <button key={w.key} onClick={() => setWindKey(w.key)} className={chip(windKey === w.key)}>{w.label}</button>)}</Opt>
                        <Opt label="볼 포지션">{TRAJ.map((s) => <button key={s.key} onClick={() => setBallPos(s.key)} className={chip(ballPos === s.key)}>{s.label}</button>)}</Opt>
                        <Opt label="실력">{(["pro", "amateur", "lpga", "ama15"] as Preset[]).map((p) => <button key={p} onClick={() => setPreset(p)} className={chip(preset === p)}>{PRESET_KO[p]}</button>)}</Opt>
                    </div>
                </div>
            )}
        </div>
    );
}

function Opt({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="mb-3">
            <div className="text-[10.5px] font-bold text-white/35 mb-1">{label}</div>
            <div className="flex flex-wrap gap-1 text-[11.5px] font-bold">{children}</div>
        </div>
    );
}
