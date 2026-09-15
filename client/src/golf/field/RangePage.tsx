/**
 * 필드 골프 연습장(/golf/range) — 3주차 게이트 화면(오너가 "진짜 같은가" 판정).
 * 클럽·구질·탄도·프리셋·바람을 고르고 스윙 패드로 친다 → 2.5D 톱다운 비행 → 샷 카드(임팩트·페이스·패스·타점·구질·캐리/런) + "퍼펙트였다면" 점선.
 * 물리는 shared/golf/field(결정론). 화면은 프레임(120 Hz)을 실시간으로 재생만 한다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { LucideChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLUBS, nominalCarryM } from "@shared/golf/field/clubs";
import { RANGE } from "@shared/golf/field/course";
import { zoneMsFor } from "@shared/golf/field/impact";
import { perfectInput, simulateStroke, type StrokeContext } from "@shared/golf/field/stroke";
import { steadyWind, NO_WIND } from "@shared/golf/field/wind";
import type { ClubId, Preset, StrokeInput, StrokeResult } from "@shared/golf/field/types";
import { FieldCanvas, type Shot } from "./FieldCanvas";
import { SwingPad, type SwingResult } from "./SwingPad";

const CLUB_LIST: ClubId[] = ["D", "3W", "5I", "7I", "9I", "PW", "SW"];
const SHAPES: Array<{ key: number; label: string }> = [{ key: -70, label: "드로우" }, { key: 0, label: "직진" }, { key: 70, label: "페이드" }];
const TRAJ: Array<{ key: number; label: string }> = [{ key: -100, label: "펀치" }, { key: 0, label: "보통" }, { key: 100, label: "하이" }];
const WINDS: Array<{ key: string; label: string; w: { x: number; y: number } }> = [
    { key: "calm", label: "무풍", w: { x: 0, y: 0 } }, { key: "side5", label: "옆바람 5", w: { x: 5, y: 0 } }, { key: "head5", label: "맞바람 5", w: { x: 0, y: -5 } }, { key: "tail5", label: "뒷바람 5", w: { x: 0, y: 5 } },
];
const CONTACT_KO: Record<string, string> = { pure: "정타", fat: "뒷땅", thin: "얇게", top: "탑", shank: "생크" };
const SHAPE_KO: Record<string, string> = { straight: "스트레이트", draw: "드로우", fade: "페이드", hook: "훅", slice: "슬라이스", pull: "풀", push: "푸시", pullhook: "풀훅", pushslice: "푸시슬라이스" };
const COLORS = ["#64DD17", "#7cc7ff", "#ffb84d", "#ff7ab6", "#c8a2ff", "#fff27a"];

export default function RangePage() {
    const [, setLocation] = useLocation();
    const [club, setClub] = useState<ClubId>("7I");
    const [spinX, setSpinX] = useState(0);
    const [spinY, setSpinY] = useState(0);
    const [preset, setPreset] = useState<Preset>("amateur");
    const [windKey, setWindKey] = useState("calm");
    const [aimDeg, setAimDeg] = useState(0);
    const [shots, setShots] = useState<Shot[]>([]);
    const [live, setLive] = useState<{ shot: Shot; result: StrokeResult; input: StrokeInput } | null>(null);
    const [frame, setFrame] = useState(0);
    const [card, setCard] = useState<{ result: StrokeResult; input: StrokeInput; ghost: Float32Array } | null>(null);
    const [showGhost, setShowGhost] = useState(true);
    const rafRef = useRef(0);
    const [pullPower, setPullPower] = useState(0);   // 당기는 중 파워(0 = 안 당김)

    const wind = WINDS.find((w) => w.key === windKey)!.w;
    const ctx: StrokeContext = useMemo(() => ({ hole: RANGE, preset, env: wind.x || wind.y ? steadyWind(wind) : NO_WIND, stimp: 10 }), [preset, wind]);
    const zoneMs = zoneMsFor(club, "tee", 100, spinX, spinY);
    // 파워별 예상 캐리(퍼펙트 임팩트·현재 바람) — 20..115 % 를 5 % 간격으로 미리 돌려 두고, 당기는 동안 링이 따라간다
    const carryByPower = useMemo(() => {
        const m = new Map<number, { x: number; y: number; carry: number }>();
        for (let p = 20; p <= 115; p += 5) {
            const inp: StrokeInput = { club, aimDeg10: Math.round(aimDeg * 10), powerPct: p, spinX, spinY, impactMs: 0, padX: 0, tapX: 0, mode: 0 };
            const res = simulateStroke({ x: RANGE.tee.x, y: RANGE.tee.y, z: 0 }, inp, ctx);
            const land = res.events.find((e) => e.kind === "land");
            m.set(p, { x: land ? land.p.x : res.final.p.x, y: land ? land.p.y : res.final.p.y, carry: res.carryM });
        }
        return m;
    }, [club, aimDeg, spinX, spinY, ctx]);
    const ringPower = pullPower >= 20 ? Math.min(115, Math.round(pullPower / 5) * 5) : 100;
    const ring = carryByPower.get(ringPower) ?? { x: 0, y: nominalCarryM(club, preset), carry: nominalCarryM(club, preset) };

    const shoot = (r: SwingResult) => {
        const input: StrokeInput = { club, aimDeg10: Math.round(aimDeg * 10), powerPct: r.powerPct, spinX, spinY, impactMs: r.impactMs, padX: r.padX, tapX: r.tapX, mode: 0 };
        let result: StrokeResult;
        try { result = simulateStroke({ x: RANGE.tee.x, y: RANGE.tee.y, z: 0 }, input, ctx); } catch (e) { console.warn("[range] 입력 거부", e); return; }
        const ghost = simulateStroke({ x: RANGE.tee.x, y: RANGE.tee.y, z: 0 }, perfectInput(input), ctx).frames;
        const land = result.events.find((e) => e.kind === "land");
        const shot: Shot = { frames: result.frames, landing: land ? { x: land.p.x, y: land.p.y } : null, rest: { x: result.final.p.x, y: result.final.p.y }, color: COLORS[shots.length % COLORS.length] };
        setCard(null); setLive({ shot, result, input }); setFrame(0); setPullPower(0);
        // 실시간 재생(120 Hz 프레임 → 경과 시간으로 인덱스)
        const t0 = performance.now(); const n = result.frames.length / 3;
        cancelAnimationFrame(rafRef.current);
        const loop = () => {
            const i = Math.floor(((performance.now() - t0) / 1000) * 120);
            if (i >= n - 1) { setFrame(n - 1); setShots((s) => [...s, shot]); setLive(null); setCard({ result, input, ghost }); if (navigator.vibrate) navigator.vibrate(20); return; }
            setFrame(i); rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        if (navigator.vibrate) navigator.vibrate(result.diag.contact === "pure" ? 12 : 40);
    };
    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

    const d = card?.result.diag;
    const r = card?.result;

    return (
        <div className="h-[100dvh] bg-[#0A0A0A] text-white flex flex-col font-sans overflow-hidden" style={{ overscrollBehavior: "none" }}>
            {/* 상단: 뒤로 + 클럽 휠 */}
            <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                <button onClick={() => setLocation("/golf/arcade")} className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0" aria-label="뒤로"><LucideChevronLeft className="w-5 h-5" /></button>
                <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-hide">
                    {CLUB_LIST.map((c) => (
                        <button key={c} onClick={() => setClub(c)} className={cn("shrink-0 h-9 px-3 rounded-full text-[12.5px] font-extrabold tabular-nums", club === c ? "bg-[#64DD17] text-[#051907]" : "bg-white/[0.06] text-white/70")}>
                            {c} <span className={cn("text-[10px] font-bold", club === c ? "text-[#051907]/60" : "text-white/40")}>{nominalCarryM(c, preset)}</span>
                        </button>
                    ))}
                </div>
                <button onClick={() => setPreset((p) => (p === "pro" ? "amateur" : "pro"))} className="shrink-0 h-9 px-2.5 rounded-full bg-white/[0.06] text-[11px] font-bold text-white/70">{preset === "pro" ? "프로" : "아마"}</button>
            </div>
            {/* 옵션 줄: 구질·탄도·바람·조준 */}
            <div className="flex items-center gap-1 px-3 pb-1 overflow-x-auto scrollbar-hide text-[11.5px] font-bold">
                {SHAPES.map((s) => <button key={s.key} onClick={() => setSpinX(s.key)} className={cn("shrink-0 h-7 px-2.5 rounded-full", spinX === s.key ? "bg-white text-black" : "bg-white/[0.06] text-white/60")}>{s.label}</button>)}
                <span className="w-px h-4 bg-white/10 mx-0.5" />
                {TRAJ.map((s) => <button key={s.key} onClick={() => setSpinY(s.key)} className={cn("shrink-0 h-7 px-2.5 rounded-full", spinY === s.key ? "bg-white text-black" : "bg-white/[0.06] text-white/60")}>{s.label}</button>)}
                <span className="w-px h-4 bg-white/10 mx-0.5" />
                {WINDS.map((w) => <button key={w.key} onClick={() => setWindKey(w.key)} className={cn("shrink-0 h-7 px-2.5 rounded-full", windKey === w.key ? "bg-white text-black" : "bg-white/[0.06] text-white/60")}>{w.label}</button>)}
                <span className="w-px h-4 bg-white/10 mx-0.5" />
                <button onClick={() => setAimDeg((a) => Math.max(-30, a - 1))} className="shrink-0 h-7 px-2.5 rounded-full bg-white/[0.06] text-white/60">◀ 조준</button>
                <span className="shrink-0 tabular-nums text-white/60">{aimDeg > 0 ? "+" : ""}{aimDeg}°</span>
                <button onClick={() => setAimDeg((a) => Math.min(30, a + 1))} className="shrink-0 h-7 px-2.5 rounded-full bg-white/[0.06] text-white/60">조준 ▶</button>
                {shots.length > 0 && <button onClick={() => { setShots([]); setCard(null); }} className="shrink-0 h-7 px-2.5 rounded-full bg-white/[0.06] text-white/40">지우기({shots.length})</button>}
            </div>

            {/* 필드 */}
            <div className="flex-1 min-h-0 px-3 relative">
                <FieldCanvas hole={RANGE} viewLenM={330} shots={shots} live={live?.shot ?? null} frameIndex={frame} ghost={card && showGhost ? card.ghost : null} aimDeg={aimDeg} carryRing={live ? null : { x: ring.x, y: ring.y, label: `${Math.round(ring.carry)} m${pullPower >= 20 ? ` · ${ringPower} %` : ""}` }} windArrow={wind} />
            </div>

            {/* 스윙 패드 */}
            <div className="h-[30%] min-h-[150px] px-3 pb-3 pt-2 relative">
                <SwingPad zoneMs={zoneMs} sweepMs={CLUBS[club].sweepMs} disabled={!!live} onShot={shoot} onPower={setPullPower} />
                {/* 샷 카드 — 패드 자리에 덮인다(필드의 착지점·점선을 가리지 않게). 탭하면 걷히고 다음 샷 */}
                <div className={cn("absolute inset-x-3 top-2 bottom-3", card ? "" : "pointer-events-none")}>
                {card && d && r && (
                    <div className="absolute inset-0 rounded-[1.5rem] bg-[#121212] border border-white/10 p-3 text-[12px] overflow-hidden" onPointerDown={() => setCard(null)}>
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="text-[15px] font-extrabold">
                                <span className={cn(d.contact === "pure" ? "text-[#64DD17]" : "text-orange-300")}>{CONTACT_KO[d.contact]}</span>
                                <span className="text-white/70"> · {SHAPE_KO[d.shape]}</span>
                                {Math.abs(d.tNorm) <= 0.33 && d.contact === "pure" && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-[#64DD17] text-[#051907] text-[10px] font-extrabold">PERFECT</span>}
                            </div>
                            <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setShowGhost((v) => !v)} className={cn("h-6 px-2 rounded-full text-[10px] font-bold", showGhost ? "bg-white/20 text-white" : "bg-white/[0.06] text-white/40")}>퍼펙트였다면</button>
                        </div>
                        <div className="grid grid-cols-4 gap-x-2 gap-y-1 tabular-nums">
                            <Stat k="캐리" v={`${r.carryM.toFixed(0)} m`} hi />
                            <Stat k="런" v={`${(r.totalM - r.carryM).toFixed(0)} m`} />
                            <Stat k="총" v={`${r.totalM.toFixed(0)} m`} hi />
                            <Stat k="옆" v={`${r.final.p.x >= 0 ? "우" : "좌"} ${Math.abs(r.final.p.x).toFixed(0)} m`} />
                            <Stat k="임팩트" v={`${card.input.impactMs >= 0 ? "+" : ""}${card.input.impactMs} ms`} />
                            <Stat k="페이스" v={`${d.faceDeg >= 0 ? "+" : ""}${d.faceDeg.toFixed(1)}°`} />
                            <Stat k="패스" v={`${d.pathDeg >= 0 ? "+" : ""}${d.pathDeg.toFixed(1)}°`} />
                            <Stat k="타점" v={d.toeHeelCm === 0 ? "중앙" : `${d.toeHeelCm > 0 ? "토" : "힐"} ${Math.abs(d.toeHeelCm).toFixed(1)}cm`} />
                            <Stat k="볼스피드" v={`${d.ballSpeed.toFixed(1)} m/s`} />
                            <Stat k="발사각" v={`${d.launchVDeg.toFixed(1)}°`} />
                            <Stat k="스핀" v={`${Math.round(d.spinRpm)} rpm`} />
                            <Stat k="스핀축" v={`${d.tiltDeg >= 0 ? "+" : ""}${d.tiltDeg.toFixed(0)}°`} />
                        </div>
                        <div className="text-[10.5px] text-white/40 mt-1 tabular-nums">정점 {r.apexM.toFixed(0)} m · 체공 {r.airTime.toFixed(1)} s · 파워 {card.input.powerPct} % · 창 ±{Math.round(d.zoneMs)} ms</div>
                        <div className="text-[11px] text-white/60 mt-0.5 pr-24">{coaching(d, r)}</div>
                        <div className="absolute right-3 bottom-2 text-[10px] font-bold text-white/30">탭하면 다음 샷 ▶</div>
                    </div>
                )}
                </div>
            </div>
        </div>
    );
}

function Stat({ k, v, hi }: { k: string; v: string; hi?: boolean }) {
    return (
        <div className="min-w-0">
            <div className="text-[9.5px] font-bold text-white/40 truncate">{k}</div>
            <div className={cn("text-[12.5px] font-extrabold truncate", hi ? "text-[#64DD17]" : "text-white")}>{v}</div>
        </div>
    );
}

function coaching(d: StrokeResult["diag"], r: StrokeResult): string {
    if (d.contact === "fat") return "뒷땅 — 바늘이 가운데 오기 전에 탭했어요. 조금만 늦게.";
    if (d.contact === "thin" || d.contact === "top") return "얇게/탑 — 바늘이 지나간 뒤 탭했어요. 조금만 빨리.";
    if (d.contact === "shank") return "생크 — 아이언에서 너무 늦었어요. 바늘 가운데를 노리세요.";
    if (Math.abs(d.pathDeg) > 1.5 && Math.abs(d.faceDeg) < 1) return "방향은 패드를 놓을 때 흘린 손 때문 — 곧게 위아래로.";
    if (Math.abs(r.final.p.x) > 10) return "방향이 틀렸으면 임팩트(탭 시각)를, 거리가 틀렸으면 파워·라이를 보세요.";
    if (Math.abs(d.tNorm) <= 0.33) return "퍼펙트. 의도한 구질 그대로 나갔어요.";
    return "살짝 어긋난 타이밍이 구질을 만들었어요 — 카드의 페이스·스핀축을 보세요.";
}
