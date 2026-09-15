/**
 * 쓸기 스윙(오너 승인 2026-09-15) — 한 번의 연속 제스처가 세 축을 전부 '결과' 로 만든다. 메뉴에서 고르는 미스가 없다.
 *
 * 뒤에서 본 시점: 공이 가운데, 클럽은 오른쪽으로 갔다가(백스윙) 공을 지나 왼쪽으로 빠진다(다운스윙).
 *   1) 손가락을 대고 **오른쪽으로 당긴다** → 당긴 거리 = 파워(20~115 %)
 *   2) 떼지 않고 **왼쪽으로 쓸어 공을 지난다** → 공 중심선을 지나는 순간이 임팩트
 * 그 순간에 네 가지가 동시에 정해진다:
 *   · 지나는 높이           → 당점 세로(tapY): 공 중심 위 = 얇게·탑, 아래(잔디) = 뒷땅
 *   · 다운스윙에 걸린 시간  → 페이스(impactMs): 클럽 템포보다 **빠르면 몸이 먼저 = 열림(페이드·슬라이스)**,
 *                             느리면 손이 먼저 릴리즈 = 닫힘(드로우·훅). 오너가 말한 그 모델 그대로다
 *   · 지날 때의 경로 각도   → 패스 오차(padX): 가파르게 내려오며 지나면 아웃투인(오버더톱), 완만히 올라가면 인투아웃
 *   · 공을 못 지나고 떼면   → 헛스윙(noTap)
 * 힐·토(tapX)는 1차에서 0 — 한 제스처에 네 번째 축까지 얹으면 폰에서 정밀도가 안 나온다.
 */
import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { cn } from "@/lib/utils";
import { CLUBS } from "@shared/golf/field/clubs";
import { noTapInput } from "@shared/golf/field/impact";
import type { ClubId } from "@shared/golf/field/types";
import type { SwingResult } from "./SwingPad";

interface Props {
    club: ClubId;
    teed?: boolean;
    disabled?: boolean;
    onShot: (r: SwingResult) => void;
    onPower?: (powerPct: number) => void;
}

const MAX_PULL_PX = 150;      // 이만큼 오른쪽으로 당기면 100 %
const BALL_PX = 24;           // 공 반지름
const BALL_X_FRAC = 0.42;     // 공의 가로 위치(오른쪽에 백스윙 공간)
const REVERSE_PX = 8;         // 이만큼 되돌아오면 다운스윙 시작
const TEMPO_K = 0.5;          // 다운스윙 시간 오차 1 ms → 페이스 0.5 ms
const PATH_DEG_FULL = 25;     // 경로 각도 25° 면 패스 오차 100

/** 클럽별 이상적인 다운스윙 시간(ms) — 긴 채가 빠르다(투어 실측 250~350 ms 대) */
export function downswingMsFor(club: ClubId): number {
    return Math.round(CLUBS[club].sweepMs / 4);
}

interface Sample { x: number; y: number; t: number }

export function SwipeSwing({ club, teed, disabled, onShot, onPower }: Props) {
    const [phase, setPhase] = useState<"idle" | "back" | "down">("idle");
    const [power, setPower] = useState(0);
    const [trail, setTrail] = useState<Sample[]>([]);
    const boxRef = useRef<HTMLDivElement>(null);
    const startX = useRef(0);
    const maxX = useRef(0);
    const turnT = useRef(0);          // 다운스윙 시작 시각
    const samples = useRef<Sample[]>([]);
    const fired = useRef(false);
    const ballX = useRef(0);

    useEffect(() => { if (disabled) { setPhase("idle"); setTrail([]); } }, [disabled]);

    const geom = () => {
        const b = boxRef.current!.getBoundingClientRect();
        return { b, bx: b.left + b.width * BALL_X_FRAC, by: b.top + b.height * 0.5 };
    };

    const fire = (r: SwingResult) => { if (fired.current) return; fired.current = true; setPhase("idle"); setPower(0); setTrail([]); onPower?.(0); onShot(r); };

    const onDown = (e: RPE) => {
        if (disabled) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const { bx } = geom();
        ballX.current = bx;
        startX.current = e.clientX; maxX.current = e.clientX;
        samples.current = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
        fired.current = false;
        setPhase("back"); setPower(0); setTrail([]);
    };

    const onMove = (e: RPE) => {
        if (phase === "idle" || fired.current) return;
        const s: Sample = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        const prev = samples.current[samples.current.length - 1];
        samples.current.push(s);
        if (samples.current.length > 60) samples.current.shift();
        setTrail((t) => [...t.slice(-24), s]);

        if (phase === "back") {
            if (e.clientX > maxX.current) maxX.current = e.clientX;
            const p = Math.max(0, Math.min(115, Math.round(((maxX.current - startX.current) / MAX_PULL_PX) * 100)));
            setPower(p); onPower?.(p);
            if (maxX.current - e.clientX > REVERSE_PX) { turnT.current = e.timeStamp; setPhase("down"); }
            return;
        }
        // 다운스윙 — 공 중심선을 왼쪽으로 통과하는 순간이 임팩트
        if (prev && prev.x >= ballX.current && s.x < ballX.current) {
            const f = (prev.x - ballX.current) / Math.max(1e-6, prev.x - s.x);   // 통과 시점 보간
            const yCross = prev.y + (s.y - prev.y) * f;
            const tCross = prev.t + (s.t - prev.t) * f;
            const { by } = geom();
            const power100 = Math.max(0, Math.min(115, Math.round(((maxX.current - startX.current) / MAX_PULL_PX) * 100)));
            if (power100 < 20) { fire(missResult(club, 20)); return; }

            // 당점 세로: 공 중심 위 = +(얇게), 아래 = −(뒷땅). 1.5R 밖은 잘라낸다
            const tapY = Math.max(-100, Math.min(100, Math.round(((by - yCross) / (BALL_PX * 1.5)) * 100)));
            // 템포: 다운스윙이 짧을수록(빠를수록) 몸이 먼저 → 페이스 열림(+)
            const downMs = tCross - turnT.current;
            const ideal = downswingMsFor(club);
            const impactMs = Math.max(-400, Math.min(400, Math.round((ideal - downMs) * TEMPO_K)));
            // 경로 각도: 최근 구간의 기울기. 내려오며 지나면(dy > 0) 아웃투인(−)
            const back = samples.current[Math.max(0, samples.current.length - 5)];
            const dx = Math.max(1e-6, back.x - s.x), dy = s.y - back.y;
            const slope = dy / dx;                                   // + 면 하강
            const padX = Math.max(-100, Math.min(100, Math.round((-slope * (180 / Math.PI) / PATH_DEG_FULL) * 100)));
            fire({ powerPct: power100, impactMs, padX, tapX: 0, tapY, noTap: false, tempoDevMs: Math.round(ideal - downMs) });
        }
    };

    const onUp = () => {
        if (fired.current || phase === "idle") { setPhase("idle"); setTrail([]); return; }
        const p = Math.max(0, Math.min(115, Math.round(((maxX.current - startX.current) / MAX_PULL_PX) * 100)));
        if (phase === "back" || p < 20) { setPhase("idle"); setPower(0); setTrail([]); onPower?.(0); return; }   // 백스윙만 하고 떼면 취소
        fire(missResult(club, p));   // 공을 못 지나고 뗐다 = 헛스윙
    };

    const pr = Math.min(1, power / 115);
    return (
        <div
            ref={boxRef}
            className={cn("relative select-none touch-none h-full w-full rounded-[1.5rem] overflow-hidden", disabled ? "opacity-40" : "")}
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02))", overscrollBehavior: "none" }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        >
            {/* 지면 */}
            <div className="absolute inset-x-0 bg-[#2f7a34]" style={{ top: `calc(50% + ${BALL_PX - (teed ? 1 : 3)}px)`, bottom: 0 }} />
            {teed && <div className="absolute w-[5px] rounded-b bg-white/60" style={{ left: `calc(${BALL_X_FRAC * 100}% - 2px)`, top: `calc(50% + ${BALL_PX - 2}px)`, height: BALL_PX * 0.8 }} />}
            {/* 스윙 길(안내) */}
            <div className="absolute left-0 right-0 border-t border-dashed border-white/15" style={{ top: "50%" }} />
            {/* 공 */}
            <div className="absolute rounded-full bg-[#ffffff] shadow-[inset_-6px_-6px_11px_rgba(0,0,0,0.26)]" style={{ left: `calc(${BALL_X_FRAC * 100}% - ${BALL_PX}px)`, top: `calc(50% - ${BALL_PX}px)`, width: BALL_PX * 2, height: BALL_PX * 2 }} />
            <div className="absolute w-[7px] h-[7px] rounded-full border-2 border-[#051907]/35" style={{ left: `calc(${BALL_X_FRAC * 100}% - 3.5px)`, top: "calc(50% - 3.5px)" }} />
            {/* 손가락 자취 */}
            {trail.map((s, i) => {
                const b = boxRef.current?.getBoundingClientRect();
                if (!b) return null;
                return <div key={i} className="absolute rounded-full bg-[#64DD17]" style={{ left: s.x - b.left - 2, top: s.y - b.top - 2, width: 4, height: 4, opacity: 0.15 + (i / trail.length) * 0.75 }} />;
            })}
            {/* 파워 */}
            <div className="absolute left-3 right-3 bottom-2 h-2 rounded-full bg-black/35 overflow-hidden">
                <div className={cn("h-full rounded-full", power > 100 ? "bg-red-400" : "bg-[#64DD17]")} style={{ width: `${pr * 100}%` }} />
            </div>
            <div className="absolute left-3 top-2 text-[10px] font-extrabold tracking-[0.2em] text-white/35">SWIPE</div>
            <div className="absolute right-3 top-2 text-[10.5px] font-bold text-white/45 tabular-nums">템포 {downswingMsFor(club)} ms</div>
            <div className="absolute inset-x-0 top-1/2 mt-[34px] text-center text-[11.5px] font-bold text-white/70 pointer-events-none">
                {phase === "idle" ? "공을 오른쪽으로 당겼다가 왼쪽으로 쓸어 치세요" : phase === "back" ? `백스윙 ${power} %` : "지금! 공을 지나 왼쪽으로"}
            </div>
        </div>
    );
}

/** 헛스윙 — 공을 지나지 못했다 */
function missResult(club: ClubId, powerPct: number): SwingResult {
    const nt = noTapInput(club);
    return { powerPct: Math.max(20, powerPct), impactMs: nt.impactMs, padX: 0, tapX: 0, tapY: nt.tapY, noTap: true };
}
