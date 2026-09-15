/**
 * 당점 선택기(오너 요청 2026-09-15: "당구공 당점처럼"). 정면에서 본 공 위에서 클럽이 지나갈 점을 끌어서 고른다.
 * 세로 = 컨택 높이(tapY: 0 중심, + 위 = 얇게·탑, − 아래 잔디/티 = 뒷땅·스카이), 가로 = 힐/토(tapX, 왼쪽 끝 = 호젤).
 * 샷 전에 고르는 값이라 타이밍 탭은 아무 데나 해도 된다. 기본은 가운데(정타). 드라이버는 일부러 위쪽을 고르면 저스핀 장타.
 */
import { useRef, type PointerEvent as RPE } from "react";
import { cn } from "@/lib/utils";

export interface ContactPoint { x: number; y: number }   // 엔진 단위 tapX·tapY(−100..100)
interface Props { value: ContactPoint; onChange: (v: ContactPoint) => void; teed: boolean; disabled?: boolean }

const R = 44;                 // 공 반지름 px
const RANGE_R = 1.5;          // tapY 100 = 1.5R (엔진 TAPY_RANGE_R 과 같다)
const BOX = R * 2 * 1.35;     // 드래그 상자(공 위아래로 0.35R 여유)

export function ContactPicker({ value, onChange, teed, disabled }: Props) {
    const boxRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);

    const pick = (e: RPE) => {
        const b = boxRef.current?.getBoundingClientRect(); if (!b) return;
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        const x = Math.max(-100, Math.min(100, Math.round(((e.clientX - cx) / R) * 100)));
        const y = Math.max(-100, Math.min(100, Math.round(((cy - e.clientY) / R / RANGE_R) * 100)));
        onChange({ x, y });
    };
    const onDown = (e: RPE) => { if (disabled) return; dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); pick(e); };
    const onMove = (e: RPE) => { if (dragging.current) pick(e); };
    const onUp = () => { dragging.current = false; };

    const mx = (value.x / 100) * R, my = -(value.y / 100) * R * RANGE_R;
    const cm = (v: number) => (Math.abs(v) * 2.135) / 100;
    const label = value.x === 0 && value.y === 0 ? "가운데 · 정타"
        : `${value.y > 0 ? `위 ${(cm(value.y) * RANGE_R).toFixed(1)}cm` : value.y < 0 ? `아래 ${(cm(value.y) * RANGE_R).toFixed(1)}cm` : ""}${value.x ? ` · ${value.x > 0 ? "토" : "힐"} ${cm(value.x).toFixed(1)}cm` : ""}`.replace(/^ · /, "");

    return (
        <div className={cn("flex flex-col items-center gap-1 select-none", disabled ? "opacity-40" : "")}>
            <div className="text-[10px] font-extrabold tracking-[0.2em] text-white/30">당점</div>
            <div
                ref={boxRef}
                className="relative touch-none rounded-2xl bg-white/[0.04] overflow-hidden"
                style={{ width: BOX, height: BOX }}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            >
                {/* 지면: 잔디 또는 티 */}
                {teed
                    ? <div className="absolute left-1/2 -translate-x-1/2 w-[7px] rounded-b bg-white/50" style={{ top: BOX / 2 + R - 2, height: R * 0.7 }} />
                    : <div className="absolute inset-x-0 bg-[#2f7a34]" style={{ top: BOX / 2 + R - 3, bottom: 0 }} />}
                {/* 공 */}
                <div className="absolute left-1/2 top-1/2 rounded-full bg-[#ffffff] shadow-[inset_-8px_-8px_14px_rgba(0,0,0,0.28)]" style={{ width: R * 2, height: R * 2, transform: "translate(-50%, -50%)" }} />
                {/* 정타 구간(세로 ±0.3R) */}
                <div className="absolute left-1/2 top-1/2 rounded-full border border-[#64DD17]/60" style={{ width: R * 0.9, height: R * 0.6, transform: "translate(-50%, -50%)" }} />
                <div className="absolute left-1/2 top-1/2 w-[1px] bg-black/15" style={{ height: R * 2, transform: "translate(-50%, -50%)" }} />
                <div className="absolute left-1/2 top-1/2 h-[1px] bg-black/15" style={{ width: R * 2, transform: "translate(-50%, -50%)" }} />
                {/* 라벨 */}
                <div className="absolute left-1/2 -translate-x-1/2 text-[9px] font-bold text-white/40" style={{ top: 3 }}>얇게 · 탑</div>
                <div className="absolute text-[9px] font-bold text-black/40" style={{ left: BOX / 2 - R + 4, top: BOX / 2 - 6 }}>힐</div>
                <div className="absolute text-[9px] font-bold text-black/40" style={{ left: BOX / 2 + R - 14, top: BOX / 2 - 6 }}>토</div>
                <div className="absolute left-1/2 -translate-x-1/2 text-[9px] font-bold text-white/70" style={{ bottom: 3 }}>{teed ? "스카이" : "뒷땅"}</div>
                {/* 마커 */}
                <div className="absolute left-1/2 top-1/2 w-[14px] h-[14px] rounded-full bg-[#64DD17] border-2 border-[#051907] shadow-[0_0_8px_rgba(100,221,23,0.9)]" style={{ transform: `translate(calc(-50% + ${mx}px), calc(-50% + ${my}px))` }} />
            </div>
            <div className="flex items-center gap-1">
                <div className="text-[10.5px] font-bold text-white/60 tabular-nums">{label}</div>
                {(value.x !== 0 || value.y !== 0) && <button onClick={() => onChange({ x: 0, y: 0 })} className="h-5 px-1.5 rounded-full bg-white/[0.08] text-[9.5px] font-bold text-white/60">가운데</button>}
            </div>
        </div>
    );
}
