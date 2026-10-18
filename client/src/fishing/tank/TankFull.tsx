/**
 * 전체 화면 수족관(2026-10-16 오너: "수족관을 전체 화면으로 그리고 축소 확대 가능하게 몰입감 있게 · 진짜 큰 수족관이나 바다 느낌이 나게").
 *
 * 화면 셋 남짓한 바다 한 판(tank/engine). 열면 수조 전체가 보이는 데서 물속으로 들어간다.
 *  - 한 손가락으로 끌면 둘러보기(놓으면 미끄러진다) · 두 손가락으로 벌리면 확대 · 마우스 휠도
 *  - 물을 누르면 먹이 · 물고기를 누르면 카메라가 그 물고기를 따라간다(아래 카드에 그 어종 — '한 장 보기')
 *  - 오른쪽 위 작은 지도에 지금 보는 곳 · 물고기 · 장식 자리
 *  - 내 수족관이면 '꾸미기'(여섯 칸 — 칸을 고르면 카메라가 그 자리로 간다) · '카드로 공유'
 *  - 크루원 수족관이면 보기만(먹이는 줄 수 있다 — 그 기기에서만 일어나는 일)
 * 안드로이드 '뒤로' · 아이폰 밀어서 뒤로는 이 창을 닫는다(기록 한 칸을 얹어 둔다). 닫기 단추도 늘 있다.
 * ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지. 한국어만.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { LucideLock, LucideMaximize, LucideMinus, LucidePaintBrush, LucidePlus, LucideShare2, LucideX } from "@/lib/icons";
import { shareBlob } from "@/sim/share/useShare";
import { canvasToBlob } from "@/sim/share/shareCard";
import { DECOR, DECOR_LIMITED, DECOR_SLOTS, DECOR_SLOT_NAME, SLOT_KIND, decorHow, decorImage, decorItem, type DecorRow, type DecorSlot, type TankFishRow } from "@shared/fishingDecor";
import { fishById } from "@shared/fishingFish";
import { SLOT_X, TankEngine, WORLD_H, isNightKst, type Cam, type TankMode } from "./engine";
import { SAMPLE_FISH, tankRows } from "./tankData";
import { renderTankCard } from "./tankCard";

const FULL_HINT_KEY = "rankue.fishing.tank.fullhint";
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export interface TankFullProps {
    title: string;
    fish: readonly TankFishRow[];
    seals?: ReadonlyMap<string, string>;
    placed: Partial<Record<DecorSlot, string | null>>;
    sample?: boolean;
    /** 내 수족관 — 꾸미기 · 공유 · '한 장 보기' */
    mine: boolean;
    items?: readonly DecorRow[] | null;
    owned?: number;
    initialMode?: TankMode;
    /** 열자마자 꾸미기 칸(새 장식을 받았을 때) */
    startDecor?: DecorSlot | null;
    onClose: () => void;
    onFish?: (id: string) => void;
    /** 따라가는 물고기 카드의 한 줄(내 기록) */
    info?: (fishId: string) => string | null;
    onPlace?: (slot: DecorSlot, item: string | null) => void;
}

export function TankFull(p: TankFullProps) {
    const { title, fish, seals, placed, sample = false, mine } = p;
    const box = useRef<HTMLDivElement>(null);
    const cv = useRef<HTMLCanvasElement>(null);
    const map = useRef<HTMLCanvasElement>(null);
    const [mode, setMode] = useState<TankMode>(p.initialMode ?? (isNightKst() ? "night" : "paper"));
    const [follow, setFollow] = useState<string | null>(null);
    const [decor, setDecor] = useState<DecorSlot | null>(p.startDecor ?? null);
    const [hint, setHint] = useState(false);
    const [shareState, setShareState] = useState<"idle" | "busy" | "fail">("idle");
    const rows = useMemo(() => tankRows(sample ? SAMPLE_FISH : fish), [fish, sample]);

    const engineRef = useRef<TankEngine | null>(null);
    const camRef = useRef<Cam>({ x: 700, y: 500, z: 0.7 });
    const viewRef = useRef({ vw: 360, vh: 740 });
    const followRef = useRef<string | null>(null);
    const animRef = useRef<{ from: Cam; to: Cam; t0: number; dur: number } | null>(null);
    const velRef = useRef({ vx: 0, vy: 0 });
    const padRef = useRef(0); // 아래를 가린 높이(꾸미기 · 따라가기 카드) — 그만큼 세상을 위로 올려 볼 수 있다
    const introRef = useRef(false);
    const placedRef = useRef(placed);
    placedRef.current = placed;
    const closeRef = useRef(p.onClose);
    closeRef.current = p.onClose;
    followRef.current = follow;

    /* 뒤로 가기 = 닫기 · 몸통 스크롤 잠금 · Esc */
    useEffect(() => {
        try { window.history.pushState({ ...(window.history.state ?? {}), rkTank: 1 }, ""); } catch { /* 뒤로는 못 써도 닫기 단추가 있다 */ }
        const onPop = () => closeRef.current();
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
        window.addEventListener("popstate", onPop);
        window.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        let seen = true;
        try { seen = localStorage.getItem(FULL_HINT_KEY) === "1"; } catch { /* 안내는 한 번 더 */ }
        let hideHint = 0;
        if (!seen) { setHint(true); hideHint = window.setTimeout(() => setHint(false), 4200); try { localStorage.setItem(FULL_HINT_KEY, "1"); } catch { /* 다음에 또 보인다 */ } }
        return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; window.clearTimeout(hideHint); };
    }, []);
    const close = () => {
        if (window.history.state?.rkTank) window.history.back(); // popstate 가 닫는다
        else closeRef.current();
    };

    /* 카메라 */
    const limits = () => {
        const { vw, vh } = viewRef.current, W = engineRef.current?.W ?? 1400;
        const fit = vh / WORLD_H;
        return { fit, min: Math.min(fit, vw / W) * 0.9, max: fit * 3.2, W };
    };
    const clampCam = (c: Cam): Cam => {
        const { vw, vh } = viewRef.current, { min, max, W } = limits();
        const z = clamp(c.z, min, max), hw = vw / (2 * z), hh = vh / (2 * z), H = WORLD_H + padRef.current / z;
        return { z, x: W <= 2 * hw ? W / 2 : clamp(c.x, hw, W - hw), y: H <= 2 * hh ? H / 2 : clamp(c.y, hh, H - hh) };
    };
    const glide = (to: Partial<Cam>, dur = 420) => {
        const from = { ...camRef.current };
        animRef.current = { from, to: clampCam({ ...from, ...to }), t0: performance.now(), dur };
        velRef.current = { vx: 0, vy: 0 };
    };

    /* 엔진 · 그리는 고리 */
    useEffect(() => {
        const el = box.current, canvas = cv.current;
        if (!el || !canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        const engine = new TankEngine(mode, "full", sample);
        engineRef.current = engine;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let alive = true, raf = 0, last = 0, dirty = true;
        engine.onImage = () => { dirty = true; };
        const resize = () => {
            const r = el.getBoundingClientRect(), vw = Math.max(1, Math.round(r.width)), vh = Math.max(1, Math.round(r.height));
            viewRef.current = { vw, vh };
            canvas.width = vw * dpr; canvas.height = vh * dpr;
            canvas.style.width = `${vw}px`; canvas.style.height = `${vh}px`;
            engine.setWorld(clamp(Math.round(2.6 * (vw / vh) * WORLD_H), 1400, 3200));
            if (!introRef.current) {
                introRef.current = true;
                const { fit, min, W } = limits();
                // 수조 전체가 보이는 데서 물속으로
                camRef.current = clampCam({ x: W * 0.47, y: WORLD_H / 2, z: min });
                if (still) camRef.current = clampCam({ x: W * 0.47, y: WORLD_H / 2, z: fit });
                else window.setTimeout(() => { if (alive) { const from = { ...camRef.current }; animRef.current = { from, to: clampCam({ x: W * 0.47, y: WORLD_H / 2, z: fit }), t0: performance.now(), dur: 1600 }; } }, 450);
            } else camRef.current = clampCam(camRef.current);
            dirty = true;
        };
        engine.setFish(rows, seals, new Set());
        engine.setDecor(placedRef.current);
        const ro = new ResizeObserver(resize);
        ro.observe(el);
        resize();

        const drawMap = (cam: Cam) => {
            const m = map.current;
            if (!m) return;
            const g = m.getContext("2d");
            if (!g) return;
            const { vw, vh } = viewRef.current, W = engine.W, mw = 96, mh = Math.round(clamp(mw * WORLD_H / W, 30, 70));
            if (m.width !== mw * dpr || m.height !== mh * dpr) { m.width = mw * dpr; m.height = mh * dpr; m.style.width = `${mw}px`; m.style.height = `${mh}px`; }
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            g.clearRect(0, 0, mw, mh);
            const night = mode === "night", sx = mw / W, sy = mh / WORLD_H;
            g.fillStyle = night ? "#0B2335E6" : "#EFE6D2E6"; g.fillRect(0, 0, mw, mh);
            g.fillStyle = night ? "#173553" : "#F5EFE0"; g.fillRect(0, 0, mw, engine.skyH * sy);
            g.fillStyle = night ? "#F3ECDD55" : "#0F283840";
            for (const s of ["left", "center", "right", "prop"] as const) if (placedRef.current[s]) g.fillRect(W * SLOT_X[s] * sx - 2, mh - 6, 4, 4);
            g.fillRect(0, mh - 2, mw, 2);
            for (const r of rows) { const pos = engine.fishPos(r.fish.id); if (!pos) continue; g.fillStyle = r.fish.id === followRef.current ? "#F4A963" : night ? "#F3ECDDCC" : "#0F2838CC"; g.beginPath(); g.arc(pos.x * sx, pos.y * sy, 1.8, 0, Math.PI * 2); g.fill(); }
            const hw = vw / (2 * cam.z), hh = vh / (2 * cam.z);
            g.strokeStyle = night ? "#F8DDB0" : "#C8372D"; g.lineWidth = 1.5;
            g.strokeRect(clamp((cam.x - hw) * sx, 0, mw), clamp((cam.y - hh) * sy, 0, mh), Math.min(mw, hw * 2 * sx), Math.min(mh, hh * 2 * sy));
            m.style.opacity = cam.z <= limits().min * 1.06 ? "0" : "1";
        };

        const frame = (now: number) => {
            if (!alive) return;
            const dt = last ? Math.min(64, now - last) : 16;
            last = now;
            let cam = camRef.current;
            const a = animRef.current;
            if (a) {
                const k = clamp((now - a.t0) / a.dur, 0, 1), e = ease(k);
                // 배율은 곱으로(로그) 옮겨야 가속이 고르다
                cam = { x: a.from.x + (a.to.x - a.from.x) * e, y: a.from.y + (a.to.y - a.from.y) * e, z: a.from.z * Math.pow(a.to.z / a.from.z, e) };
                if (k >= 1) animRef.current = null;
                dirty = true;
            } else if (followRef.current) {
                const pos = engine.fishPos(followRef.current);
                if (pos) {
                    const { fit } = limits(), want = Math.max(fit * 1.6, Math.min(fit * 2.6, (viewRef.current.vw * 0.55) / pos.w));
                    const nz = cam.z + (want - cam.z) * Math.min(1, dt / 600);
                    cam = { z: nz, x: cam.x + (pos.x - cam.x) * Math.min(1, dt / 280), y: cam.y + (pos.y + padRef.current / (2 * nz) - cam.y) * Math.min(1, dt / 280) };
                    dirty = true;
                }
            } else {
                const v = velRef.current;
                if (Math.abs(v.vx) + Math.abs(v.vy) > 0.01) {
                    cam = { ...cam, x: cam.x - (v.vx * dt) / cam.z, y: cam.y - (v.vy * dt) / cam.z };
                    const f = Math.pow(0.9, dt / 16); v.vx *= f; v.vy *= f;
                    dirty = true;
                }
            }
            camRef.current = cam = clampCam(cam);
            if (!still) { engine.step(dt, now); dirty = true; }
            if (dirty && !document.hidden) {
                engine.draw(ctx, viewRef.current.vw, viewRef.current.vh, cam, still ? 0 : now, dpr);
                drawMap(cam);
                dirty = false;
            }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);

        /* 손가락 · 마우스 */
        const pts = new Map<number, { x: number; y: number }>();
        let g: null | { kind: "tap" | "pan"; x0: number; y0: number; t0: number; cam0: Cam; lx: number; ly: number; lt: number } | { kind: "pinch"; d0: number; z0: number; wx: number; wy: number } = null;
        const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
        const toWorld = (x: number, y: number, cam: Cam) => ({ x: cam.x + (x - viewRef.current.vw / 2) / cam.z, y: cam.y + (y - viewRef.current.vh / 2) / cam.z });
        const stopMotion = () => { animRef.current = null; velRef.current = { vx: 0, vy: 0 }; };
        const down = (e: PointerEvent) => {
            try { canvas.setPointerCapture(e.pointerId); } catch { /* 옛 브라우저 */ }
            const q = local(e);
            pts.set(e.pointerId, q);
            if (pts.size === 1) { velRef.current = { vx: 0, vy: 0 }; g = { kind: "tap", x0: q.x, y0: q.y, t0: performance.now(), cam0: { ...camRef.current }, lx: q.x, ly: q.y, lt: performance.now() }; }
            else if (pts.size === 2) {
                const [a, b] = [...pts.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, w = toWorld(mid.x, mid.y, camRef.current);
                stopMotion(); setFollow(null);
                g = { kind: "pinch", d0: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), z0: camRef.current.z, wx: w.x, wy: w.y };
            }
        };
        const move = (e: PointerEvent) => {
            if (!pts.has(e.pointerId)) return;
            const q = local(e);
            pts.set(e.pointerId, q);
            if (!g) return;
            if (g.kind === "pinch" && pts.size >= 2) {
                const [a, b] = [...pts.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                const z = g.z0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0;
                const c = clampCam({ z, x: 0, y: 0 });
                camRef.current = clampCam({ z: c.z, x: g.wx - (mid.x - viewRef.current.vw / 2) / c.z, y: g.wy - (mid.y - viewRef.current.vh / 2) / c.z });
                dirty = true;
                return;
            }
            if (g.kind === "tap" && Math.hypot(q.x - g.x0, q.y - g.y0) > 8) { g.kind = "pan"; stopMotion(); setFollow(null); }
            if (g.kind === "pan") {
                const now = performance.now(), dtm = Math.max(1, now - g.lt);
                velRef.current = { vx: (q.x - g.lx) / dtm, vy: (q.y - g.ly) / dtm };
                g.lx = q.x; g.ly = q.y; g.lt = now;
                camRef.current = clampCam({ ...g.cam0, x: g.cam0.x - (q.x - g.x0) / g.cam0.z, y: g.cam0.y - (q.y - g.y0) / g.cam0.z });
                velRef.current.vx = clamp(velRef.current.vx, -3, 3); velRef.current.vy = clamp(velRef.current.vy, -3, 3);
                dirty = true;
            }
        };
        const up = (e: PointerEvent) => {
            const had = pts.get(e.pointerId);
            pts.delete(e.pointerId);
            if (!g || !had) return;
            if (g.kind === "tap" && pts.size === 0) {
                if (performance.now() - g.t0 < 450) tap(g.x0, g.y0);
                g = null;
            } else if (g.kind === "pan" && pts.size === 0) {
                // 손을 뗀 순간 멈춰 있었으면 미끄러지지 않는다
                if (performance.now() - g.lt > 80) velRef.current = { vx: 0, vy: 0 };
                g = null;
            } else if (g.kind === "pinch" && pts.size < 2) {
                g = null; // 남은 손가락은 새로 놓을 때까지 쉰다
            }
        };
        const tap = (x: number, y: number) => {
            const w = toWorld(x, y, camRef.current), now = performance.now();
            const id = sample ? null : engine.fishAt(w.x, w.y);
            if (id) { engine.excite(id); animRef.current = null; setFollow(id); return; }
            engine.feed(w.x, w.y, now);
            dirty = true;
        };
        const wheel = (e: WheelEvent) => {
            e.preventDefault();
            const q = { x: e.clientX - canvas.getBoundingClientRect().left, y: e.clientY - canvas.getBoundingClientRect().top };
            const cam = camRef.current, w = toWorld(q.x, q.y, cam), c = clampCam({ ...cam, z: cam.z * Math.exp(-e.deltaY * 0.0016) });
            stopMotion(); setFollow(null);
            camRef.current = clampCam({ z: c.z, x: w.x - (q.x - viewRef.current.vw / 2) / c.z, y: w.y - (q.y - viewRef.current.vh / 2) / c.z });
            dirty = true;
        };
        canvas.addEventListener("pointerdown", down);
        canvas.addEventListener("pointermove", move);
        canvas.addEventListener("pointerup", up);
        canvas.addEventListener("pointercancel", up);
        canvas.addEventListener("wheel", wheel, { passive: false });
        return () => {
            alive = false; cancelAnimationFrame(raf); ro.disconnect(); engine.destroy();
            canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("wheel", wheel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, seals, mode, sample]);

    useEffect(() => { engineRef.current?.setDecor(placed); }, [placed]);

    /* 아래를 가린 높이 — 꾸미기 시트 · 따라가기 카드 */
    const sheet = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = sheet.current;
        padRef.current = el ? el.getBoundingClientRect().height : 0;
        if (!el) return;
        const ro = new ResizeObserver(() => { padRef.current = el.getBoundingClientRect().height; });
        ro.observe(el);
        return () => ro.disconnect();
    }, [decor, follow]);

    /* 꾸미기 — 칸을 고르면 카메라가 그 자리로 */
    const focusSlot = (slot: DecorSlot) => {
        const e = engineRef.current;
        if (!e) return;
        const { fit } = limits(), item = decorItem(placedRef.current[slot] ?? null);
        const x = slot === "bg" || slot === "floor" ? camRef.current.x : e.W * SLOT_X[slot];
        const z = slot === "bg" || slot === "floor" ? fit : fit * 1.12;
        const y = slot === "bg" ? 0 : slot === "floor" ? WORLD_H : slot === "prop" && item?.place !== "stand" ? e.skyH + 120 : WORLD_H - 230;
        window.setTimeout(() => glide({ x, y: y + padRef.current / (2 * z), z }, 520), 30);
    };
    useEffect(() => { if (decor) { setFollow(null); focusSlot(decor); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [decor]);

    const zoomBy = (f: number) => { setFollow(null); glide({ z: camRef.current.z * f }, 260); };
    const overview = () => {
        setFollow(null);
        const { min, fit, W } = limits();
        if (camRef.current.z > min * 1.06) glide({ z: min, x: W / 2, y: WORLD_H / 2 }, 700);
        else glide({ z: fit, x: W * 0.47, y: WORLD_H / 2 }, 900);
    };

    const share = async () => {
        if (shareState === "busy") return;
        setShareState("busy");
        try {
            const canvas = await renderTankCard({ title, fish, seals: seals ?? new Map(), placed, owned: p.owned ?? 0, mode });
            const blob = await canvasToBlob(canvas);
            if (!blob) throw new Error("blob");
            const url = "https://www.rankue.co.kr";
            const out = await shareBlob(blob, { title, text: `${title} — 어탁 그림이 헤엄치는 내 수족관\n${url}`, filename: `rankue-aquarium-${new Date().toISOString().slice(0, 10)}.png`, url, copied: false });
            setShareState(out.ok ? "idle" : "fail");
        } catch {
            setShareState("fail");
        }
    };
    useEffect(() => { if (shareState !== "fail") return; const h = window.setTimeout(() => setShareState("idle"), 2600); return () => window.clearTimeout(h); }, [shareState]);

    const night = mode === "night";
    const ink = night ? "#F3ECDD" : "#0F2838";
    const chip = night ? { background: "#0B1E2DB3", color: "#F3ECDD", boxShadow: "inset 0 0 0 1px #FFFFFF1F" } : { background: "#EFE6D2D9", color: "#0F2838", boxShadow: "inset 0 0 0 1px #0F28381F" };
    const followFish = follow ? fishById(follow) : null;
    const species = rows.length;

    return (
        <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[55] select-none overflow-hidden" style={{ background: night ? "#02070D" : "#CDBF9F" }} data-testid="fishing-tank-full" data-mode={mode}>
            <div ref={box} className="absolute inset-0">
                <canvas ref={cv} className="block h-full w-full" style={{ touchAction: "none", cursor: "grab" }} role="img" aria-label={`${title} — ${rows.map((r) => r.fish.name).join(", ")}${sample ? " (예시)" : ""}`} data-testid="fishing-tank-canvas" />
            </div>

            {/* 머리줄 */}
            <div className="pointer-events-none absolute inset-x-0 top-0" style={{ background: night ? "linear-gradient(#02070DCC, #02070D00)" : "linear-gradient(#EFE6D2E6, #EFE6D200)", paddingTop: "env(safe-area-inset-top)" }}>
                <div className="flex h-14 items-center gap-2 px-3">
                    <button type="button" onClick={close} aria-label="닫기" className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full active:opacity-70" style={chip} data-testid="fishing-tank-close"><LucideX className="h-5 w-5" /></button>
                    <div className="min-w-0 flex-1 leading-tight" style={{ color: ink }}>
                        <p className="truncate text-[15px] font-semibold">{title}</p>
                        <p className="truncate text-[12px] opacity-75">{sample ? "예시 · 조과를 적으면 그 어종이 들어와요" : `어종 ${species}${p.owned != null ? ` · 장식 ${p.owned}/${DECOR.length}` : ""}`}</p>
                    </div>
                    <button type="button" onClick={() => setMode((m) => (m === "night" ? "paper" : "night"))} className="pointer-events-auto h-9 rounded-full px-3.5 text-[13px] font-semibold active:opacity-80" style={chip} data-testid="fishing-tank-full-mode">
                        {night ? "밤바다" : "한지"} · 바꾸기
                    </button>
                </div>
                <div className="flex justify-end px-3"><canvas ref={map} className="rounded-md transition-opacity duration-300" style={{ boxShadow: night ? "0 0 0 1px #FFFFFF26" : "0 0 0 1px #0F283833" }} aria-hidden data-testid="fishing-tank-map" /></div>
            </div>

            {/* 확대 · 축소 · 전체 */}
            {!decor && (
                <div className="absolute right-3 flex flex-col gap-2" style={{ bottom: `calc(${follow ? 196 : 96}px + env(safe-area-inset-bottom))` }}>
                    <button type="button" onClick={() => zoomBy(1.45)} aria-label="크게" className="flex h-10 w-10 items-center justify-center rounded-full active:opacity-70" style={chip} data-testid="fishing-tank-zoom-in"><LucidePlus className="h-5 w-5" /></button>
                    <button type="button" onClick={() => zoomBy(1 / 1.45)} aria-label="작게" className="flex h-10 w-10 items-center justify-center rounded-full active:opacity-70" style={chip} data-testid="fishing-tank-zoom-out"><LucideMinus className="h-5 w-5" /></button>
                    <button type="button" onClick={overview} aria-label="수조 전체 보기" className="flex h-10 w-10 items-center justify-center rounded-full active:opacity-70" style={chip} data-testid="fishing-tank-overview"><LucideMaximize className="h-5 w-5" /></button>
                </div>
            )}

            {hint && (
                <p className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit max-w-[86%] -translate-y-1/2 rounded-full px-4 py-2.5 text-center text-[13px] font-medium break-keep" style={chip} data-testid="fishing-tank-full-hint">
                    끌어서 둘러보고, 두 손가락으로 벌려 크게 봐요
                </p>
            )}
            {shareState === "fail" && <p className="pointer-events-none absolute inset-x-0 top-24 mx-auto w-fit rounded-full px-4 py-2 text-[13px]" style={chip}>공유하지 못했어요. 잠시 뒤에 다시 해 주세요.</p>}

            {/* 아래 — 따라가는 물고기 · 꾸미기 · 단추 */}
            <div ref={sheet} className="absolute inset-x-0 bottom-0" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
                {followFish && !decor && (
                    <div className="mx-3 mb-2 flex items-center gap-3 rounded-2xl px-4 py-3" style={chip} data-testid="fishing-tank-follow">
                        <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2 text-[16px] font-semibold">
                                {followFish.name}
                                {seals?.get(followFish.id) && <span className="rounded-[3px] px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: "#C8372D", color: "#FFF4EC" }}>{seals.get(followFish.id)}</span>}
                            </p>
                            <p className="mt-0.5 truncate text-[12.5px] opacity-75">{p.info?.(followFish.id) ?? "따라가는 중 — 끌면 멈춰요"}</p>
                        </div>
                        {mine && p.onFish && <button type="button" onClick={() => p.onFish?.(followFish.id)} className="h-10 shrink-0 rounded-full px-4 text-[14px] font-semibold active:opacity-80" style={{ background: "#F4A963", color: "#2A1606" }} data-testid="fishing-tank-follow-open">한 장 보기</button>}
                        <button type="button" onClick={() => setFollow(null)} aria-label="따라가기 멈추기" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:opacity-70" style={{ background: night ? "#FFFFFF14" : "#0F283814" }}><LucideX className="h-4 w-4" /></button>
                    </div>
                )}
                {decor && mine ? (
                    <DecorSheet slot={decor} onSlot={setDecor} night={night} items={p.items ?? []} placed={placed} onPlace={(s, it) => p.onPlace?.(s, it)} onDone={() => setDecor(null)} />
                ) : (
                    <div className="flex gap-2 px-3 pb-3 pt-1">
                        {mine && !sample && (
                            <button type="button" onClick={() => setDecor("center")} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold active:opacity-85" style={{ background: "#F4A963", color: "#2A1606" }} data-testid="fishing-tank-decor">
                                <LucidePaintBrush className="h-5 w-5" />꾸미기
                            </button>
                        )}
                        {mine && !sample && (
                            <button type="button" onClick={share} disabled={shareState === "busy"} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold active:opacity-85 disabled:opacity-60" style={chip} data-testid="fishing-tank-share">
                                <LucideShare2 className="h-5 w-5" />{shareState === "busy" ? "그리는 중" : "카드로 공유"}
                            </button>
                        )}
                        {(!mine || sample) && <p className="flex h-12 flex-1 items-center justify-center rounded-2xl px-3 text-center text-[13px] break-keep" style={chip}>물을 누르면 먹이 · 물고기를 누르면 따라가요</p>}
                    </div>
                )}
            </div>
        </div>
    );
}

/** 꾸미기 — 여섯 칸 · 칸마다 놓을 수 있는 장식(받은 것 먼저) */
function DecorSheet({ slot, onSlot, night, items, placed, onPlace, onDone }: {
    slot: DecorSlot; onSlot: (s: DecorSlot) => void; night: boolean; items: readonly DecorRow[];
    placed: Partial<Record<DecorSlot, string | null>>; onPlace: (slot: DecorSlot, item: string | null) => void; onDone: () => void;
}) {
    const byId = new Map(items.map((x) => [x.id, x]));
    const list = DECOR.filter((d) => d.kind === SLOT_KIND[slot]).map((d) => ({ d, r: byId.get(d.id) }))
        .sort((a, b) => Number(!!b.r?.have) - Number(!!a.r?.have));
    const owned = items.filter((x) => x.have).length;
    const where = (id: string) => DECOR_SLOTS.find((s) => placed[s] === id) ?? null;
    return (
        <div className="rounded-t-3xl pt-3" style={{ background: "#0B1E2DF5", color: "#F3ECDD", boxShadow: "0 -1px 0 #FFFFFF1F" }} data-testid="fishing-decor-sheet" data-slot={slot}>
            <div className="flex items-center gap-2 px-4">
                <p className="flex-1 text-[16px] font-semibold">꾸미기 <span className="ml-1 text-[13px] font-medium" style={{ color: "#F3ECDD99" }}>장식 {owned}/{DECOR.length}</span></p>
                <button type="button" onClick={onDone} className="h-9 rounded-full px-4 text-[14px] font-semibold active:opacity-80" style={{ background: "#F4A963", color: "#2A1606" }} data-testid="fishing-decor-done">다 됐어요</button>
            </div>
            <div className="mt-3 grid grid-cols-6 gap-1 px-4 pb-1" role="tablist">
                {DECOR_SLOTS.map((s) => (
                    <button key={s} type="button" role="tab" aria-selected={s === slot} onClick={() => onSlot(s)} className="h-9 rounded-full px-0 text-[13px] font-semibold"
                        style={s === slot ? { background: "#F3ECDD", color: "#0B1E2D" } : { background: "#FFFFFF0F", color: "#F3ECDDB3" }} data-testid={`fishing-decor-slot-${s}`}>
                        {DECOR_SLOT_NAME[s]}
                    </button>
                ))}
            </div>
            <div className="grid max-h-[38vh] grid-cols-3 gap-2 overflow-y-auto px-4 pb-4 pt-3">
                {list.map(({ d, r }) => {
                    const have = !!r?.have, here = placed[slot] === d.id, other = have && !here ? where(d.id) : null;
                    return (
                        <button key={d.id} type="button" disabled={!have} onClick={() => onPlace(slot, here ? "" : d.id)}
                            className="relative flex flex-col items-center rounded-2xl px-1.5 pb-2 pt-2 text-center active:opacity-85 disabled:active:opacity-100"
                            style={{ background: have ? (night ? "#F3ECDD" : "#EFE6D2") : "#FFFFFF0A", boxShadow: here ? "0 0 0 2px #E8C46A, 0 0 14px #E8C46A66" : have ? "none" : "inset 0 0 0 1px #FFFFFF1A" }}
                            data-testid={`fishing-decor-item-${d.id}`} data-have={have ? "1" : "0"} data-here={here ? "1" : "0"}>
                            <span className="flex h-[64px] w-full items-center justify-center">
                                <img src={decorImage(d.id, true)} alt="" className="max-h-[60px] max-w-full object-contain" style={have ? { mixBlendMode: "multiply" } : { filter: "invert(1) grayscale(1)", opacity: 0.32, mixBlendMode: "screen" }} loading="lazy" />
                            </span>
                            <span className="mt-1 w-full truncate text-[13px] font-semibold" style={{ color: have ? "#0F2838" : "#F3ECDDCC" }}>{d.name}</span>
                            {have ? (
                                <span className="mt-0.5 text-[12px] tabular-nums" style={{ color: "#0F2838B3" }}>
                                    {here ? "놓임 · 누르면 비움" : other ? `${DECOR_SLOT_NAME[other]}에 있음` : r?.serial ? `No.${String(r.serial).padStart(3, "0")}${d.limit ? `/${DECOR_LIMITED}` : ""}` : "놓기"}
                                </span>
                            ) : (
                                <>
                                    <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug break-keep" style={{ color: "#F3ECDD99" }}>{decorHow(d)}</span>
                                    {r && r.need > 1 && <span className="mt-1.5 block h-1 w-[80%] overflow-hidden rounded-full" style={{ background: "#FFFFFF1A" }}><span className="block h-full rounded-full" style={{ width: `${Math.round((r.cur / r.need) * 100)}%`, background: "#F4A963" }} /></span>}
                                    <LucideLock className="absolute right-2 top-2 h-3.5 w-3.5" style={{ color: "#F3ECDD80" }} />
                                    {d.limit && <span className="absolute left-2 top-2 rounded-[3px] px-1 text-[12px] font-semibold" style={{ background: "#E8C46A", color: "#2D1A08" }}>한정</span>}
                                </>
                            )}
                        </button>
                    );
                })}
                {slot !== "floor" && (
                    <button type="button" onClick={() => onPlace(slot, "")} className="flex flex-col items-center justify-center rounded-2xl px-1.5 py-2 text-center text-[13px] active:opacity-80"
                        style={{ background: "#FFFFFF0A", color: "#F3ECDDB3", boxShadow: placed[slot] ? "inset 0 0 0 1px #FFFFFF1A" : "0 0 0 2px #E8C46A" }} data-testid="fishing-decor-empty">
                        비워 두기
                    </button>
                )}
            </div>
        </div>
    );
}
