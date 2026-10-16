/**
 * 내 수족관(2026-10-16 오너: "수족관 부분을 어탁첩과 같이 메인 느낌으로 키우고 싶어 · 지금 그래픽이 엉망" → 시안 중 "낮엔 한지 · 밤엔 밤바다").
 *
 * 잡은 어종마다 한 마리 — **어탁첩의 그 그림이 그대로 헤엄친다**(3D 모델을 따로 들이지 않는다: 화풍이 하나이고, 라이선스 걱정이 없고, 폰에서 가볍다).
 * 헤엄은 그림을 세로 띠 서른여섯 개로 잘라 꼬리 쪽일수록 크게 물결치게 그린다. 몸 크기는 많이 잡은 어종일수록 크게(shared/fishingAquarium).
 *  - 낮(한국 시각 해 뜬 뒤 ~ 해 지기 전): 한지 위의 먹 물고기 · 먹 물결 · 먹 수초
 *  - 밤: 짙은 남색 바다에 달빛을 받은 판화 물고기 · 빛줄기 · 모래 언덕
 *  해 뜨고 지는 때는 서울의 달마다 어림(아래 SUN). 머리의 단추로 낮/밤을 바꿔 볼 수 있다(이 화면에서만).
 * 물고기를 누르면 그 어종의 한 장. 동작 줄이기면 멈춘 한 장, 화면 밖 · 다른 앱이면 멈춘다. 잡은 것이 없으면 예시 셋(흐리게 · '예시').
 * ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지. 한국어만.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { FishingCatch } from "@shared/fishing";
import { fishByName, type FishKind as Fish } from "@shared/fishingFish";
import { aquariumFish } from "@shared/fishingAquarium";
import { art } from "./ink";

/** 서울의 달마다 해 뜨는 때 · 지는 때(시, 어림) */
const SUN: readonly (readonly [number, number])[] = [[7.7, 17.6], [7.4, 18.1], [6.9, 18.6], [6.2, 19.1], [5.5, 19.5], [5.2, 19.9], [5.3, 19.9], [5.7, 19.5], [6.1, 18.9], [6.5, 18.1], [7.0, 17.5], [7.5, 17.3]];
export function isNightKst(ms = Date.now()): boolean {
    const d = new Date(ms + 9 * 3_600_000), h = d.getUTCHours() + d.getUTCMinutes() / 60, [rise, set] = SUN[d.getUTCMonth()];
    return h < rise || h >= set;
}
type Mode = "paper" | "night";

interface Swimmer {
    fish: Fish; seal: string | null; size: number; speed: number; phase: number; lane: number;
    /** x · 지금 높이(cy) · 쉬는 줄의 높이(y) */
    x: number; y: number; cy: number; dir: 1 | -1; turn: number; img: HTMLCanvasElement | null; w: number; h: number;
    /** 놀람(누르면 1 → 줄어든다 — 꼬리가 빨라지고 앞으로 튄다) · 들어오는 중(0 → 1) · 새로 들어온 것 표시가 남은 때(ms) */
    excite: number; enter: number; fresh: number;
    /** 먹이를 쫓거나 들어오는 중 — 이름표를 숨긴다(몰려들 때 글자가 겹치지 않게). 서서히 다시 보인다(label 0 → 1) */
    busy: boolean; label: number;
}
interface Pellet { x: number; y: number; born: number }
interface Ripple { x: number; y: number; born: number }
/** 이 기기에서 수조에서 본 어종 — 처음 보는 어종은 위에서 물보라와 함께 들어온다 */
const SEEN_KEY = "rankue.fishing.tank.seen";
const readSeen = (): Set<string> => { try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"); return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []); } catch { return new Set(); } };
const writeSeen = (ids: readonly string[]) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...readSeen(), ...ids])])); } catch { /* 저장 못 해도 수조는 돈다 */ } };

/** 흰 바탕 → 투명, 먹선만(밤에는 달빛 색으로) */
function inkCut(img: HTMLImageElement, night: boolean): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
        const l = (p[i] + p[i + 1] + p[i + 2]) / 3, a = Math.max(0, Math.min(255, (235 - l) * 1.35));
        if (night) { p[i] = 236; p[i + 1] = 226; p[i + 2] = 204; } else { p[i] = 15; p[i + 1] = 40; p[i + 2] = 56; }
        p[i + 3] = a;
    }
    g.putImageData(d, 0, 0);
    return c;
}



export function FishingAquarium({ list, seals, onFish, mini = false, onOpen }: {
    list: readonly FishingCatch[];
    /** 어종 id → 낙관(단계 이름) — 물고기 머리 위의 붉은 도장 */
    seals?: ReadonlyMap<string, string>;
    onFish?: (id: string) => void;
    /** 홈의 미리보기 — 낮은 창 · 이름 없이, 누르면 수족관으로 */
    mini?: boolean;
    onOpen?: () => void;
}) {
    const box = useRef<HTMLDivElement>(null);
    const cv = useRef<HTMLCanvasElement>(null);
    const [mode, setMode] = useState<Mode>(() => (isNightKst() ? "night" : "paper"));
    const picked = useMemo(() => {
        const rows = aquariumFish(list).map((t) => ({ t, fish: fishByName(t.species) })).filter((r): r is { t: typeof r.t; fish: Fish } => !!r.fish);
        return rows;
    }, [list]);
    const sample = picked.length === 0;
    const swimmersRef = useRef<Swimmer[]>([]);
    const hitRef = useRef<{ id: string; x: number; y: number; w: number; h: number }[]>([]);
    // 먹이(물을 누르면 셋이 떨어져 가라앉는다)와 물보라 — 그리는 고리 밖에서 누름이 넣는다
    const foodRef = useRef<Pellet[]>([]);
    const rippleRef = useRef<Ripple[]>([]);

    useEffect(() => {
        const el = box.current, canvas = cv.current;
        if (!el || !canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const night = mode === "night";
        const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        let alive = true, raf = 0, visible = true, W = 0, H = 0;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        // 물고기 — 잡은 어종(없으면 예시 셋)
        const base = sample
            ? ["감성돔", "붕어", "고등어"].map((name, i) => ({ fish: fishByName(name)!, size: 0.8, speed: 0.3 + i * 0.08, phase: i * 1.9 })).filter((r) => r.fish)
            : picked.map((r) => ({ fish: r.fish, size: r.t.size, speed: r.t.speed, phase: r.t.phase }));
        // 처음 보는 어종은 위에서 들어온다(수조 화면에서만 — 미리보기 · 예시 · 동작 줄이기에서는 바로 제자리)
        const seen = readSeen(), entering = !mini && !sample && !still;
        const sw: Swimmer[] = base.map((r, i) => {
            const isNew = entering && !seen.has(r.fish.id);
            return { fish: r.fish, seal: seals?.get(r.fish.id) ?? null, size: r.size, speed: r.speed, phase: r.phase, lane: i, x: 0, y: 0, cy: 0, dir: i % 2 ? 1 : -1, turn: 1, img: null, w: 0, h: 0, excite: 0, enter: isNew ? -i * 0.35 : 1, fresh: isNew ? 7000 : 0, busy: false, label: isNew ? 0 : 1 };
        });
        swimmersRef.current = sw;
        foodRef.current = []; rippleRef.current = [];
        if (entering) window.setTimeout(() => { if (alive) writeSeen(sw.map((x) => x.fish.id)); }, 2500);
        void Promise.all(sw.map((s) => new Promise<void>((done) => {
            const im = new Image();
            im.decoding = "async";
            im.onload = () => { if (alive) { s.img = inkCut(im, night); } done(); };
            im.onerror = () => done();
            im.src = art(s.fish.id);
        }))).then(() => { if (alive) draw(still ? 0 : performance.now()); }); // 다 받으면 한 번은 그린다 — 화면 밖이어서 멈춰 있어도 빈 상자가 아니게

        // 한지 결 — 한 번만 그려 둔다
        let paper: HTMLCanvasElement | null = null;
        const makePaper = () => {
            paper = document.createElement("canvas");
            paper.width = Math.max(1, W * dpr); paper.height = Math.max(1, H * dpr);
            const g = paper.getContext("2d")!;
            g.scale(dpr, dpr);
            g.fillStyle = "#EFE6D2"; g.fillRect(0, 0, W, H);
            g.globalAlpha = 0.07;
            for (let k = 0; k < Math.floor((W * H) / 180); k++) { g.fillStyle = k % 2 ? "#8A7A5C" : "#FFFFFF"; g.fillRect((k * 37.7) % W, (k * 91.3) % H, 1, 2 + (k % 3)); }
            g.globalAlpha = 1;
            const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
            vg.addColorStop(0, "#00000000"); vg.addColorStop(1, "#5A4A2A22");
            g.fillStyle = vg; g.fillRect(0, 0, W, H);
        };
        const resize = () => {
            const r = el.getBoundingClientRect();
            W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
            canvas.width = W * dpr; canvas.height = H * dpr;
            canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (!night) makePaper();
            // 높이를 고르게 나눈 줄(레인)에 한 마리씩 — 같은 높이에 몰리지 않게. 처음 자리는 줄마다 가로로 엇갈린다
            const n = Math.max(sw.length, 1), top = mini ? 14 : 52, bottom = mini ? 14 : 70, usable = Math.max(1, H - top - bottom);
            sw.forEach((s, i) => {
                s.w = Math.min(W * 0.44, (mini ? 74 : 112) * s.size + (mini ? 6 : 20));
                s.h = s.w * 0.625;
                s.y = top + usable * ((i + 0.5) / n);
                s.cy = s.enter < 1 ? -s.h : s.y;
                s.x = s.w / 2 + ((i * 0.43 + 0.11) % 1) * Math.max(1, W - s.w);
            });
            if (still) draw(0);
        };
        const ro = new ResizeObserver(resize);
        ro.observe(el);
        resize();

        function background(t: number) {
            if (night) {
                const g = ctx!.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, "#143E5A"); g.addColorStop(0.55, "#0B2335"); g.addColorStop(1, "#06121D");
                ctx!.fillStyle = g; ctx!.fillRect(0, 0, W, H);
                for (let k = 0; k < 5; k++) {
                    ctx!.save(); ctx!.globalAlpha = 0.06 + 0.03 * Math.sin(t / 1400 + k); ctx!.fillStyle = "#CFE8FF";
                    const x = W * (0.08 + k * 0.21) + Math.sin(t / 2000 + k) * 12;
                    ctx!.beginPath(); ctx!.moveTo(x, 0); ctx!.lineTo(x + W * 0.1, 0); ctx!.lineTo(x + W * 0.3, H); ctx!.lineTo(x + W * 0.05, H); ctx!.closePath(); ctx!.fill(); ctx!.restore();
                }
                ctx!.fillStyle = "#0A1A26"; ctx!.beginPath(); ctx!.moveTo(0, H);
                for (let x = 0; x <= W; x += 12) ctx!.lineTo(x, H - (mini ? 14 : 36) - 9 * Math.sin(x / 40));
                ctx!.lineTo(W, H); ctx!.fill();
            } else {
                if (paper) ctx!.drawImage(paper, 0, 0, W, H);
                ctx!.save(); ctx!.strokeStyle = "rgba(15,40,56,0.12)"; ctx!.lineWidth = 1.1;
                for (let r = 0; r < Math.ceil(H / 56); r++) {
                    ctx!.beginPath();
                    for (let x = 0; x <= W; x += 6) { const y = 36 + r * 56 + 5 * Math.sin(x / 34 + t / 1600 + r); if (x) ctx!.lineTo(x, y); else ctx!.moveTo(x, y); }
                    ctx!.stroke();
                }
                ctx!.restore();
                if (!mini) {
                    ctx!.save(); ctx!.strokeStyle = "rgba(15,40,56,0.5)"; ctx!.lineCap = "round"; ctx!.lineWidth = 2.1;
                    for (let k = 0; k < Math.ceil(W / 40); k++) {
                        const bx = 14 + k * 40, h = 54 + (k % 3) * 30;
                        ctx!.beginPath(); ctx!.moveTo(bx, H);
                        for (let y = 0; y <= h; y += 6) ctx!.lineTo(bx + Math.sin(y / 14 + t / 900 + k) * (y / 9), H - y);
                        ctx!.stroke();
                    }
                    ctx!.restore();
                }
            }
            // 거품
            ctx!.lineWidth = 1;
            ctx!.strokeStyle = night ? "rgba(200,230,255,0.42)" : "rgba(15,40,56,0.32)";
            for (let k = 0; k < (mini ? 8 : 16); k++) {
                const bx = (k * 53.3) % W, r = 1.5 + (k % 4), y = ((k * 97.1 - t * (0.018 + (k % 5) * 0.005)) % H + H) % H;
                ctx!.beginPath(); ctx!.arc(bx + Math.sin(t / 700 + k) * 3, y, r, 0, Math.PI * 2); ctx!.stroke();
            }
        }

        function fishAt(s: Swimmer, t: number) {
            if (!s.img) return;
            const N = 36, sx = s.img.width / N, flip = s.dir * s.turn, beat = 1 + s.speed + s.excite * 2.4;
            ctx!.save();
            ctx!.translate(s.x, s.y);
            ctx!.scale(-flip, 1); // 그림의 머리는 왼쪽 — 오른쪽으로 가면 뒤집는다
            if (sample) ctx!.globalAlpha = 0.45;
            for (let i = 0; i < N; i++) {
                const u = i / N, amp = 0.4 + Math.pow(u, 1.6) * (mini ? 4.5 : 7);
                const dy = Math.sin((t / 260) * beat + s.phase - u * 4.2) * amp * (1 + s.excite * 0.6);
                ctx!.drawImage(s.img, i * sx, 0, sx + 1, s.img.height, -s.w / 2 + u * s.w, -s.h / 2 + dy, s.w / N + 0.6, s.h);
            }
            ctx!.restore();
            if (mini || s.label <= 0.02) return;
            ctx!.save();
            ctx!.globalAlpha = s.label;
            ctx!.font = "600 12px 'Pretendard Variable', Pretendard, sans-serif";
            ctx!.textAlign = "center";
            ctx!.fillStyle = night ? "rgba(244,234,214,0.78)" : "rgba(15,40,56,0.72)";
            ctx!.fillText(sample ? `${s.fish.name} · 예시` : s.fish.name, s.x, s.y + s.h / 2 + 4);
            if (s.fresh > 0 && s.enter >= 1) {
                // 새로 들어온 어종 — 이름 옆의 금빛 '새로'(몇 초 동안)
                ctx!.globalAlpha = Math.min(1, s.fresh / 800) * s.label;
                const nw = ctx!.measureText(s.fish.name).width, px = s.x + nw / 2 + 22, py = s.y + s.h / 2 + 4;
                // roundRect 는 옛 안드로이드 웹뷰에 없다 — 둥근 네모를 손으로
                ctx!.fillStyle = "#E8C46A"; ctx!.beginPath();
                ctx!.moveTo(px - 8, py - 12); ctx!.lineTo(px + 8, py - 12); ctx!.arc(px + 8, py - 3.5, 8.5, -Math.PI / 2, Math.PI / 2); ctx!.lineTo(px - 8, py + 5); ctx!.arc(px - 8, py - 3.5, 8.5, Math.PI / 2, Math.PI * 1.5); ctx!.closePath(); ctx!.fill();
                ctx!.fillStyle = "#2D1A08"; ctx!.fillText("새로", px, py);
                ctx!.globalAlpha = 1;
            }
            if (s.seal && !sample) {
                ctx!.font = "600 12px 'Pretendard Variable', Pretendard, sans-serif";
                const tw = ctx!.measureText(s.seal).width + 12, hx = s.x + (flip > 0 ? s.w / 2 - tw / 2 - 4 : -s.w / 2 + tw / 2 + 4), hy = s.y - s.h / 2 - 2;
                ctx!.translate(hx, hy); ctx!.rotate(-0.08);
                ctx!.fillStyle = "#C8372D"; ctx!.fillRect(-tw / 2, -10, tw, 19);
                ctx!.fillStyle = "#FFF4EC"; ctx!.fillText(s.seal, 0, 4);
            }
            ctx!.restore();
        }

        let last = 0;
        function draw(t: number) {
            const dt = last ? Math.min(64, t - last) : 16;
            last = t;
            background(t);
            const food = foodRef.current, rip = rippleRef.current;
            // 먹이 — 천천히 가라앉고, 바닥에 닿거나 오래되면 사라진다
            for (let k = food.length - 1; k >= 0; k--) { const f = food[k]; f.y += dt * 0.028; if (f.y > H - (mini ? 10 : 30) || t - f.born > 12000) food.splice(k, 1); }
            // 먹이마다 가장 가까운 물고기 하나가 쫓는다
            const chase = new Map<Swimmer, Pellet>();
            for (const f of food) {
                let best: Swimmer | null = null, bd = Infinity;
                for (const s of sw) { if (s.enter < 1 || chase.has(s)) continue; const d = Math.hypot(s.x - f.x, s.cy - f.y); if (d < bd) { bd = d; best = s; } }
                if (best) chase.set(best, f);
            }
            const hits: typeof hitRef.current = [];
            for (const s of sw) {
                if (!still) {
                    if (s.enter < 1) {
                        // 들어오는 중 — 위에서 물보라를 일으키며 제 줄까지 내려온다
                        const was = s.enter;
                        s.enter = Math.min(1, s.enter + dt / 1500);
                        if (was <= 0 && s.enter > 0) rip.push({ x: s.x, y: 6, born: t });
                        const e = Math.max(0, s.enter), ease = 1 - Math.pow(1 - e, 3);
                        s.cy = -s.h + (s.y + s.h) * ease;
                    } else {
                        const f = chase.get(s);
                        if (f) {
                            const want: 1 | -1 = f.x >= s.x ? 1 : -1;
                            if (want !== s.dir && Math.abs(f.x - s.x) > s.w * 0.2) { s.dir = want; s.turn = -1; }
                            s.cy += (f.y - s.cy) * Math.min(1, dt / 420);
                            // 입에 닿으면 먹는다(머리는 가는 쪽 끝)
                            const hx = s.x + s.dir * s.w * 0.42;
                            if (Math.hypot(hx - f.x, s.cy - f.y) < Math.max(14, s.h * 0.28)) { food.splice(food.indexOf(f), 1); rip.push({ x: f.x, y: f.y, born: t }); s.excite = Math.max(s.excite, 0.5); }
                        } else s.cy += (s.y - s.cy) * Math.min(1, dt / 1400);
                        const pace = (0.012 + s.speed * 0.03) * (f ? 2.4 : 1) * (1 + s.excite * 3.2) * (mini ? 0.8 : 1);
                        s.x += s.dir * dt * pace;
                        // 벽에 닿으면 몸을 돌린다(뒤집힘이 한 박자에 걸쳐 일어난다)
                        if ((s.x > W - s.w * 0.35 && s.dir > 0) || (s.x < s.w * 0.35 && s.dir < 0)) { s.dir = s.dir > 0 ? -1 : 1; s.turn = -1; }
                    }
                    if (s.turn < 1) s.turn = Math.min(1, s.turn + dt / 220);
                    if (s.excite > 0) s.excite = Math.max(0, s.excite - dt / 700);
                    if (s.fresh > 0 && s.enter >= 1) s.fresh = Math.max(0, s.fresh - dt);
                }
                s.busy = s.enter < 1 || chase.has(s);
                s.label = still ? 1 : s.busy ? Math.max(0, s.label - dt / 160) : Math.min(1, s.label + dt / 500);
                const bob = s.enter < 1 ? 0 : Math.sin(t / 1300 + s.phase) * (mini ? 3 : 6);
                const y0 = s.y;
                s.y = s.cy + bob;
                fishAt(s, t);
                hits.push({ id: s.fish.id, x: s.x - s.w / 2, y: s.y - s.h / 2, w: s.w, h: s.h });
                s.y = y0;
            }
            // 먹이 알갱이
            for (const f of food) {
                ctx!.fillStyle = night ? "rgba(248,221,176,0.95)" : "rgba(122,74,30,0.9)";
                ctx!.beginPath(); ctx!.arc(f.x + Math.sin((t - f.born) / 300) * 1.5, f.y, 2.6, 0, Math.PI * 2); ctx!.fill();
            }
            // 물보라 · 먹은 자리의 동그라미
            for (let k = rip.length - 1; k >= 0; k--) {
                const g = rip[k], a = (t - g.born) / 900;
                if (a >= 1) { rip.splice(k, 1); continue; }
                ctx!.strokeStyle = night ? `rgba(220,240,255,${0.6 * (1 - a)})` : `rgba(15,40,56,${0.5 * (1 - a)})`;
                ctx!.lineWidth = 1.4;
                for (const m of [1, 0.6]) { ctx!.beginPath(); ctx!.ellipse(g.x, g.y, (8 + a * 34) * m, (3 + a * 10) * m, 0, 0, Math.PI * 2); ctx!.stroke(); }
            }
            hitRef.current = hits;
        }
        const loop = (now: number) => {
            if (!alive) return;
            if (visible && !document.hidden) draw(now);
            raf = requestAnimationFrame(loop);
        };
        let io: IntersectionObserver | null = null;
        if (!still) {
            raf = requestAnimationFrame(loop);
            io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); });
            io.observe(el);
        }
        return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); io?.disconnect(); };
    }, [picked, sample, seals, mode, mini]);

    const tap = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (mini) { onOpen?.(); return; }
        const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        const hit = [...hitRef.current].reverse().find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
        if (hit && !sample) {
            // 놀라서 꼬리를 튕기며 앞으로 튄다 — 그 뒤에 그 어종의 한 장
            const s = swimmersRef.current.find((w) => w.fish.id === hit.id);
            if (s) s.excite = 1;
            window.setTimeout(() => onFish?.(hit.id), 320);
            return;
        }
        // 물을 누르면 먹이 셋(한 번에 아홉 알까지)
        const now = performance.now();
        foodRef.current.push(...[-9, 0, 9].map((dx, i) => ({ x: x + dx, y: y + (i === 1 ? -4 : 0), born: now })));
        if (foodRef.current.length > 9) foodRef.current.splice(0, foodRef.current.length - 9);
        rippleRef.current.push({ x, y, born: now });
    };
    const names = (sample ? ["감성돔", "붕어", "고등어"] : picked.map((r) => r.fish.name)).join(", ");

    return (
        <div ref={box} className={mini ? "relative h-[150px] w-full overflow-hidden rounded-2xl" : "relative h-[58vh] max-h-[480px] min-h-[320px] w-full overflow-hidden rounded-2xl"}
            style={{ boxShadow: mode === "night" ? "inset 0 0 0 1px #FFFFFF14" : "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }} data-testid={mini ? "fishing-tank-mini" : "fishing-tank"} data-mode={mode}>
            <canvas ref={cv} onPointerDown={tap} className="block h-full w-full cursor-pointer" role="img" aria-label={`내 수족관 — ${names}${sample ? " (예시)" : ""}`} />
            {!mini && (
                <button type="button" onClick={() => setMode((m) => (m === "night" ? "paper" : "night"))} data-testid="fishing-tank-mode"
                    className="absolute right-3 top-3 h-9 rounded-full px-3.5 text-[13px] font-semibold active:opacity-80"
                    style={mode === "night" ? { background: "#F3ECDD1F", color: "#F3ECDD" } : { background: "#0F28381A", color: "#0F2838" }}>
                    {mode === "night" ? "밤바다" : "한지"} · 바꾸기
                </button>
            )}
            {!sample && !mini && (
                <p className="pointer-events-none absolute inset-x-4 bottom-3 text-center text-[12px] break-keep" style={{ color: mode === "night" ? "#F3ECDD99" : "#0F283899" }} data-testid="fishing-tank-hint">
                    물을 누르면 먹이를 줘요 · 물고기를 누르면 그 어종의 한 장
                </p>
            )}
            {sample && !mini && (
                <p className="absolute inset-x-4 bottom-3 rounded-xl px-3 py-2 text-center text-[13px] leading-snug break-keep"
                    style={mode === "night" ? { background: "#0B1E2DCC", color: "#F3ECDD" } : { background: "#EFE6D2E6", color: "#0F2838" }} data-testid="fishing-tank-empty">
                    예시예요. 조과를 적으면 그 어종이 어탁 그림 그대로 이 수조에 들어와요.
                </p>
            )}
        </div>
    );
}
