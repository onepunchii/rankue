/**
 * 내 수족관(2026-10-16 오너: "수족관 부분을 어탁첩과 같이 메인 느낌으로 키우고 싶어" → "낮엔 한지 · 밤엔 밤바다" → 장식 · 전체 화면).
 *
 * 잡은 어종마다 한 마리 — **어탁첩의 그 그림이 그대로 헤엄친다**(3D 모델을 따로 들이지 않는다: 화풍이 하나이고, 라이선스 걱정이 없고, 폰에서 가볍다).
 * 그림은 tank/engine 한 벌 — 이 창은 바다 한 판을 창 크기에 꼭 맞춰 보여 준다(위는 하늘 · 아래는 장식이 놓인 바닥). '크게 보기'는 전체 화면(tank/TankFull).
 *  - 낮(한국 시각 해 뜬 뒤 ~ 해 지기 전): 한지 위의 먹 그림 · 밤: 짙은 남색 바다에 달빛을 받은 판화. 머리의 단추로 바꿔 볼 수 있다.
 * 물을 누르면 먹이, 물고기를 누르면 놀라 튄 뒤 그 어종의 한 장. 동작 줄이기면 멈춘 한 장, 화면 밖 · 다른 앱이면 멈춘다. 잡은 것이 없으면 예시 셋(흐리게 · '예시').
 * ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지. 한국어만.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { DecorSlot, TankFishRow } from "@shared/fishingDecor";
import { LucideMaximize } from "@/lib/icons";
import { TankEngine, WORLD_H, isNightKst, type TankMode } from "./tank/engine";
import { SAMPLE_FISH, tankRows } from "./tank/tankData";

export { isNightKst };
/** 이 기기에서 수조에서 본 어종 — 처음 보는 어종은 위에서 물보라와 함께 들어온다 */
const SEEN_KEY = "rankue.fishing.tank.seen";
const readSeen = (): Set<string> => { try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"); return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []); } catch { return new Set(); } };
const writeSeen = (ids: readonly string[]) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...readSeen(), ...ids])])); } catch { /* 저장 못 해도 수조는 돈다 */ } };

export function FishingAquarium({ fish, seals, placed, onFish, mini = false, onOpen, onFull, mode: forced }: {
    fish: readonly TankFishRow[];
    /** 어종 id → 낙관(단계 이름) — 물고기 머리 위의 붉은 도장 */
    seals?: ReadonlyMap<string, string>;
    /** 놓인 장식(GET /fishing/tank 의 placed) */
    placed?: Partial<Record<DecorSlot, string | null>>;
    onFish?: (id: string) => void;
    /** 홈의 미리보기 — 낮은 창 · 이름 없이, 누르면 수족관으로 */
    mini?: boolean;
    onOpen?: () => void;
    /** 크게 보기(전체 화면) — 지금 낮/밤을 넘긴다 */
    onFull?: (mode: TankMode) => void;
    mode?: TankMode;
}) {
    const box = useRef<HTMLDivElement>(null);
    const cv = useRef<HTMLCanvasElement>(null);
    const [own, setMode] = useState<TankMode>(() => (isNightKst() ? "night" : "paper"));
    const mode = forced ?? own;
    const sample = fish.length === 0;
    const rows = useMemo(() => tankRows(sample ? SAMPLE_FISH : fish), [fish, sample]);
    const engineRef = useRef<TankEngine | null>(null);
    const camRef = useRef({ x: 600, y: WORLD_H / 2, z: 0.4 });
    const placedRef = useRef(placed);
    placedRef.current = placed;

    useEffect(() => {
        const el = box.current, canvas = cv.current;
        if (!el || !canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        const engine = new TankEngine(mode, mini ? "mini" : "box", sample);
        engineRef.current = engine;
        let alive = true, raf = 0, visible = true, last = 0, vw = 1, vh = 1;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        // 처음 보는 어종은 위에서 들어온다(수조 화면에서만 — 미리보기 · 예시 · 동작 줄이기에서는 바로 제자리)
        const seen = readSeen(), entering = !mini && !sample && !still;
        engine.setFish(rows, seals, new Set(entering ? rows.filter((r) => !seen.has(r.fish.id)).map((r) => r.fish.id) : []));
        engine.setDecor(placedRef.current ?? {});
        if (entering) window.setTimeout(() => { if (alive) writeSeen(rows.map((r) => r.fish.id)); }, 2500);
        const draw = (t: number) => engine.draw(ctx, vw, vh, camRef.current, t, dpr);
        // 그림이 들어오면 한 번은 그린다 — 화면 밖이어서 멈춰 있어도 빈 상자가 아니게
        engine.onImage = () => { if (alive && (still || !visible)) draw(still ? 0 : performance.now()); };
        const resize = () => {
            const r = el.getBoundingClientRect();
            vw = Math.max(1, Math.round(r.width)); vh = Math.max(1, Math.round(r.height));
            canvas.width = vw * dpr; canvas.height = vh * dpr;
            canvas.style.width = `${vw}px`; canvas.style.height = `${vh}px`;
            // 바다 한 판을 창에 꼭 맞게 — 세상의 너비 = 창의 가로세로 비
            const z = vh / WORLD_H, W = vw / z;
            engine.setWorld(W);
            camRef.current = { x: engine.W / 2, y: WORLD_H / 2, z };
            draw(still ? 0 : performance.now());
        };
        const ro = new ResizeObserver(resize);
        ro.observe(el);
        resize();
        const loop = (now: number) => {
            if (!alive) return;
            if (visible && !document.hidden) {
                engine.step(last ? Math.min(64, now - last) : 16, now);
                draw(now);
            }
            last = now;
            raf = requestAnimationFrame(loop);
        };
        let io: IntersectionObserver | null = null;
        if (!still) {
            raf = requestAnimationFrame(loop);
            io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); });
            io.observe(el);
        }
        return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); io?.disconnect(); engine.destroy(); };
    }, [rows, sample, seals, mode, mini]);

    useEffect(() => { engineRef.current?.setDecor(placed ?? {}); }, [placed]);

    const tap = (e: React.PointerEvent<HTMLCanvasElement>) => {
        // 홈의 작은 수조 — 물고기를 누르면 그 어종의 한 장(내 사진 · 기록), 물을 누르면 수족관으로(2026-10-18 오너: "물고기 눌렀을 때 내가 등록했던 사진")
        const engine = engineRef.current;
        if (!engine) { if (mini) onOpen?.(); return; }
        const r = e.currentTarget.getBoundingClientRect(), cam = camRef.current;
        const wx = cam.x + (e.clientX - r.left - r.width / 2) / cam.z, wy = cam.y + (e.clientY - r.top - r.height / 2) / cam.z;
        const hit = sample ? null : engine.fishAt(wx, wy);
        if (mini) {
            if (hit && onFish) { engine.excite(hit); window.setTimeout(() => onFish(hit), 260); } else onOpen?.();
            return;
        }
        if (hit) {
            // 놀라서 꼬리를 튕기며 앞으로 튄다 — 그 뒤에 그 어종의 한 장
            engine.excite(hit);
            window.setTimeout(() => onFish?.(hit), 320);
            return;
        }
        // 물을 누르면 먹이 셋(한 번에 아홉 알까지)
        engine.feed(wx, wy, performance.now());
    };
    const names = rows.map((r) => r.fish.name).join(", ");
    const night = mode === "night";
    const chip = night ? { background: "#0B1E2D99", color: "#F3ECDD", boxShadow: "inset 0 0 0 1px #FFFFFF1F" } : { background: "#EFE6D2CC", color: "#0F2838", boxShadow: "inset 0 0 0 1px #0F28381F" };

    return (
        <div ref={box} className={mini ? "relative h-[150px] w-full overflow-hidden rounded-2xl" : "relative h-[58vh] max-h-[480px] min-h-[320px] w-full overflow-hidden rounded-2xl"}
            style={{ boxShadow: night ? "inset 0 0 0 1px #FFFFFF14" : "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }} data-testid={mini ? "fishing-tank-mini" : "fishing-tank"} data-mode={mode}>
            <canvas ref={cv} onPointerDown={tap} className="block h-full w-full cursor-pointer" role="img" aria-label={`내 수족관 — ${names}${sample ? " (예시)" : ""}`} />
            {!mini && (
                <>
                    {onFull && (
                        <button type="button" onClick={() => onFull(mode)} className="absolute left-3 top-3 flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold active:opacity-80" style={chip} data-testid="fishing-tank-open-full">
                            <LucideMaximize className="h-4 w-4" />크게 보기
                        </button>
                    )}
                    {!forced && (
                        <button type="button" onClick={() => setMode((m) => (m === "night" ? "paper" : "night"))} data-testid="fishing-tank-mode"
                            className="absolute right-3 top-3 h-9 rounded-full px-3.5 text-[13px] font-semibold active:opacity-80" style={chip}>
                            {night ? "밤바다" : "한지"} · 바꾸기
                        </button>
                    )}
                </>
            )}
            {!sample && !mini && (
                <p className="pointer-events-none absolute inset-x-4 bottom-3 text-center text-[12px] break-keep" style={{ color: night ? "#F3ECDD99" : "#0F283899" }} data-testid="fishing-tank-hint">
                    물을 누르면 먹이를 줘요 · 물고기를 누르면 그 어종의 한 장
                </p>
            )}
            {sample && !mini && (
                <p className="absolute inset-x-4 bottom-3 rounded-xl px-3 py-2 text-center text-[13px] leading-snug break-keep"
                    style={night ? { background: "#0B1E2DCC", color: "#F3ECDD" } : { background: "#EFE6D2E6", color: "#0F2838" }} data-testid="fishing-tank-empty">
                    예시예요. 조과를 적으면 그 어종이 어탁 그림 그대로 이 수조에 들어와요.
                </p>
            )}
        </div>
    );
}
