/**
 * 필드 골프 연습장(/golf/range) — 3주차 게이트 화면(오너가 "진짜 같은가" 판정).
 * v0.3 레이아웃(오너 피드백 2026-09-15): 클럽은 오른쪽 세로 바, 조준은 스크롤 띠(끌기·휠), 컨택은 당구 당점처럼 공 위에서 고르고,
 * 스윙 패드는 파워 당김 → 왕복 바늘 → 탭. 화면 그림은 코드로(이미지는 마지막 단계). 데스크톱에서도 폰 폭 한 칸.
 * 물리는 shared/golf/field(결정론). 화면은 프레임(120 Hz)을 실시간으로 재생만 한다.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE, type WheelEvent as RWE } from "react";
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
import { ContactPicker, type ContactPoint } from "./ContactPicker";

const CLUB_LIST: ClubId[] = ["D", "3W", "5I", "7I", "9I", "PW", "SW"];
// 스탠스 = 스윙 패스. 드라이버 3° 면 축 14°·옆 30 m(큰 페이드), 1.5° 가 투어 페이드 급. 엔진은 ±15° 까지 받는다
const STANCES: Array<{ key: number; label: string }> = [{ key: -30, label: "스탠스 ◀ 3°" }, { key: -15, label: "◀ 1.5°" }, { key: 0, label: "정면" }, { key: 15, label: "1.5° ▶" }, { key: 30, label: "3° ▶" }];
const TRAJ: Array<{ key: number; label: string }> = [{ key: -100, label: "공 뒤(펀치)" }, { key: 0, label: "보통" }, { key: 100, label: "공 앞(하이)" }];
const WINDS: Array<{ key: string; label: string; w: { x: number; y: number } }> = [
    { key: "calm", label: "무풍", w: { x: 0, y: 0 } }, { key: "side5", label: "옆바람 5", w: { x: 5, y: 0 } }, { key: "head5", label: "맞바람 5", w: { x: 0, y: -5 } }, { key: "tail5", label: "뒷바람 5", w: { x: 0, y: 5 } },
];
const CONTACT_KO: Record<string, string> = { pure: "정타", fat: "뒷땅", thin: "얇게", top: "탑", shank: "생크", sky: "스카이" };
const SHAPE_KO: Record<string, string> = { straight: "스트레이트", draw: "드로우", fade: "페이드", hook: "훅", slice: "슬라이스", pull: "풀", push: "푸시", pullhook: "풀훅", pushslice: "푸시슬라이스" };
const COLORS = ["#64DD17", "#7cc7ff", "#ffb84d", "#ff7ab6", "#c8a2ff", "#fff27a"];
const AIM_MAX = 30, AIM_STEP = 0.5, AIM_DEG_PER_PX = 0.12;

export default function RangePage() {
    const [, setLocation] = useLocation();
    const [club, setClub] = useState<ClubId>("7I");
    const [stance, setStance] = useState(0);     // stanceDeg10
    const [ballPos, setBallPos] = useState(0);
    const [preset, setPreset] = useState<Preset>("amateur");
    const [windKey, setWindKey] = useState("calm");
    const [aimDeg, setAimDeg] = useState(0);
    const [contact, setContact] = useState<ContactPoint>({ x: 0, y: 0 });
    const [shots, setShots] = useState<Shot[]>([]);
    const [live, setLive] = useState<{ shot: Shot; result: StrokeResult; input: StrokeInput } | null>(null);
    const [frame, setFrame] = useState(0);
    const [card, setCard] = useState<{ result: StrokeResult; input: StrokeInput; ghost: Float32Array } | null>(null);
    const [showGhost, setShowGhost] = useState(true);
    const rafRef = useRef(0);
    const [pullPower, setPullPower] = useState(0);   // 당기는 중 파워(0 = 안 당김)
    const aimDrag = useRef<{ x: number; a: number } | null>(null);

    const wind = WINDS.find((w) => w.key === windKey)!.w;
    const ctx: StrokeContext = useMemo(() => ({ hole: RANGE, preset, env: wind.x || wind.y ? steadyWind(wind) : NO_WIND, stimp: 10 }), [preset, wind]);
    const zoneMs = zoneMsFor(club, "tee", 100, stance, ballPos);
    const teed = !CLUBS[club].iron;
    // 파워별 예상 착지(퍼펙트 임팩트·현재 바람·조준) — 20..115 % 를 5 % 간격으로 미리 돌려 두고, 당기는 동안 링이 따라간다
    const carryByPower = useMemo(() => {
        const m = new Map<number, { x: number; y: number; carry: number }>();
        for (let p = 20; p <= 115; p += 5) {
            const inp: StrokeInput = { club, aimDeg10: Math.round(aimDeg * 10), stanceDeg10: stance, powerPct: p, ballPos, impactMs: 0, padX: 0, tapX: 0, tapY: 0, mode: 0 };
            const res = simulateStroke({ x: RANGE.tee.x, y: RANGE.tee.y, z: 0 }, inp, ctx);
            const land = res.events.find((e) => e.kind === "land");
            m.set(p, { x: land ? land.p.x : res.final.p.x, y: land ? land.p.y : res.final.p.y, carry: res.carryM });
        }
        return m;
    }, [club, aimDeg, stance, ballPos, ctx]);
    const ringPower = pullPower >= 20 ? Math.min(115, Math.round(pullPower / 5) * 5) : 100;
    const ring = carryByPower.get(ringPower) ?? { x: 0, y: nominalCarryM(club, preset), carry: nominalCarryM(club, preset) };

    const clampAim = (a: number) => Math.max(-AIM_MAX, Math.min(AIM_MAX, Math.round(a / AIM_STEP) * AIM_STEP));
    const onAimDown = (e: RPE) => { aimDrag.current = { x: e.clientX, a: aimDeg }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
    const onAimMove = (e: RPE) => { if (!aimDrag.current) return; setAimDeg(clampAim(aimDrag.current.a + (e.clientX - aimDrag.current.x) * AIM_DEG_PER_PX)); };
    const onAimUp = () => { aimDrag.current = null; };
    const onFieldWheel = (e: RWE) => { const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (d) setAimDeg((a) => clampAim(a + Math.sign(d) * AIM_STEP)); };

    const shoot = (r: SwingResult) => {
        const input: StrokeInput = { club, aimDeg10: Math.round(aimDeg * 10), stanceDeg10: stance, powerPct: r.powerPct, ballPos, impactMs: r.impactMs, padX: r.padX, tapX: r.tapX, tapY: r.tapY, mode: 0 };
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
    const chip = (active: boolean) => cn("shrink-0 h-7 px-2.5 rounded-full", active ? "bg-[#ffffff] text-[#000000]" : "bg-white/[0.06] text-white/60");

    return (
        <div className="h-[100dvh] bg-[#0A0A0A] text-white flex justify-center font-sans overflow-hidden" style={{ overscrollBehavior: "none" }}>
            <div className="w-full max-w-[520px] flex flex-col min-h-0">
                {/* 상단 */}
                <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                    <button onClick={() => setLocation("/golf/arcade")} className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0" aria-label="뒤로"><LucideChevronLeft className="w-5 h-5" /></button>
                    <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-extrabold leading-tight">필드 골프 연습장 <span className="text-[10px] font-bold text-[#64DD17] align-middle">ENGINE 0.3</span></div>
                        <div className="text-[10.5px] text-white/40 leading-tight truncate">{CLUBS[club].id} · {preset === "pro" ? "프로" : "아마"} · 창 ±{Math.round(zoneMs)} ms · 조준 {aimDeg > 0 ? "+" : ""}{aimDeg}°</div>
                    </div>
                    {shots.length > 0 && <button onClick={() => { setShots([]); setCard(null); }} className="shrink-0 h-8 px-2.5 rounded-full bg-white/[0.06] text-[11px] font-bold text-white/50">지우기 {shots.length}</button>}
                    <button onClick={() => setPreset((p) => (p === "pro" ? "amateur" : "pro"))} className="shrink-0 h-8 px-2.5 rounded-full bg-white/[0.06] text-[11px] font-bold text-white/70">{preset === "pro" ? "프로" : "아마"}</button>
                </div>
                {/* 옵션 줄: 스탠스·볼포지션·바람 */}
                <div className="flex items-center gap-1 px-3 pb-1 overflow-x-auto scrollbar-hide text-[11.5px] font-bold">
                    {STANCES.map((s) => <button key={s.key} onClick={() => setStance(s.key)} className={chip(stance === s.key)}>{s.label}</button>)}
                    <span className="w-px h-4 bg-white/10 mx-0.5" />
                    {TRAJ.map((s) => <button key={s.key} onClick={() => setBallPos(s.key)} className={chip(ballPos === s.key)}>{s.label}</button>)}
                    <span className="w-px h-4 bg-white/10 mx-0.5" />
                    {WINDS.map((w) => <button key={w.key} onClick={() => setWindKey(w.key)} className={chip(windKey === w.key)}>{w.label}</button>)}
                </div>

                {/* 필드 + 오른쪽 클럽 바. 휠/트랙패드 스크롤 = 조준 */}
                <div className="flex-1 min-h-0 px-3 relative" onWheel={onFieldWheel}>
                    <FieldCanvas hole={RANGE} viewLenM={330} shots={shots} live={live?.shot ?? null} frameIndex={frame} ghost={card && showGhost ? card.ghost : null} aimDeg={aimDeg} carryRing={live ? null : { x: ring.x, y: ring.y, label: `${Math.round(ring.carry)} m${pullPower >= 20 ? ` · ${ringPower} %` : ""}` }} windArrow={wind} />
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 flex flex-col gap-[3px] p-[3px] rounded-xl bg-black/45 backdrop-blur-sm">
                        {CLUB_LIST.map((c) => (
                            <button key={c} onClick={() => setClub(c)} className={cn("w-[46px] h-[32px] rounded-lg flex flex-col items-center justify-center leading-none", club === c ? "bg-[#64DD17] text-[#051907]" : "text-white/75")}>
                                <span className="text-[12px] font-extrabold">{c}</span>
                                <span className={cn("text-[9px] font-bold tabular-nums", club === c ? "text-[#051907]/70" : "text-white/40")}>{nominalCarryM(c, preset)}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 조준 스크롤 띠 */}
                <div className="px-3 pt-1.5">
                    <div className="relative h-8 rounded-full bg-white/[0.05] touch-none select-none overflow-hidden" onPointerDown={onAimDown} onPointerMove={onAimMove} onPointerUp={onAimUp} onPointerCancel={onAimUp}>
                        {Array.from({ length: 13 }, (_, i) => -30 + i * 5).map((deg) => (
                            <div key={deg} className={cn("absolute top-1/2 -translate-y-1/2 w-px", deg === 0 ? "h-4 bg-white/60" : "h-2 bg-white/20")} style={{ left: `${((deg + AIM_MAX) / (AIM_MAX * 2)) * 100}%` }} />
                        ))}
                        <div className="absolute top-0 bottom-0 w-[3px] rounded-full bg-[#64DD17] shadow-[0_0_8px_rgba(100,221,23,0.8)]" style={{ left: `calc(${((aimDeg + AIM_MAX) / (AIM_MAX * 2)) * 100}% - 1px)` }} />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/40">◀ 끌어서 조준</div>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-extrabold tabular-nums text-white/80">{aimDeg > 0 ? "+" : ""}{aimDeg}°</div>
                    </div>
                </div>

                {/* 하단: 당점 + 스윙 패드. 샷 카드가 이 자리를 덮는다(필드의 착지점·점선을 가리지 않게), 탭하면 다음 샷 */}
                <div className="h-[32%] min-h-[176px] px-3 pb-3 pt-2 relative flex gap-2 items-stretch">
                    <ContactPicker value={contact} onChange={setContact} teed={teed} disabled={!!live} />
                    <div className="flex-1 min-w-0">
                        <SwingPad zoneMs={zoneMs} sweepMs={CLUBS[club].sweepMs} contact={contact} teed={teed} disabled={!!live} onShot={shoot} onPower={setPullPower} />
                    </div>
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
                                    <Stat k="컨택" v={Math.abs(d.strikeHighCm) < 0.05 && d.toeHeelCm === 0 ? "중앙" : `${d.strikeHighCm > 0 ? (teed ? "위" : "잔디") : "공 위"} ${Math.abs(d.strikeHighCm).toFixed(1)}${d.toeHeelCm ? ` ${d.toeHeelCm > 0 ? "토" : "힐"}` : ""}`} />
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
    if (d.contact === "fat") return "뒷땅 — 당점이 공 아래 잔디였어요. 당점을 가운데로.";
    if (d.contact === "thin") return "얇게 — 당점이 공 윗부분(리딩엣지)이었어요. 조금만 아래를.";
    if (d.contact === "top") return "탑 — 당점이 공 꼭대기였어요. 가운데를 노리세요.";
    if (d.contact === "sky") return "스카이 — 당점이 티 쪽이라 크라운에 맞았어요.";
    if (d.contact === "shank") return "생크 — 당점이 힐 끝(호젤)이었어요.";
    const openClosed = d.faceDeg > 1.5 ? "몸이 먼저 돌아 페이스가 열렸어요(늦은 탭)" : d.faceDeg < -1.5 ? "손이 먼저 돌아 페이스가 닫혔어요(이른 탭)" : "";
    if (openClosed && Math.abs(r.final.p.x) > 10) return `${openClosed}. 구질은 페이스 − 패스(스탠스) 차이에서 나요.`;
    if (Math.abs(d.pathDeg - d.stanceDeg) > 1.5 && Math.abs(d.faceDeg) < 1) return "방향은 패드를 놓을 때 흘린 손 때문 — 곧게 위아래로.";
    if (Math.abs(d.tNorm) <= 0.33 && Math.abs(d.strikeHighCm) < 0.5) return d.stanceDeg !== 0 ? "퍼펙트. 스탠스대로 만든 구질이에요." : "퍼펙트. 스퀘어 페이스에 정타.";
    return "살짝 어긋난 타이밍·당점이 구질과 거리를 만들었어요 — 카드의 페이스·컨택을 보세요.";
}
