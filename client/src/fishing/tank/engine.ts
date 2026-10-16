/**
 * 수족관 그리기(2026-10-16 오너: "수족관을 전체 화면으로 · 축소 확대 가능하게 몰입감 있게 · 진짜 큰 수족관이나 바다 느낌이 나게").
 *
 * 세상(world) 하나 — 높이 1000, 너비는 보는 창에 따라(전체 화면은 화면 셋 남짓). 바다를 옆에서 자른 모습:
 *  - 맨 위 띠는 물 위의 하늘(배경 장식 — 새벽 바다 · 달밤 · 물안개), 그 아래 물결치는 수면
 *  - 물은 깊을수록 어둡고(밤) · 먹빛이 짙어지고(낮), 수면에서 빛줄기가 내려온다
 *  - 먼 암초 두 겹은 카메라보다 느리게(멀리 있다), 떠다니는 부유물은 빠르게(가까이 있다) 움직인다
 *  - 바닥 장식 · 큰 장식 셋(왼쪽 · 가운데 · 오른쪽) · 소품 하나(shared/fishingDecor)
 *  - 물고기는 어탁 그림 그대로(띠 서른여섯 개로 잘라 꼬리 쪽일수록 크게 물결) — 먼 물고기는 작고 흐리게, 장식 뒤로
 * 카메라 { x, y, z } = 화면 가운데에 오는 세상의 점과 배율(세상 1 이 화면 몇 px). 이름표 · 낙관은 화면 글자 크기 그대로(12px).
 * 화면 부품(FishingAquarium · TankFull · 공유 카드)이 이 한 벌을 쓴다.
 * ⚠️ roundRect 는 옛 안드로이드 웹뷰에 없다 — 둥근 네모는 손으로.
 */
import type { FishKind } from "@shared/fishingFish";
import { DECOR_SLOTS, decorImage, decorItem, type DecorItem, type DecorSlot } from "@shared/fishingDecor";
import { art } from "../ink";

export const WORLD_H = 1000;
export type TankMode = "paper" | "night";
export type TankSize = "mini" | "box" | "full";
export interface Cam { x: number; y: number; z: number }

/** 서울의 달마다 해 뜨는 때 · 지는 때(시, 어림) */
const SUN: readonly (readonly [number, number])[] = [[7.7, 17.6], [7.4, 18.1], [6.9, 18.6], [6.2, 19.1], [5.5, 19.5], [5.2, 19.9], [5.3, 19.9], [5.7, 19.5], [6.1, 18.9], [6.5, 18.1], [7.0, 17.5], [7.5, 17.3]];
export function isNightKst(ms = Date.now()): boolean {
    const d = new Date(ms + 9 * 3_600_000), h = d.getUTCHours() + d.getUTCMinutes() / 60, [rise, set] = SUN[d.getUTCMonth()];
    return h < rise || h >= set;
}

export interface TankFishIn { fish: FishKind; size: number; speed: number; phase: number; z: number }
interface Swimmer {
    fish: FishKind; seal: string | null; size: number; speed: number; phase: number; z: number;
    /** x · 그린 높이(y) · 지금 높이(cy) · 쉬는 줄의 높이(lane) */
    x: number; y: number; cy: number; lane: number; dir: 1 | -1; turn: number; img: HTMLCanvasElement | null; w: number; h: number;
    excite: number; enter: number; fresh: number; busy: boolean; label: number;
}
interface Pellet { x: number; y: number; born: number }
interface Ripple { x: number; y: number; born: number }

/* ── 그림 따내기 — 흰 바탕을 걷고 먹선만(밤은 달빛 색 · 금빛 장식은 금색). 한 번 따낸 것은 모듈에 둔다(전체 화면을 열어도 다시 안 한다) ── */
type Tint = "ink" | "gold";
const INK: Readonly<Record<TankMode, Record<Tint, readonly [number, number, number]>>> = {
    paper: { ink: [15, 40, 56], gold: [150, 104, 28] },
    night: { ink: [236, 226, 204], gold: [236, 198, 108] },
};
function inkCut(img: HTMLImageElement, mode: TankMode, tint: Tint, soft: boolean): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data, [r, gg, b] = INK[mode][tint];
    const top = soft ? 246 : 235, gain = soft ? 2.2 : 1.35;
    for (let i = 0; i < p.length; i += 4) {
        const l = (p[i] + p[i + 1] + p[i + 2]) / 3;
        p[i] = r; p[i + 1] = gg; p[i + 2] = b;
        p[i + 3] = Math.max(0, Math.min(255, (top - l) * gain));
    }
    g.putImageData(d, 0, 0);
    return c;
}
const cutCache = new Map<string, Promise<HTMLCanvasElement | null>>();
function loadCut(src: string, mode: TankMode, tint: Tint = "ink", soft = false): Promise<HTMLCanvasElement | null> {
    const key = `${src}|${mode}|${tint}|${soft ? 1 : 0}`;
    let p = cutCache.get(key);
    if (!p) {
        p = new Promise((resolve) => {
            const im = new Image();
            im.decoding = "async";
            im.onload = () => { try { resolve(inkCut(im, mode, tint, soft)); } catch { resolve(null); } };
            im.onerror = () => resolve(null);
            im.src = src;
        });
        cutCache.set(key, p);
    }
    return p;
}

/** 한지 결 — 세상 단위로 깔리는 무늬 한 장(확대하면 결도 커진다 — 그림이 그려진 종이처럼) */
let grainTile: HTMLCanvasElement | null = null;
function grain(): HTMLCanvasElement {
    if (grainTile) return grainTile;
    const c = document.createElement("canvas");
    c.width = c.height = 300;
    const g = c.getContext("2d")!;
    g.globalAlpha = 0.07;
    for (let k = 0; k < 520; k++) { g.fillStyle = k % 2 ? "#8A7A5C" : "#FFFFFF"; g.fillRect((k * 37.7) % 300, (k * 91.3) % 300, 1.5, 3 + (k % 3)); }
    grainTile = c;
    return c;
}

/** 0~1 고른 수(같은 씨앗이면 늘 같다) */
const rnd = (k: number) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export const SLOT_X: Readonly<Record<"left" | "center" | "right" | "prop", number>> = { left: 0.15, center: 0.47, right: 0.81, prop: 0.65 };
const FISH_UNIT: Readonly<Record<TankSize, number>> = { mini: 470, box: 220, full: 205 };

export class TankEngine {
    W = 1200;
    readonly H = WORLD_H;
    readonly skyH: number;
    private sw: Swimmer[] = [];
    private food: Pellet[] = [];
    private rip: Ripple[] = [];
    private decor: Partial<Record<DecorSlot, { item: DecorItem; img: HTMLCanvasElement | null }>> = {};
    private alive = true;
    private placedKey = "";
    /** 그림이 들어오면 부른다(멈춘 화면 · 동작 줄이기에서 다시 그리라고) */
    onImage: (() => void) | null = null;

    constructor(readonly mode: TankMode, readonly size: TankSize, readonly sample: boolean) {
        this.skyH = size === "mini" ? 0 : size === "box" ? 150 : 165;
    }
    destroy() { this.alive = false; this.onImage = null; }

    /* ── 바닥과 장식 ── */
    get floorH(): number { const f = this.decor.floor?.item; return (f ? f.h : 62) * (this.size === "mini" ? 0.8 : 1); }
    get floorTop(): number { return this.H - this.floorH; }
    /** 큰 장식의 크기 — 좁은 세상(작은 창)에서는 줄인다 */
    private get k(): number { return Math.max(0.55, Math.min(1, this.W / 1250)); }

    setDecor(placed: Partial<Record<DecorSlot, string | null>>) {
        const key = DECOR_SLOTS.map((s) => placed[s] ?? "").join("|");
        if (key === this.placedKey) return;
        this.placedKey = key;
        const next: typeof this.decor = {};
        for (const slot of DECOR_SLOTS) {
            const item = decorItem(placed[slot] ?? null);
            if (!item) continue;
            const had = this.decor[slot];
            next[slot] = had && had.item.id === item.id ? had : { item, img: null };
            if (!next[slot]!.img) {
                const entry = next[slot]!;
                void loadCut(decorImage(item.id), this.mode, item.gold ? "gold" : "ink", item.kind === "bg").then((img) => {
                    if (!this.alive) return;
                    entry.img = img;
                    this.onImage?.();
                });
            }
        }
        const floorChanged = next.floor?.item.id !== this.decor.floor?.item.id;
        this.decor = next;
        if (floorChanged) this.layoutFish(false);
    }
    /** 장식 그림이 다 들어왔는가(공유 카드는 다 받은 뒤에 그린다) */
    async ready(): Promise<void> {
        const jobs: Promise<unknown>[] = [];
        for (const slot of DECOR_SLOTS) { const d = this.decor[slot]; if (d) jobs.push(loadCut(decorImage(d.item.id), this.mode, d.item.gold ? "gold" : "ink", d.item.kind === "bg").then((img) => { d.img = img; })); }
        for (const s of this.sw) jobs.push(loadCut(art(s.fish.id), this.mode).then((img) => { s.img = img; }));
        await Promise.all(jobs);
    }

    /* ── 물고기 ── */
    setFish(rows: readonly TankFishIn[], seals: ReadonlyMap<string, string> | undefined, entering: ReadonlySet<string>) {
        const old = new Map(this.sw.map((s) => [s.fish.id, s]));
        this.sw = rows.map((r, i) => {
            const was = old.get(r.fish.id);
            if (was) { was.seal = seals?.get(r.fish.id) ?? null; was.size = r.size; return was; }
            const isNew = entering.has(r.fish.id);
            const s: Swimmer = { fish: r.fish, seal: seals?.get(r.fish.id) ?? null, size: r.size, speed: r.speed, phase: r.phase, z: r.z, x: 0, y: 0, cy: 0, lane: 0, dir: i % 2 ? 1 : -1, turn: 1, img: null, w: 0, h: 0, excite: 0, enter: isNew ? -i * 0.35 : 1, fresh: isNew ? 7000 : 0, busy: false, label: isNew ? 0 : 1 };
            void loadCut(art(r.fish.id), this.mode).then((img) => { if (!this.alive) return; s.img = img; this.onImage?.(); });
            return s;
        });
        // 먼 물고기부터 그린다(가까운 것이 앞에)
        this.sw.sort((a, b) => b.z - a.z);
        this.layoutFish(true);
    }
    setWorld(W: number) {
        W = Math.max(300, Math.round(W));
        if (W === this.W) return;
        const ratio = W / this.W;
        this.W = W;
        for (const s of this.sw) s.x *= ratio;
        this.layoutFish(false);
    }
    private layoutFish(place: boolean) {
        const top = this.skyH + (this.size === "mini" ? 70 : 80), bottom = this.floorTop - (this.size === "mini" ? 70 : 60);
        const n = Math.max(1, this.sw.length), usable = Math.max(1, bottom - top);
        // 줄(레인)은 깊이와 상관없이 고르게 — 같은 높이에 몰리지 않게
        const order = [...this.sw].sort((a, b) => a.phase - b.phase);
        order.forEach((s, i) => {
            s.w = Math.min(this.W * 0.46, FISH_UNIT[this.size] * s.size * (1 - 0.3 * s.z));
            s.h = s.w * 0.625;
            s.lane = top + usable * ((i + 0.5) / n);
            if (place) {
                s.cy = s.enter < 1 ? this.skyH - s.h : s.lane;
                s.y = s.cy;
                s.x = s.w / 2 + ((i * 0.43 + 0.11) % 1) * Math.max(1, this.W - s.w);
            } else s.x = Math.max(s.w / 2, Math.min(this.W - s.w / 2, s.x));
        });
    }
    excite(id: string) { const s = this.sw.find((w) => w.fish.id === id); if (s) s.excite = 1; }
    fishAt(wx: number, wy: number): string | null {
        for (let i = this.sw.length - 1; i >= 0; i--) {
            const s = this.sw[i];
            if (s.enter < 1) continue;
            if (Math.abs(wx - s.x) <= s.w / 2 && Math.abs(wy - s.y) <= s.h / 2 + 6) return s.fish.id;
        }
        return null;
    }
    fishPos(id: string): { x: number; y: number; w: number } | null {
        const s = this.sw.find((w) => w.fish.id === id);
        return s ? { x: s.x, y: s.y, w: s.w } : null;
    }
    feed(wx: number, wy: number, t: number) {
        const y = Math.max(this.skyH + 8, Math.min(this.floorTop - 20, wy));
        this.food.push(...[-14, 0, 14].map((dx, i) => ({ x: wx + dx, y: y + (i === 1 ? -6 : 0), born: t })));
        if (this.food.length > 9) this.food.splice(0, this.food.length - 9);
        this.rip.push({ x: wx, y, born: t });
    }

    /* ── 움직임 ── */
    step(dt: number, t: number) {
        const food = this.food, rip = this.rip, sw = this.sw;
        for (let k = food.length - 1; k >= 0; k--) { const f = food[k]; f.y += dt * 0.06; if (f.y > this.floorTop - 12 || t - f.born > 14000) food.splice(k, 1); }
        // 먹이마다 가장 가까운 물고기 하나가 쫓는다
        const chase = new Map<Swimmer, Pellet>();
        for (const f of food) {
            let best: Swimmer | null = null, bd = Infinity;
            for (const s of sw) { if (s.enter < 1 || chase.has(s)) continue; const d = Math.hypot(s.x - f.x, s.cy - f.y); if (d < bd) { bd = d; best = s; } }
            if (best) chase.set(best, f);
        }
        const drift = this.size === "full" ? 46 : this.size === "box" ? 22 : 0;
        const paceK = this.size === "mini" ? 1.8 : 1;
        for (const s of sw) {
            if (s.enter < 1) {
                // 처음 보는 어종 — 수면에서 물보라를 일으키며 제 줄까지 내려온다
                const was = s.enter;
                s.enter = Math.min(1, s.enter + dt / 1500);
                if (was <= 0 && s.enter > 0) rip.push({ x: s.x, y: this.skyH + 4, born: t });
                const e = Math.max(0, s.enter), ease = 1 - Math.pow(1 - e, 3);
                s.cy = this.skyH - s.h + (s.lane - this.skyH + s.h) * ease;
            } else {
                const f = chase.get(s);
                if (f) {
                    const want: 1 | -1 = f.x >= s.x ? 1 : -1;
                    if (want !== s.dir && Math.abs(f.x - s.x) > s.w * 0.2) { s.dir = want; s.turn = -1; }
                    s.cy += (f.y - s.cy) * Math.min(1, dt / 420);
                    const hx = s.x + s.dir * s.w * 0.42;
                    if (Math.hypot(hx - f.x, s.cy - f.y) < Math.max(22, s.h * 0.3)) { food.splice(food.indexOf(f), 1); rip.push({ x: f.x, y: f.y, born: t }); s.excite = Math.max(s.excite, 0.5); }
                } else {
                    const want = s.lane + Math.sin(t / (5200 + s.phase * 900) + s.phase) * drift;
                    s.cy += (want - s.cy) * Math.min(1, dt / 1400);
                }
                const pace = (0.03 + s.speed * 0.07) * (f ? 2.4 : 1) * (1 + s.excite * 3.2) * paceK;
                s.x += s.dir * dt * pace;
                if ((s.x > this.W - s.w * 0.35 && s.dir > 0) || (s.x < s.w * 0.35 && s.dir < 0)) { s.dir = s.dir > 0 ? -1 : 1; s.turn = -1; }
            }
            if (s.turn < 1) s.turn = Math.min(1, s.turn + dt / 220);
            if (s.excite > 0) s.excite = Math.max(0, s.excite - dt / 700);
            if (s.fresh > 0 && s.enter >= 1) s.fresh = Math.max(0, s.fresh - dt);
            s.busy = s.enter < 1 || chase.has(s);
            s.label = s.busy ? Math.max(0, s.label - dt / 160) : Math.min(1, s.label + dt / 500);
        }
        for (let k = rip.length - 1; k >= 0; k--) if (t - rip[k].born >= 900) rip.splice(k, 1);
    }

    /* ── 그리기 ── */
    /** vw · vh = 화면 크기(px), cam = 카메라. 이름표를 그리려면 labels */
    draw(ctx: CanvasRenderingContext2D, vw: number, vh: number, cam: Cam, t: number, dpr: number, labels = true) {
        const night = this.mode === "night", W = this.W, H = this.H, z = cam.z;
        const ox = vw / 2 - cam.x * z, oy = vh / 2 - cam.y * z;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // 세상 밖(멀리 뺐을 때) — 어두운 전시실 · 낮엔 짙은 종이
        const outside = ox > 1 || oy > 1 || ox + W * z < vw - 1 || oy + H * z < vh - 1;
        if (outside) {
            ctx.fillStyle = night ? "#02070D" : "#CDBF9F";
            ctx.fillRect(0, 0, vw, vh);
            ctx.save();
            ctx.shadowColor = night ? "#3E8BB833" : "#00000055"; ctx.shadowBlur = 40;
            ctx.fillStyle = night ? "#0B2335" : "#EFE6D2"; ctx.fillRect(ox, oy, W * z, H * z);
            ctx.restore();
        }
        ctx.save();
        ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * ox, dpr * oy);
        ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
        this.water(ctx, t, cam);
        this.farLayers(ctx, t, cam);
        this.sky(ctx, t, cam);
        this.shafts(ctx, t);
        this.floor(ctx, t);
        // 먼 물고기 — 큰 장식 뒤
        const far = this.sw.filter((s) => s.z >= 0.5), near = this.sw.filter((s) => s.z < 0.5);
        for (const s of far) this.fish(ctx, s, t);
        for (const slot of ["left", "right", "center"] as const) this.ornament(ctx, slot, t);
        this.ornament(ctx, "prop", t);
        for (const s of near) this.fish(ctx, s, t);
        this.bubbles(ctx, t);
        this.foodAndRipples(ctx, t);
        this.particles(ctx, t, cam);
        ctx.restore();
        if (outside) this.glass(ctx, ox, oy, W * z, H * z, vh);
        if (labels && this.size !== "mini") this.labels(ctx, cam, vw, vh);
    }

    /** 멀리 뺐을 때 — 전시실의 큰 수조: 유리에 비친 빛 두 줄 · 테두리 · 받침 · 바닥에 번진 물빛 */
    private glass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vh: number) {
        const night = this.mode === "night";
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        for (const [a, b, al] of [[0.12, 0.2, night ? 0.05 : 0.16], [0.26, 0.29, night ? 0.035 : 0.12]] as const) {
            ctx.fillStyle = `rgba(255,255,255,${al})`;
            ctx.beginPath(); ctx.moveTo(x + w * a, y); ctx.lineTo(x + w * b, y); ctx.lineTo(x + w * b - h * 0.55, y + h); ctx.lineTo(x + w * a - h * 0.55, y + h); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = night ? "#BFE3FF4D" : "#0F28384D"; ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
        // 받침
        const bh = Math.max(6, Math.min(14, h * 0.05));
        ctx.fillStyle = night ? "#0E1B27" : "#5A4A33"; ctx.fillRect(x - 6, y + h, w + 12, bh);
        ctx.fillStyle = night ? "#BFE3FF26" : "#FFFFFF40"; ctx.fillRect(x - 6, y + h, w + 12, 1);
        // 바닥에 번진 물빛
        const gy = y + h + bh, gh = Math.min(vh - gy, h * 0.6);
        if (gh > 4) {
            const g = ctx.createLinearGradient(0, gy, 0, gy + gh);
            g.addColorStop(0, night ? "rgba(62,139,184,0.16)" : "rgba(15,40,56,0.12)"); g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 6, gy); ctx.lineTo(x + w + 6, gy); ctx.lineTo(x + w + w * 0.08, gy + gh); ctx.lineTo(x - w * 0.08, gy + gh); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }

    private water(ctx: CanvasRenderingContext2D, _t: number, _cam: Cam) {
        const night = this.mode === "night", W = this.W, H = this.H, top = this.skyH;
        if (night) {
            const g = ctx.createLinearGradient(0, top, 0, H);
            g.addColorStop(0, "#1E5A7C"); g.addColorStop(0.18, "#164564"); g.addColorStop(0.55, "#0C2A40"); g.addColorStop(1, "#05121E");
            ctx.fillStyle = g; ctx.fillRect(0, top, W, H - top);
        } else {
            ctx.fillStyle = "#EFE6D2"; ctx.fillRect(0, 0, W, H);
            const p = ctx.createPattern(grain(), "repeat");
            if (p) { ctx.fillStyle = p; ctx.fillRect(0, 0, W, H); }
            const g = ctx.createLinearGradient(0, top, 0, H);
            g.addColorStop(0, "#0F283805"); g.addColorStop(0.6, "#0F283812"); g.addColorStop(1, "#0F283824");
            ctx.fillStyle = g; ctx.fillRect(0, top, W, H - top);
            // 먹 물결 — 옅게
            ctx.save(); ctx.strokeStyle = "#0F28381A"; ctx.lineWidth = 1.6;
            for (let r = 0; r < Math.ceil((H - top) / 84); r++) {
                const y0 = top + 60 + r * 84;
                ctx.beginPath();
                for (let x = 0; x <= W; x += 10) { const y = y0 + 6 * Math.sin(x / 46 + _t / 1700 + r); if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    /** 먼 암초 두 겹 + 먼 물고기 떼(장식 · 기록이 아니다 — 바다의 배경) — 카메라보다 느리게 */
    private farLayers(ctx: CanvasRenderingContext2D, t: number, cam: Cam) {
        if (this.size === "mini") return;
        const night = this.mode === "night", W = this.W, base = this.floorTop;
        const layers = [
            { p: 0.45, y: base - 40, hgt: 170, seed: 3, fill: night ? "#0E3149B3" : "#0F28380C", edge: night ? null : "#0F28381F" },
            { p: 0.7, y: base - 8, hgt: 105, seed: 9, fill: night ? "#0A2436D9" : "#0F283814", edge: night ? null : "#0F28382E" },
        ];
        for (const L of layers) {
            ctx.save();
            ctx.translate((cam.x - W / 2) * (1 - L.p), 0);
            ctx.beginPath(); ctx.moveTo(-W, this.H);
            for (let x = -W; x <= W * 2; x += 24) {
                const h = L.hgt * (0.45 + 0.3 * Math.sin(x / 210 + L.seed) + 0.18 * Math.sin(x / 77 + L.seed * 2) + 0.07 * Math.sin(x / 31));
                ctx.lineTo(x, L.y - Math.max(0, h));
            }
            ctx.lineTo(W * 2, this.H); ctx.closePath();
            ctx.fillStyle = L.fill; ctx.fill();
            if (L.edge) { ctx.strokeStyle = L.edge; ctx.lineWidth = 1.6; ctx.stroke(); }
            ctx.restore();
        }
        // 먼 물고기 떼 — 작은 획 스물여섯 개가 함께 돈다
        ctx.save();
        ctx.translate((cam.x - W / 2) * 0.4, 0);
        const cx = W * (0.5 + 0.38 * Math.sin(t / 26000)), cy = this.skyH + 230 + 70 * Math.sin(t / 9000);
        const dir = Math.cos(t / 26000) >= 0 ? 1 : -1;
        ctx.strokeStyle = night ? "#9CC6DD55" : "#0F283830"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
        for (let i = 0; i < 26; i++) {
            const a = rnd(i) * Math.PI * 2, r = 20 + rnd(i + 40) * 70;
            const x = cx + Math.cos(a + t / 3000) * r * 1.6, y = cy + Math.sin(a + t / 3000) * r * 0.5;
            ctx.beginPath(); ctx.moveTo(x - 6 * dir, y); ctx.lineTo(x + 6 * dir, y + Math.sin(t / 200 + i) * 1.2); ctx.stroke();
        }
        ctx.restore();
    }

    /** 물 위 — 하늘 · 배경 그림 · 수면 */
    private sky(ctx: CanvasRenderingContext2D, t: number, cam: Cam) {
        const night = this.mode === "night", W = this.W, S = this.skyH;
        if (S > 0) {
            if (night) {
                const g = ctx.createLinearGradient(0, 0, 0, S);
                g.addColorStop(0, "#040B15"); g.addColorStop(1, "#173553");
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, S + 12);
                for (let i = 0; i < Math.ceil(W / 22); i++) {
                    const a = 0.25 + 0.5 * Math.abs(Math.sin(t / 1500 + i * 1.7));
                    ctx.fillStyle = `rgba(255,248,226,${(a * 0.7).toFixed(3)})`;
                    ctx.fillRect(rnd(i) * W, rnd(i + 99) * S * 0.75, 1.6, 1.6);
                }
            } else {
                ctx.fillStyle = "#F5EFE0"; ctx.fillRect(0, 0, W, S + 12);
            }
            // 배경 그림 — 가운데 한 폭, 멀리 있어 카메라보다 느리게. 양옆은 수평선만 이어진다
            const bg = this.decor.bg;
            ctx.strokeStyle = night ? "#E9DFC855" : "#0F283840"; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.moveTo(0, S - 14); ctx.lineTo(W, S - 14); ctx.stroke();
            if (bg?.img) {
                const ih = S * (bg.item.id === "bg-moon" ? 1.05 : 0.95), iw = ih * bg.img.width / bg.img.height;
                const cx = W / 2 + (cam.x - W / 2) * 0.55;
                ctx.save(); ctx.globalAlpha = night ? 0.9 : 0.85;
                ctx.drawImage(bg.img, cx - iw / 2, S - ih + 4, iw, ih);
                ctx.restore();
            }
        }
        // 수면 — 두 겹의 물결과 바로 밑의 밝은 띠
        ctx.save();
        ctx.beginPath(); ctx.moveTo(0, S);
        for (let x = 0; x <= W; x += 12) ctx.lineTo(x, S + 5 * Math.sin(x / 60 + t / 900) + 2.5 * Math.sin(x / 23 - t / 620));
        if (S > 0) {
            ctx.strokeStyle = night ? "#A8D8F2B3" : "#0F28388C"; ctx.lineWidth = 2.2; ctx.stroke();
            const g = ctx.createLinearGradient(0, S, 0, S + 70);
            g.addColorStop(0, night ? "#7FC3E64D" : "#FFFFFF8C"); g.addColorStop(1, night ? "#7FC3E600" : "#FFFFFF00");
            ctx.fillStyle = g; ctx.fillRect(0, S, W, 70);
        }
        ctx.restore();
    }

    /** 빛줄기 — 수면에서 비스듬히 내려와 깊이 갈수록 사라진다 */
    private shafts(ctx: CanvasRenderingContext2D, t: number) {
        const night = this.mode === "night", W = this.W, S = this.skyH, n = Math.max(3, Math.ceil(W / 270));
        for (let k = 0; k < n; k++) {
            const x = W * (k + 0.3 + 0.4 * rnd(k)) / n + Math.sin(t / 2600 + k) * 28, wTop = 34 + rnd(k + 5) * 40, len = this.H * (0.55 + 0.3 * rnd(k + 9));
            const a = (night ? 0.07 : 0.32) * (0.6 + 0.4 * Math.sin(t / 1900 + k * 2.1));
            const g = ctx.createLinearGradient(0, S, 0, S + len);
            const c = night ? "191,227,255" : "255,255,255";
            g.addColorStop(0, `rgba(${c},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${c},0)`);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(x, S); ctx.lineTo(x + wTop, S); ctx.lineTo(x + wTop + len * 0.32, S + len); ctx.lineTo(x + len * 0.18, S + len); ctx.closePath(); ctx.fill();
        }
    }

    private floor(ctx: CanvasRenderingContext2D, t: number) {
        const night = this.mode === "night", W = this.W, H = this.H, f = this.decor.floor;
        if (f?.img) {
            const th = this.floorH, tw = th * f.img.width / f.img.height;
            for (let x = 0, i = 0; x < W; x += tw - 4, i++) {
                if (i % 2) { ctx.save(); ctx.translate(x + tw, 0); ctx.scale(-1, 1); ctx.drawImage(f.img, 0, H - th, tw, th); ctx.restore(); }
                else ctx.drawImage(f.img, x, H - th, tw, th);
            }
        } else {
            ctx.fillStyle = night ? "#0A1A26" : "#0F28381C";
            ctx.beginPath(); ctx.moveTo(0, H);
            for (let x = 0; x <= W; x += 16) ctx.lineTo(x, this.floorTop + 12 - 10 * Math.sin(x / 60));
            ctx.lineTo(W, H); ctx.fill();
        }
        if (night) {
            // 바닥에 어른거리는 빛 무늬
            ctx.save(); ctx.lineWidth = 3; ctx.lineCap = "round";
            for (let r = 0; r < 3; r++) {
                ctx.strokeStyle = `rgba(207,241,255,${(0.05 + 0.03 * Math.sin(t / 900 + r)).toFixed(3)})`;
                ctx.beginPath();
                const y0 = this.floorTop + 6 + r * 16;
                for (let x = 0; x <= W; x += 14) { const y = y0 + 5 * Math.sin(x / 37 + t / 700 + r * 2) * Math.sin(x / 13 - t / 1100); if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    /** 장식 하나의 그림 자리(세상 좌표) */
    ornamentBox(slot: "left" | "center" | "right" | "prop", t = 0): { x: number; y: number; w: number; h: number } | null {
        const d = this.decor[slot];
        if (!d?.img) return null;
        const it = d.item, k = this.k * (slot === "prop" ? 0.95 : slot === "center" ? 1.08 : 1);
        const hh = it.h * k, ww = hh * d.img.width / d.img.height, cx = this.W * SLOT_X[slot];
        if (it.place === "hang") return { x: cx - ww / 2, y: this.skyH + 46 + Math.sin(t / 1800) * 6, w: ww, h: hh };
        if (it.place === "float") return { x: cx - ww / 2, y: this.skyH - hh * 0.32 + Math.sin(t / 1100) * 5, w: ww, h: hh };
        const base = this.H - this.floorH * 0.36;
        return { x: cx - ww / 2, y: base - hh, w: ww, h: hh };
    }
    private ornament(ctx: CanvasRenderingContext2D, slot: "left" | "center" | "right" | "prop", t: number) {
        const d = this.decor[slot], b = this.ornamentBox(slot, t);
        if (!d?.img || !b) return;
        const night = this.mode === "night", img = d.img;
        if (d.item.place === "hang") {
            ctx.save(); ctx.strokeStyle = night ? "#E9DFC899" : "#0F2838AA"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(b.x + b.w * 0.5, this.skyH - 30); ctx.lineTo(b.x + b.w * 0.5, b.y + 4); ctx.stroke(); ctx.restore();
        }
        if (d.item.glow && night) {
            const gx = b.x + b.w * d.item.glow[0], gy = b.y + b.h * d.item.glow[1], r = 130 * this.k * (0.92 + 0.08 * Math.sin(t / 240));
            const g = ctx.createRadialGradient(gx, gy, 4, gx, gy, r);
            g.addColorStop(0, "rgba(255,226,160,0.75)"); g.addColorStop(0.35, "rgba(255,206,120,0.25)"); g.addColorStop(1, "rgba(255,206,120,0)");
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.fill();
        }
        if (d.item.sway) {
            // 수초 — 가로 띠로 잘라 위쪽일수록 크게 흔든다
            const N = 22, sh = img.height / N;
            for (let i = 0; i < N; i++) {
                const v = 1 - i / N, dx = Math.sin(t / 1500 + i * 0.22 + SLOT_X[slot] * 9) * 16 * Math.pow(v, 1.6) * this.k;
                ctx.drawImage(img, 0, i * sh, img.width, sh + 1, b.x + dx, b.y + (i * b.h) / N, b.w, b.h / N + 0.8);
            }
        } else ctx.drawImage(img, b.x, b.y, b.w, b.h);
    }

    private bubbles(ctx: CanvasRenderingContext2D, t: number) {
        const night = this.mode === "night", W = this.W;
        ctx.save(); ctx.lineWidth = 1.5;
        ctx.strokeStyle = night ? "rgba(200,230,255,0.5)" : "rgba(15,40,56,0.36)";
        // 장식에서 올라오는 거품 줄
        for (const slot of ["left", "center", "right", "prop"] as const) {
            const d = this.decor[slot], b = this.ornamentBox(slot, t);
            if (!d?.item.bubbles || !b) continue;
            const px = b.x + b.w * d.item.bubbles[0], py = b.y + b.h * d.item.bubbles[1];
            for (let i = 0; i < 6; i++) {
                const ph = (t / 4200 + i / 6 + SLOT_X[slot]) % 1, y = py - ph * (py - this.skyH - 6);
                ctx.globalAlpha = 1 - ph * 0.7;
                ctx.beginPath(); ctx.arc(px + Math.sin(ph * 14 + i) * 7, y, 2.6 + ph * 5, 0, Math.PI * 2); ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
        // 물 전체의 거품
        const span = this.floorTop - this.skyH;
        for (let k = 0; k < Math.ceil(W / 80); k++) {
            const bx = rnd(k + 7) * W, r = 2 + (k % 4) * 1.3, y = this.skyH + ((rnd(k + 3) * span - t * (0.03 + (k % 5) * 0.008)) % span + span) % span;
            ctx.beginPath(); ctx.arc(bx + Math.sin(t / 700 + k) * 4, y, r, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
    }

    private foodAndRipples(ctx: CanvasRenderingContext2D, t: number) {
        const night = this.mode === "night";
        for (const f of this.food) {
            ctx.fillStyle = night ? "rgba(248,221,176,0.95)" : "rgba(122,74,30,0.9)";
            ctx.beginPath(); ctx.arc(f.x + Math.sin((t - f.born) / 300) * 2.5, f.y, 4.2, 0, Math.PI * 2); ctx.fill();
        }
        for (const g of this.rip) {
            const a = (t - g.born) / 900;
            if (a < 0 || a >= 1) continue;
            ctx.strokeStyle = night ? `rgba(220,240,255,${(0.6 * (1 - a)).toFixed(3)})` : `rgba(15,40,56,${(0.5 * (1 - a)).toFixed(3)})`;
            ctx.lineWidth = 2;
            for (const m of [1, 0.6]) { ctx.beginPath(); ctx.ellipse(g.x, g.y, (12 + a * 52) * m, (4 + a * 15) * m, 0, 0, Math.PI * 2); ctx.stroke(); }
        }
    }

    /** 떠다니는 부유물 — 가까이 있어 카메라보다 빠르게 */
    private particles(ctx: CanvasRenderingContext2D, t: number, cam: Cam) {
        if (this.size === "mini") return;
        const night = this.mode === "night", W = this.W, span = this.H - this.skyH;
        ctx.save();
        ctx.translate(-(cam.x - W / 2) * 0.28, 0);
        ctx.fillStyle = night ? "rgba(220,239,255,0.28)" : "rgba(15,40,56,0.2)";
        const n = Math.ceil(W / 22);
        for (let i = 0; i < n; i++) {
            const x = ((rnd(i) * W * 1.6 + t * 0.004 * (rnd(i + 1) - 0.5)) % (W * 1.6) + W * 1.6) % (W * 1.6) - W * 0.3;
            const y = this.skyH + ((rnd(i + 2) * span + t * 0.006 * (0.4 + rnd(i + 3))) % span);
            const r = 1.2 + rnd(i + 4) * 2;
            ctx.beginPath(); ctx.arc(x + Math.sin(t / 1800 + i) * 6, y, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    private fish(ctx: CanvasRenderingContext2D, s: Swimmer, t: number) {
        if (!s.img) return;
        const bob = s.enter < 1 ? 0 : Math.sin(t / 1300 + s.phase) * 8;
        s.y = s.cy + bob;
        const N = 36, sx = s.img.width / N, flip = s.dir * s.turn, beat = 1 + s.speed + s.excite * 2.4;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.scale(-flip, 1); // 그림의 머리는 왼쪽 — 오른쪽으로 가면 뒤집는다
        // 먼 물고기는 물빛에 묻힌다
        ctx.globalAlpha = (this.sample ? 0.45 : 1) * (1 - 0.42 * s.z);
        for (let i = 0; i < N; i++) {
            const u = i / N, amp = (0.004 + Math.pow(u, 1.6) * 0.055) * s.w;
            const dy = Math.sin((t / 260) * beat + s.phase - u * 4.2) * amp * (1 + s.excite * 0.6);
            ctx.drawImage(s.img, i * sx, 0, sx + 1, s.img.height, -s.w / 2 + u * s.w, -s.h / 2 + dy, s.w / N + 0.6, s.h);
        }
        ctx.restore();
    }

    /** 이름표 · 낙관 · '새로' — 화면 글자 크기 그대로 */
    private labels(ctx: CanvasRenderingContext2D, cam: Cam, vw: number, vh: number) {
        const night = this.mode === "night";
        ctx.save();
        ctx.font = "600 12px 'Pretendard Variable', Pretendard, sans-serif";
        ctx.textAlign = "center";
        for (const s of this.sw) {
            const sw = s.w * cam.z;
            if (s.label <= 0.02 || !s.img || sw < 46) continue;
            const x = vw / 2 + (s.x - cam.x) * cam.z, yb = vh / 2 + (s.y + s.h / 2 - cam.y) * cam.z, yt = vh / 2 + (s.y - s.h / 2 - cam.y) * cam.z;
            if (x < -60 || x > vw + 60 || yb < -20 || yt > vh + 20) continue;
            ctx.globalAlpha = s.label * (1 - 0.3 * s.z);
            ctx.fillStyle = night ? "rgba(244,234,214,0.82)" : "rgba(15,40,56,0.76)";
            const name = this.sample ? `${s.fish.name} · 예시` : s.fish.name;
            ctx.fillText(name, x, yb + 10);
            if (s.fresh > 0 && s.enter >= 1) {
                ctx.globalAlpha = Math.min(1, s.fresh / 800) * s.label;
                const nw = ctx.measureText(name).width, px = x + nw / 2 + 22, py = yb + 10;
                ctx.fillStyle = "#E8C46A"; ctx.beginPath();
                ctx.moveTo(px - 8, py - 12); ctx.lineTo(px + 8, py - 12); ctx.arc(px + 8, py - 3.5, 8.5, -Math.PI / 2, Math.PI / 2); ctx.lineTo(px - 8, py + 5); ctx.arc(px - 8, py - 3.5, 8.5, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill();
                ctx.fillStyle = "#2D1A08"; ctx.fillText("새로", px, py);
            }
            if (s.seal && !this.sample) {
                ctx.globalAlpha = s.label;
                const flip = s.dir * s.turn, tw = ctx.measureText(s.seal).width + 12, hx = x + (flip > 0 ? sw / 2 - tw / 2 - 4 : -sw / 2 + tw / 2 + 4);
                ctx.save(); ctx.translate(hx, yt - 2); ctx.rotate(-0.08);
                ctx.fillStyle = "#C8372D"; ctx.fillRect(-tw / 2, -10, tw, 19);
                ctx.fillStyle = "#FFF4EC"; ctx.fillText(s.seal, 0, 4);
                ctx.restore();
            }
        }
        ctx.restore();
    }
}
