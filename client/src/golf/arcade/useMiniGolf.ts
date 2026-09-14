/**
 * 미니골프 한 라운드의 게임 층(2026-09-14). 물리는 shared/golf/physics, 여기는 홀 진행·타수·연출 상태만.
 * 렌더(캔버스)와 입력은 MiniGolfBoard 가 맡고, 이 훅의 shoot()/tick() 을 부른다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Course, Hole } from "@shared/golf/course";
import { parLabel } from "@shared/golf/course";
import { DT, MAX_STROKES, initBall, shoot as shootBall, step, type BallState, type StepEvent } from "@shared/golf/physics";
import { wallsOf } from "@shared/golf/course";

export type Phase = "aim" | "moving" | "holed" | "done";

export interface MiniGolfState {
    holeIndex: number;
    hole: Hole;
    strokes: number;            // 이번 홀
    results: number[];          // 끝낸 홀들의 타수
    phase: Phase;
    /** 홀 끝났을 때 잠깐 띄우는 배지("버디!") */
    badge: string | null;
    /** 마지막 스텝의 사건(소리·진동용) */
    lastEvents: StepEvent[];
}

const HOLED_PAUSE_MS = 1400;
const MAX_STEPS_PER_FRAME = 10;

export function useMiniGolf(course: Course, onHoleDone?: (holeIndex: number, strokes: number) => void) {
    const [holeIndex, setHoleIndex] = useState(0);
    const hole = course.holes[holeIndex];
    const ballRef = useRef<BallState>(initBall(hole));
    const wallsRef = useRef(wallsOf(hole));
    const [strokes, setStrokes] = useState(0);
    const [results, setResults] = useState<number[]>([]);
    const [phase, setPhase] = useState<Phase>("aim");
    const [badge, setBadge] = useState<string | null>(null);
    const [tickCount, setTickCount] = useState(0);   // 렌더 트리거
    const eventsRef = useRef<StepEvent[]>([]);
    const accRef = useRef(0);
    const strokesRef = useRef(0);
    const holedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onHoleDoneRef = useRef(onHoleDone);
    onHoleDoneRef.current = onHoleDone;

    // 홀 바뀌면 공·벽 초기화
    useEffect(() => {
        ballRef.current = initBall(hole);
        wallsRef.current = wallsOf(hole);
        strokesRef.current = 0;
        setStrokes(0);
        setPhase("aim");
        setBadge(null);
        setTickCount((n) => n + 1);
    }, [hole]);

    useEffect(() => () => { if (holedTimer.current) clearTimeout(holedTimer.current); }, []);

    const finishHole = useCallback((count: number, label: string) => {
        setPhase("holed");
        setBadge(label);
        onHoleDoneRef.current?.(holeIndex, count);
        setResults((r) => [...r, count]);
        holedTimer.current = setTimeout(() => {
            if (holeIndex + 1 < course.holes.length) setHoleIndex(holeIndex + 1);
            else setPhase("done");
        }, HOLED_PAUSE_MS);
    }, [course.holes.length, holeIndex]);

    /** 당김 벡터(논리 단위) → 샷 */
    const shoot = useCallback((dragX: number, dragY: number) => {
        if (phase !== "aim") return false;
        const next = shootBall(ballRef.current, dragX, dragY);
        if (!next.moving) return false;
        ballRef.current = next;
        strokesRef.current += 1;
        setStrokes(strokesRef.current);
        setPhase("moving");
        return true;
    }, [phase]);

    /** 프레임마다: 지난 시간만큼 고정 스텝 */
    const tick = useCallback((elapsedSec: number) => {
        if (phase !== "moving") return;
        accRef.current += Math.min(elapsedSec, 0.1);
        const b = ballRef.current;
        const events: StepEvent[] = [];
        let n = 0;
        while (accRef.current >= DT && n < MAX_STEPS_PER_FRAME && b.moving) {
            events.push(...step(b, hole, wallsRef.current));
            accRef.current -= DT;
            n++;
        }
        eventsRef.current = events;
        setTickCount((c) => c + 1);
        if (!b.moving) {
            accRef.current = 0;
            if (b.inCup) {
                finishHole(strokesRef.current, parLabel(strokesRef.current, hole.par));
            } else {
                const ob = events.some((e) => e.kind === "ob");
                if (ob) { strokesRef.current += 1; setStrokes(strokesRef.current); }
                if (strokesRef.current >= MAX_STROKES) {
                    // 한계 타수 — 강제 마감(+1)
                    finishHole(MAX_STROKES + 1, "기브업");
                } else {
                    setPhase("aim");
                    if (ob) setBadge("OB · +1");
                }
            }
        }
    }, [finishHole, hole, phase]);

    // OB 배지는 잠깐만
    useEffect(() => {
        if (badge && phase === "aim") { const t = setTimeout(() => setBadge(null), 1200); return () => clearTimeout(t); }
    }, [badge, phase]);

    const total = useMemo(() => results.reduce((s, v) => s + v, 0), [results]);
    const parSoFar = useMemo(() => course.holes.slice(0, results.length).reduce((s, h) => s + h.par, 0), [course.holes, results.length]);

    return {
        state: { holeIndex, hole, strokes, results, phase, badge, lastEvents: eventsRef.current } as MiniGolfState,
        ball: ballRef.current,
        ballRef,
        tickCount,
        total, parSoFar,
        shoot, tick,
        restart: () => { setResults([]); setHoleIndex(0); ballRef.current = initBall(course.holes[0]); wallsRef.current = wallsOf(course.holes[0]); strokesRef.current = 0; setStrokes(0); setPhase("aim"); setBadge(null); },
    };
}
