/**
 * 필드 골프 2.5D 톱다운 캔버스(1차 렌더 A안 — 연습장 게이트에서 B안과 비교). 이미지 파일 없이 코드로.
 * "뜨는 느낌": 화면 위치 = 투영점 − 0.6·z·scale, 공 반지름 ×(1 + 0.9·z/30) 상한 2.2, 그림자는 지면에 고정하고 높이에 따라 옅어짐, 꼬리 20프레임.
 * 좌표: 홀 좌표 m(x 오른쪽, y 앞). 카메라는 세로 화면에 y 축이 위로 가게 고정(연습장은 팬·줌 없음).
 */
import { useEffect, useRef, useState } from "react";
import type { FieldHole } from "@shared/golf/field/course";
import { surfaceAt } from "@shared/golf/field/course";

export interface Shot { frames: Float32Array; landing: { x: number; y: number } | null; rest: { x: number; y: number }; color: string }
interface Props {
    hole: FieldHole;
    /** 화면에 담을 세로 범위(m) — 연습장 320 */
    viewLenM: number;
    shots: readonly Shot[];         // 이전 샷(착지·정지 점만)
    live: Shot | null;              // 재생 중인 샷
    frameIndex: number;             // live 의 현재 프레임
    ghost?: Float32Array | null;    // '퍼펙트였다면' 점선
    aimDeg: number;
    carryRing: { x: number; y: number; label: string } | null;   // 예상 착지점 링(퍼펙트 임팩트·현재 바람·파워)
    windArrow?: { x: number; y: number } | null;
}

const ROUGH = "#1f4a27", FAIRWAY_A = "#4fae44", FAIRWAY_B = "#489f3f", GREEN = "#7ed47a", BUNKER = "#e6d29a", WATER = "#3d7fd6";

export function FieldCanvas({ hole, viewLenM, shots, live, frameIndex, ghost, aimDeg, carryRing, windArrow }: Props) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const staticRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const el = wrapRef.current; if (!el) return;
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el); return () => ro.disconnect();
    }, []);

    // m → px (원점: 티가 아래에서 12 %, 가운데)
    const scale = size.h ? size.h / viewLenM : 1;
    const ox = size.w / 2 - hole.tee.x * scale, oy = size.h * 0.88 + hole.tee.y * scale;
    const px = (x: number) => ox + x * scale;
    const py = (y: number) => oy - y * scale;

    // 정적 층(지면·거리 링) — 크기·홀이 바뀔 때만 베이크
    useEffect(() => {
        if (!size.w) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const c = document.createElement("canvas"); c.width = size.w * dpr; c.height = size.h * dpr;
        const g = c.getContext("2d")!; g.scale(dpr, dpr);
        g.fillStyle = ROUGH; g.fillRect(0, 0, size.w, size.h);
        // 지면 종류를 8 m 격자로 칠한다(연습장은 단순, 코스는 다각형이 정확)
        const cell = 6 * scale;
        for (let yy = 0; yy < size.h; yy += cell) for (let xx = 0; xx < size.w; xx += cell) {
            const mx = (xx + cell / 2 - ox) / scale, my = (oy - (yy + cell / 2)) / scale;
            const s = surfaceAt(hole, mx, my);
            const band = Math.floor(my / 10) % 2 === 0;
            g.fillStyle = s === "green" ? GREEN : s === "bunker" ? BUNKER : s === "water" ? WATER : (s === "fairway" || s === "tee") ? (band ? FAIRWAY_A : FAIRWAY_B) : s === "ob" ? "#142a17" : ROUGH;
            g.fillRect(xx, yy, cell + 0.5, cell + 0.5);
        }
        // 거리 링(티 기준 50 m 마다)
        g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1; g.font = "600 11px system-ui"; g.fillStyle = "rgba(255,255,255,0.55)"; g.textAlign = "left";
        for (let d = 50; d <= viewLenM; d += 50) {
            g.beginPath(); g.arc(px(hole.tee.x), py(hole.tee.y), d * scale, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
            g.fillText(`${d} m`, px(hole.tee.x) + 6, py(hole.tee.y + d) - 4);
        }
        staticRef.current = c;
    }, [size, hole, viewLenM, scale, ox, oy]);

    // 동적 층
    useEffect(() => {
        const c = canvasRef.current; if (!c || !size.w || !staticRef.current) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(size.w * dpr)) { c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr); }
        const g = c.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.drawImage(staticRef.current, 0, 0, size.w, size.h);

        // 조준선 + 캐리 링
        const a = (aimDeg * Math.PI) / 180;
        const tx = px(hole.tee.x), ty = py(hole.tee.y);
        g.save(); g.setLineDash([6, 8]); g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + Math.sin(a) * viewLenM * scale, ty - Math.cos(a) * viewLenM * scale); g.stroke(); g.restore();
        if (carryRing) {
            const cx = px(carryRing.x), cy = py(carryRing.y);
            g.beginPath(); g.ellipse(cx, cy, 14 * scale, 9 * scale, 0, 0, Math.PI * 2); g.strokeStyle = "rgba(100,221,23,0.9)"; g.lineWidth = 2; g.stroke();
            g.fillStyle = "rgba(100,221,23,0.12)"; g.fill();
            g.fillStyle = "#64DD17"; g.font = "700 11px system-ui"; g.textAlign = "center"; g.fillText(carryRing.label, cx, cy - 12 * scale - 4);
        }
        // 바람 화살표(오른쪽 위)
        if (windArrow && (windArrow.x || windArrow.y)) {
            const wx = size.w - 34, wy = 34, sp = Math.sqrt(windArrow.x ** 2 + windArrow.y ** 2);
            const ux = windArrow.x / sp, uy = -windArrow.y / sp;
            g.beginPath(); g.arc(wx, wy, 20, 0, Math.PI * 2); g.fillStyle = "rgba(0,0,0,0.45)"; g.fill();
            g.strokeStyle = "#64DD17"; g.lineWidth = 3; g.beginPath(); g.moveTo(wx - ux * 12, wy - uy * 12); g.lineTo(wx + ux * 12, wy + uy * 12); g.stroke();
            g.beginPath(); g.moveTo(wx + ux * 12, wy + uy * 12); g.lineTo(wx + ux * 4 - uy * 5, wy + uy * 4 + ux * 5); g.lineTo(wx + ux * 4 + uy * 5, wy + uy * 4 - ux * 5); g.closePath(); g.fillStyle = "#64DD17"; g.fill();
            g.fillStyle = "#fff"; g.font = "700 11px system-ui"; g.textAlign = "center"; g.fillText(`${sp.toFixed(0)} m/s`, wx, wy + 34);
        }
        // 이전 샷 점(착지 ○, 정지 ●)
        for (const s of shots) {
            if (s.landing) { g.beginPath(); g.arc(px(s.landing.x), py(s.landing.y), 3.5, 0, Math.PI * 2); g.strokeStyle = s.color; g.lineWidth = 1.5; g.stroke(); }
            g.beginPath(); g.arc(px(s.rest.x), py(s.rest.y), 3.5, 0, Math.PI * 2); g.fillStyle = s.color; g.fill();
        }
        // 퍼펙트 점선
        if (ghost && ghost.length >= 6) {
            g.save(); g.setLineDash([3, 6]); g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 1.5; g.beginPath();
            for (let i = 0; i < ghost.length; i += 3) { const x = px(ghost[i]), y = py(ghost[i + 1]) - 0.6 * ghost[i + 2] * scale; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
            g.stroke(); g.restore();
        }
        // 재생 중 공: 꼬리 → 그림자 → 공
        if (live) {
            const f = live.frames, n = f.length / 3;
            const i = Math.min(n - 1, frameIndex);
            const trailFrom = Math.max(0, i - 20);
            for (let k = trailFrom; k < i; k += 2) {
                const z = f[k * 3 + 2];
                const ax = px(f[k * 3]), ay = py(f[k * 3 + 1]) - 0.6 * z * scale;
                g.beginPath(); g.arc(ax, ay, 1.5, 0, Math.PI * 2); g.fillStyle = `rgba(255,255,255,${(0.1 + ((k - trailFrom) / 20) * 0.5).toFixed(2)})`; g.fill();
            }
            const x = f[i * 3], y = f[i * 3 + 1], z = f[i * 3 + 2];
            const gx = px(x), gy = py(y);
            const lift = Math.min(2.2, 1 + (0.9 * Math.max(0, z)) / 30);
            const r0 = Math.max(3.2, 0.9 * scale);
            // 그림자(지면)
            g.beginPath(); g.ellipse(gx, gy, r0 * 1.1, r0 * 0.7, 0, 0, Math.PI * 2); g.fillStyle = `rgba(0,0,0,${(0.45 - Math.min(0.3, (z / 30) * 0.3)).toFixed(2)})`; g.fill();
            // 공
            const bx = gx, by = gy - 0.6 * Math.max(0, z) * scale;
            g.beginPath(); g.arc(bx, by, r0 * lift, 0, Math.PI * 2); g.fillStyle = "#ffffff"; g.fill();
            g.beginPath(); g.arc(bx - r0 * lift * 0.3, by - r0 * lift * 0.3, r0 * lift * 0.35, 0, Math.PI * 2); g.fillStyle = "rgba(255,255,255,0.9)"; g.fill();
            g.beginPath(); g.arc(bx, by, r0 * lift, 0, Math.PI * 2); g.strokeStyle = "rgba(0,0,0,0.3)"; g.lineWidth = 1; g.stroke();
            if (z > 1) { g.fillStyle = "rgba(255,255,255,0.8)"; g.font = "700 10px system-ui"; g.textAlign = "left"; g.fillText(`${z.toFixed(0)} m`, bx + r0 * lift + 4, by + 3); }
        } else {
            // 티 위 공
            g.beginPath(); g.arc(tx, ty, Math.max(3.2, 0.9 * scale), 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill();
        }
    }, [size, shots, live, frameIndex, ghost, aimDeg, carryRing, windArrow, hole, scale, ox, oy, viewLenM]);

    return (
        <div ref={wrapRef} className="relative w-full h-full">
            <canvas ref={canvasRef} style={{ width: size.w, height: size.h, borderRadius: 18 }} />
        </div>
    );
}
