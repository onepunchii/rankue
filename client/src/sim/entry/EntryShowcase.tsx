import { useEffect, useRef } from "react";
import { TABLES, type TableSpec } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import type { Renderer } from "../render/Renderer";
import { Canvas2DRenderer } from "../render/Canvas2DRenderer";
import { NO_INSETS } from "../render/tableGeometry";
import { selectRendererKind } from "../render/rendererChoice";

/**
 * 진입 화면의 살아 있는 테이블(2026-09-07 오너: "디자인이 너무 밋밋해"). 그림 파일 대신 우리 렌더러가 개시 배치를 선수 시점으로
 * 그리고, 큐가 빨간 공 둘레를 천천히 훑으며(±11°, 9 초 주기) 살짝 당겼다 놓는다 — 카메라는 렌더러의 감쇠로 큐볼 뒤를 따라 돈다.
 * three.js 가 되는 기기는 3D, 아니면 Canvas2D 탑다운(같은 배치·같은 큐 움직임). prefers-reduced-motion 이면 정지 화면.
 * 자기 캔버스를 자기 마운트에 두고 닫힐 때 dispose 한다(페이지 렌더러와 별개 — 진입 화면이 덮는 동안 페이지 것은 dirty 가 없어 쉰다).
 */
const SWEEP_RAD = 0.19;
const SWEEP_PERIOD_S = 9;
const BREATH_PERIOD_S = 3.2;

interface Props {
    table?: TableSpec;
    className?: string;
}

export function EntryShowcase({ table = TABLES.DAEDAE, className }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let renderer: Renderer | null = null;
        let raf = 0;
        let disposed = false;
        const balls = openingLayout("3c", table, "white");
        const cue = balls.find((b) => b.id === "white")!;
        const red = balls.find((b) => b.id === "red")!;
        const base = Math.atan2(red.r[1] - cue.r[1], red.r[0] - cue.r[0]);
        let reduced = false;
        try { reduced = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { reduced = false; }
        const start = typeof performance !== "undefined" ? performance.now() : 0;
        const frame = (now: number) => {
            if (disposed || !renderer) return;
            const t = (now - start) / 1000;
            const phi = base + (reduced ? 0 : Math.sin((t * 2 * Math.PI) / SWEEP_PERIOD_S) * SWEEP_RAD);
            const pullback = reduced ? 0.25 : 0.25 + 0.1 * Math.sin((t * 2 * Math.PI) / BREATH_PERIOD_S);
            renderer.draw({ balls, cue: { phi, pullback, visible: true, ballId: "white" }, view: { cueBallId: "white", phi } });
            if (!reduced || renderer.needsFrame?.()) raf = requestAnimationFrame(frame);
        };
        const begin = (r: Renderer) => {
            renderer = r;
            if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(frame);
            else frame(start);
        };
        const canvas2d = (): Renderer => {
            const r = new Canvas2DRenderer({ insets: NO_INSETS });
            r.mount(el, table);
            return r;
        };
        if (selectRendererKind() === "three") {
            import("../render/ThreeRenderer").then(({ ThreeRenderer }) => {
                if (disposed) return;
                try {
                    const three = new ThreeRenderer({ insets: NO_INSETS });
                    three.mount(el, table);
                    three.setView("player");
                    begin(three);
                } catch {
                    if (!disposed) begin(canvas2d());
                }
            }).catch(() => { if (!disposed) begin(canvas2d()); });
        } else {
            begin(canvas2d());
        }
        return () => {
            disposed = true;
            if (raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
            renderer?.dispose();
            renderer = null;
        };
    }, [table]);
    return <div ref={ref} aria-hidden="true" className={className ?? "relative w-full h-[228px] rounded-card overflow-hidden bg-surface-3"} />;
}
