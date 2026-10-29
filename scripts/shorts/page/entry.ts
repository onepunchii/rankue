/**
 * 쇼츠 렌더 페이지(브라우저에서 돈다). window.__DATA 의 샷을 다시 시뮬해 ThreeRenderer 로 그리고,
 * 위에 2D 캔버스로 자막 · 카운터 · 그래픽을 얹는다. window.seek(vt) 한 번 = 영상 한 프레임.
 *
 * 결정론: 렌더러 시계(now)를 영상 시각에 묶어 둔다 — 공 회전 적분과 카메라 감쇠가 벽시계가 아니라 프레임 간격(1/FPS)을 쓴다.
 * 그래서 프레임을 **처음부터 순서대로** 찍어야 같은 영상이 나온다(카메라 감쇠는 앞 프레임에 기대므로).
 */
import { ThreeRenderer } from "../../../client/src/sim/render/ThreeRenderer";
import type { RenderFrame } from "../../../client/src/sim/render/Renderer";
import { brandImage } from "../../../client/src/sim/render/tableBrandArt";
import type { TableBrandView } from "@shared/tableBrand";
import { makePlayback, effectiveBall } from "../../../client/src/sim/playback";
import { simulateShot } from "@shared/sim/simulate";
import type { BallState, ShotInput } from "@shared/sim/types";
import type { SimParams } from "@shared/sim/params";
import { buildTimeline, sceneAt, totalDuration, type FitOptions, type Scene } from "../timeline";
import { STRINGS, type Lang } from "./strings";

interface Line { start: number; end: number; text: string; speaker?: string }
interface Data {
    shot: { preState: BallState[]; input: ShotInput; params: SimParams; hash: string };
    facts: any;
    lines: Line[];
    wordmark?: string;
    /** 앱 테이블에 지금 걸린 로고(sim_table_brands) — image 는 data URI 로 바꿔 넣는다 */
    brand?: TableBrandView | null;
    /** 배경 노래에 맞출 때(득점 = 외침 시각, 전체 = 곡 길이) */
    fit?: FitOptions;
    /** 기적 지수 시도별 입력 [phi, V0, a, b](facts.ts 의 trials.json) — 1,000개 궤적 부채꼴을 그린다 */
    trials?: [number, number, number, number][];
    /** 화면 글자 언어(채널마다) — 기본 en */
    lang?: Lang;
}
declare global {
    interface Window { __DATA: Data; seek(vt: number): void; brandReady(): boolean; shortsReady: { duration: number; fps: number } }
}

const W = 1080, H = 1920;
const ACCENT = "#FFD23F";
const INK = "#0B0F14";
const FONT = `"Pretendard", "Apple SD Gothic Neo", sans-serif`;

const { shot, facts, lines, wordmark, brand, fit, trials, lang } = window.__DATA;
const T = STRINGS[lang ?? "en"];
const input = shot.input;
const res = simulateShot(shot.preState, input, shot.params);
if (res.hash !== shot.hash) throw new Error("재시뮬 해시 불일치");
const pb = makePlayback(res, effectiveBall(shot.params));
const tl = facts.timeline as { t: number; kind: "cushion" | "contact"; n: number; ball?: string }[];
const contact2 = tl.find((x) => x.kind === "contact" && x.n === 2)!.t;
const cushionTimes = tl.filter((x) => x.kind === "cushion").map((x) => x.t);
const scenes = buildTimeline({ contact2, lastCushion: cushionTimes[cushionTimes.length - 1] ?? contact2, duration: res.duration }, fit ?? {});
const total = totalDuration(scenes);
const slowScene = scenes.find((x) => x.id === "slow")!;
const contactVt = slowScene.start + (contact2 - slowScene.shotFrom) / (slowScene.shotTo - slowScene.shotFrom) * slowScene.dur;

// ── 무대 ─────────────────────────────────────────────
const stage = document.getElementById("stage")!;
const overlay = document.getElementById("overlay") as HTMLCanvasElement;
const ctx = overlay.getContext("2d")!;
let clockMs = 0;
let insets = { top: 300, right: 40, bottom: 520, left: 40 };
const renderer = new ThreeRenderer({ dpr: 1, now: () => clockMs, insets: () => insets }) // 그림자 맵(512²)은 1080p 에서 계단이 보여 앱 기본(접촉 그림자)만 쓴다;
renderer.mount(stage, shot.params.table);
renderer.resize();
if (brand) renderer.setBrand(brand);
// 로고 그림은 비동기로 읽힌다 — 첫 프레임 전에 render.ts 가 이걸로 기다린다
window.brandReady = () => !brand || brandImage(brand.image) !== null;
const logo = new Image();
if (wordmark) logo.src = wordmark;

// 큐볼 궤적(위에서 보기 장면용) — 1/120 s 격자
const cueTrail: { t: number; x: number; y: number }[] = [];
for (let t = 0; t <= contact2 + 1e-9; t += 1 / 120) {
    const b = pb.at(t).find((x) => x.id === input.cueBallId)!;
    cueTrail.push({ t, x: b.r[0], y: b.r[1] });
}
const cushionPts = cushionTimes.map((t) => { const b = pb.at(t).find((x) => x.id === input.cueBallId)!; return { t, x: b.r[0], y: b.r[1] }; });

// 1,000개 궤적(기적 지수 장면) — 시도마다 다시 시뮬해 큐볼 위치를 1/60 s 로 뽑아 둔다.
// 득점한 시도는 두 번째 적구에 닿을 때까지, 못 한 시도는 원래 득점 시각 + 0.6 s 까지 그린다(missEnd).
const FAN_DT = 1 / 60;
const missEnd = contact2 + 0.6;
const fan = (trials ?? []).map(([phi, V0, a, b], i) => {
    const ok = facts.miracle.hitMask[i] === "1";
    let r: ReturnType<typeof simulateShot>;
    try { r = simulateShot(shot.preState, { ...input, phi, V0, a, b }, shot.params); }
    catch { return null; } // 미스큐 등 범위 밖 시도(facts.ts 에서도 실패로 셌다)는 궤적 없이 건너뛴다
    const tp = makePlayback(r, effectiveBall(shot.params));
    let end = Math.min(missEnd, r.duration);
    if (ok) {
        let n = 0;
        for (const e of r.events) if (e.type === "ball-ball" && e.ids.includes(input.cueBallId) && ++n === 2) { end = e.t; break; }
    }
    const pts: number[] = [];
    for (let t = 0; t <= end + 1e-9; t += FAN_DT) { const c = tp.at(t).find((x) => x.id === input.cueBallId)!; pts.push(c.r[0], c.r[1]); }
    return { ok, end, pts, screen: null as Float32Array | null };
}).filter((x) => x !== null);
const fanCanvas = document.createElement("canvas");
fanCanvas.width = W; fanCanvas.height = H;
const fanCtx = fanCanvas.getContext("2d")!;
let fanDrawnTo = -1; // 몇 번째 샘플까지 그렸나(프레임을 순서대로 찍으니 이어서 그리면 된다)
// 길이 다 자라는 시각 — 득점이 늦은 시도도 끝까지 그려져야 숫자가 실제 성공 수에서 멈춘다
const fanEnd = fan.reduce((mx, f) => Math.max(mx, f.end), missEnd);

function ballsAt(shotT: number, scene: Scene): readonly BallState[] {
    if (scene.id === "aim" || scene.id === "miracle") return shot.preState;
    return pb.at(shotT);
}

function cushionsSoFar(shotT: number): number {
    let n = 0;
    for (const t of cushionTimes) if (t <= shotT) n++;
    return n;
}

// ── 글자 ─────────────────────────────────────────────
function text(s: string, x: number, y: number, size: number, opts: { color?: string; align?: CanvasTextAlign; weight?: number; stroke?: number; max?: number } = {}) {
    ctx.font = `${opts.weight ?? 800} ${size}px ${FONT}`;
    // 언어마다 길이가 달라(베트남어가 길다) 폭을 넘으면 글자를 줄인다
    const maxW = opts.max ?? W - 80;
    const w0 = ctx.measureText(s).width;
    if (w0 > maxW) { size = Math.floor(size * maxW / w0); ctx.font = `${opts.weight ?? 800} ${size}px ${FONT}`; }
    ctx.textAlign = opts.align ?? "center";
    ctx.textBaseline = "middle";
    if (opts.stroke) {
        ctx.lineJoin = "round";
        ctx.lineWidth = opts.stroke;
        ctx.strokeStyle = INK;
        ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = opts.color ?? "#fff";
    ctx.fillText(s, x, y);
}

function wrap(s: string, maxW: number, size: number): string[] {
    ctx.font = `800 ${size}px ${FONT}`;
    const words = s.split(" ");
    const out: string[] = [];
    let cur = "";
    for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (ctx.measureText(next).width > maxW && cur) { out.push(cur); cur = w; } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
}

function chip(label: string, x: number, y: number, size: number, align: "left" | "right" | "center" = "left", fill = "rgba(11,15,20,0.78)", color = "#fff") {
    ctx.font = `700 ${size}px ${FONT}`;
    const w = ctx.measureText(label).width + size * 1.1;
    const h = size * 1.9;
    const x0 = align === "left" ? x : align === "right" ? x - w : x - w / 2;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x0, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x0 + w / 2, y + 1);
    return w;
}

const ease = (p: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3);

// ── 그래픽 층 ─────────────────────────────────────────
const playerName = (ko: string) => T.player(ko.replace("플레이어", "").trim()); // facts 는 "플레이어 A/B"

/** 중계 스코어보드: 위 줄 = 언제 · 어디서, 아래 줄 = 두 선수 점수(친 사람 쪽에 "TO SHOOT")와 이닝 · 목표. */
function drawTopBar() {
    const sb = facts.situation.scoreBefore;
    const shooterBall = input.cueBallId; // 친 사람의 공 색
    const otherBall = shooterBall === "white" ? "yellow" : "white";
    const ballFill = (id: string) => (id === "yellow" ? "#F2C230" : "#F4F1EA");
    // 위 줄
    chip(T.when(facts.when.iso), 40, 56, 28, "left", "rgba(11,15,20,0.78)", "rgba(255,255,255,0.85)");
    chip(T.tag, W - 40, 56, 28, "right", "rgba(11,15,20,0.78)", "rgba(255,255,255,0.85)");
    // 아래 줄 — 가운데 이닝 칸을 사이에 두고 좌우 선수
    const y = 140, h = 96, mid = 200, side = 360, x0 = (W - mid - side * 2) / 2;
    ctx.fillStyle = "rgba(11,15,20,0.86)";
    ctx.beginPath(); ctx.roundRect(x0, y - h / 2, side * 2 + mid, h, 22); ctx.fill();
    ctx.fillStyle = ACCENT;
    ctx.beginPath(); ctx.roundRect(x0 + side, y - h / 2, mid, h, 0); ctx.fill();
    text(T.inning(facts.situation.inning), W / 2, y - 14, 32, { color: INK, weight: 900, max: mid - 16 });
    text(T.raceTo(facts.situation.target), W / 2, y + 22, 22, { color: INK, weight: 700, max: mid - 16 });
    const player = (name: string, score: number, ball: string, left: boolean, turn: boolean) => {
        const cx = left ? x0 + side / 2 : x0 + side + mid + side / 2;
        const bx = left ? x0 + 40 : x0 + side * 2 + mid - 40;
        ctx.fillStyle = ballFill(ball);
        ctx.beginPath(); ctx.arc(bx, y, 16, 0, Math.PI * 2); ctx.fill();
        text(name, cx, y - 16, 28, { weight: 700, color: "rgba(255,255,255,0.8)" });
        if (turn) text(T.toShoot, cx, y + 26, 20, { weight: 800, color: ACCENT });
        text(String(score), left ? x0 + side - 40 : x0 + side + mid + 40, y + 2, 64, { weight: 900, align: "center" });
    };
    player(playerName(facts.players.shooter), sb.shooter, shooterBall, true, true);
    player(playerName(facts.players.other), sb.other, otherBall, false, false);
}

/** 쿠션 카운터(위 가운데) + 두 번째 적구에 닿으면 "SCORE!" 도장. */
function drawCounter(shotT: number, scene: Scene) {
    const n = cushionsSoFar(shotT);
    const last = cushionTimes[n - 1];
    // 쿠션에 닿은 직후 영상 0.2초 동안 숫자가 커졌다 돌아온다
    const rate = Math.max(1e-6, (scene.shotTo - scene.shotFrom) / scene.dur);
    const since = last === undefined ? 1 : (shotT - last) / rate / 0.2;
    const pop = 1 + 0.3 * Math.max(0, 1 - since);
    ctx.save();
    ctx.translate(W / 2 - 40, 330);
    ctx.scale(pop, pop);
    text(String(n), 0, 0, 200, { color: n >= 3 ? ACCENT : "#fff", stroke: 18, weight: 900 });
    ctx.restore();
    text(T.cushions(n), W / 2 + 80, 370, 40, { stroke: 10, align: "left", weight: 900 });
    if (shotT >= contact2) {
        const k = ease((shotT - contact2) / rate / 0.25);
        ctx.save();
        ctx.globalAlpha = k;
        ctx.translate(W / 2, 550);
        ctx.rotate(-0.06);
        ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
        chip(T.score, 0, 0, 84, "center", ACCENT, INK);
        ctx.restore();
    }
}

function drawSubtitle(vt: number) {
    const line = lines.find((l) => vt >= l.start && vt < l.end);
    if (!line) return;
    const rows = wrap(line.text, W - 160, 66).slice(0, 2);
    const y0 = 1560 - (rows.length - 1) * 44;
    rows.forEach((r, i) => text(r, W / 2, y0 + i * 88, 66, { stroke: 16, color: line.speaker === "해설" ? ACCENT : "#fff" }));
}

function drawHook(p: number) {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, W, H);
    const k = ease(p / 0.25);
    ctx.save();
    ctx.globalAlpha = k;
    text(T.hook[0], W / 2, 330, 150, { stroke: 22, weight: 900 });
    text(T.hook[1], W / 2, 500, 190, { stroke: 24, weight: 900, color: ACCENT });
    ctx.restore();
    chip(T.hookSub, W / 2, 680, 40, "center");
}

function drawRewind(p: number) {
    ctx.fillStyle = "rgba(10,14,20,0.35)";
    ctx.fillRect(0, 0, W, H);
    for (let y = (p * 900) % 12; y < H; y += 12) { ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(0, y, W, 2); }
    text(T.rewind, W / 2, 420, 92, { stroke: 18, weight: 900 });
}

/**
 * 치기 전 카드: 왼쪽 = 큐볼 정면 그림에 큐 끝이 닿는 자리(당점), 오른쪽 = 세기 10칸 게이지.
 * 당점 점이 가운데서 제자리로 미끄러지고, 게이지는 큐를 당기는 동안 차오르다 큐가 나가는 순간(p≈0.86) 번쩍인다.
 */
function drawAim(p: number) {
    drawTopBar();
    const k = ease(p / 0.15);
    const x0 = 40, y0 = 230, w = W - 80, h = 330;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = "rgba(11,15,20,0.86)";
    ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 28); ctx.fill();

    // 당점 공
    const R = 120, cx = x0 + 40 + R, cy = y0 + h / 2 - 8;
    ctx.fillStyle = input.cueBallId === "yellow" ? "#F2C230" : "#F4F1EA";
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    // 공처럼 보이게: 공 안을 살짝 어둡게 칠하고, 왼쪽 위로 조금 옮긴 원을 다시 공 색으로 — 오른쪽 아래에 얇은 그늘만 남는다
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.fillStyle = input.cueBallId === "yellow" ? "#F2C230" : "#F4F1EA";
    ctx.beginPath(); ctx.arc(cx - R * 0.07, cy - R * 0.07, R * 0.97, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(11,15,20,0.25)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.arc(cx, cy, R * shot.params.cue.maxOffset, 0, Math.PI * 2); ctx.stroke(); // 큐가 닿을 수 있는 한계 — 앱 당점 시트와 같은 링
    ctx.setLineDash([]);
    const slide = ease((p - 0.1) / 0.3);
    const tx = cx + input.a * R * slide, ty = cy - input.b * R * slide; // a · b 는 R 의 비율(앱 SpinSheet 와 같은 사상)
    ctx.fillStyle = "#D8262C";
    ctx.beginPath(); ctx.arc(tx, ty, 20, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
    text(`${T.side(input.a)} · ${T.vert(input.b)}`, cx, y0 + h - 22, 28, { weight: 700, color: "rgba(255,255,255,0.85)", max: R * 2 + 60 });

    // 세기 게이지
    const gx = cx + R + 70, gw = x0 + w - 40 - gx, pct = facts.shot.cuePowerPct as number;
    const word = T.strength(pct);
    const fill = ease((p - 0.15) / 0.6) * pct / 100;
    text(T.power, gx, y0 + 70, 34, { align: "left", weight: 700, color: "rgba(255,255,255,0.8)" });
    text(`${Math.round(fill * 100)}%`, gx + gw, y0 + 70, 64, { align: "right", weight: 900, color: ACCENT });
    const segs = 10, gap = 8, sw = (gw - gap * (segs - 1)) / segs, sy = y0 + 130, sh = 96;
    const flash = p > 0.85 && p < 0.93;
    for (let i = 0; i < segs; i++) {
        const lit = fill * segs - i; // 0..1 이면 그 칸이 차오르는 중
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.beginPath(); ctx.roundRect(gx + i * (sw + gap), sy, sw, sh, 10); ctx.fill();
        if (lit <= 0) continue;
        const col = i < 5 ? "#F4F1EA" : i < 8 ? ACCENT : "#FF5A3C";
        ctx.fillStyle = flash ? "#FFFFFF" : col;
        const fh = sh * Math.min(1, lit);
        ctx.beginPath(); ctx.roundRect(gx + i * (sw + gap), sy + sh - fh, sw, fh, 10); ctx.fill();
    }
    text(word, gx, y0 + h - 40, 40, { align: "left", weight: 900 });
    ctx.restore();
}

/** 위에서 본 큐볼 길을 샷 시각까지 긋고, 지나간 쿠션에 번호를 찍는다. */
function drawTrail(shotT: number) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    let started = false;
    for (const q of cueTrail) {
        if (q.t > shotT) break;
        const [sx, sy] = renderer.project(q.x, q.y);
        if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 16;
    ctx.stroke();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 9;
    ctx.stroke();
    // 쿠션 번호
    cushionPts.forEach((c, i) => {
        if (c.t > shotT) return;
        const [sx, sy] = renderer.project(c.x, c.y);
        const k = ease((shotT - c.t) / 0.15);
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(sx, sy, 34 * k, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ACCENT;
        ctx.beginPath(); ctx.arc(sx, sy, 28 * k, 0, Math.PI * 2); ctx.fill();
        if (k > 0.5) text(String(i + 1), sx, sy + 1, 34, { color: INK, weight: 900 });
    });
    // 지금 큐볼 자리에 링 — 위에서 보면 공이 작아 눈이 놓친다
    const now = pb.at(Math.min(shotT, contact2)).find((x) => x.id === input.cueBallId)!;
    const [qx, qy] = renderer.project(now.r[0], now.r[1]);
    ctx.lineWidth = 12; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.arc(qx, qy, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = "#fff";
    ctx.beginPath(); ctx.arc(qx, qy, 30, 0, Math.PI * 2); ctx.stroke();
}

/**
 * 1,000번 다시 친 결과: 위에서 본 테이블에서 1,000개의 큐볼 길이 한꺼번에 뻗어 나가며 갈라진다.
 * 못 넣은 길은 옅은 흰 선, 넣은 길은 노란 선 — 노란 길이 두 번째 적구에 닿을 때마다 숫자가 올라간다.
 */
function drawMiracle(p: number) {
    ctx.fillStyle = "rgba(8,11,15,0.5)";
    ctx.fillRect(0, 0, W, H);
    const m = facts.miracle;
    text(T.reshot[0], W / 2, 150, 60, { stroke: 12 });
    text(T.reshot[1](m.trials), W / 2, 240, 84, { color: ACCENT, weight: 900, stroke: 14 });
    text(T.reshotSub, W / 2, 325, 30, { weight: 600, color: "rgba(255,255,255,0.8)", stroke: 8 });

    let lit: number;
    if (fan.length) {
        if (!fan[0].screen) for (const f of fan) {
            const sc = new Float32Array(f.pts.length);
            for (let j = 0; j < f.pts.length; j += 2) { const [x, y] = renderer.project(f.pts[j], f.pts[j + 1]); sc[j] = x; sc[j + 1] = y; }
            f.screen = sc;
        }
        // 길이 자라는 시각: 장면의 앞 6할 동안 0 → fanEnd
        const tau = fanEnd * Math.min(1, p / 0.6);
        const upTo = Math.floor(tau / FAN_DT);
        if (upTo > fanDrawnTo) {
            fanCtx.lineCap = "round";
            for (const pass of [false, true]) { // 못 넣은 길을 먼저, 넣은 길을 위에
                fanCtx.strokeStyle = pass ? "rgba(255,210,63,0.30)" : "rgba(255,255,255,0.05)";
                fanCtx.lineWidth = pass ? 2.5 : 2;
                fanCtx.beginPath();
                for (const f of fan) {
                    if (f.ok !== pass) continue;
                    const sc = f.screen!, last = sc.length / 2 - 1;
                    const a = Math.max(0, fanDrawnTo), b = Math.min(upTo, last);
                    if (b <= a) continue;
                    fanCtx.moveTo(sc[a * 2], sc[a * 2 + 1]);
                    for (let j = a + 1; j <= b; j++) fanCtx.lineTo(sc[j * 2], sc[j * 2 + 1]);
                }
                fanCtx.stroke();
            }
            fanDrawnTo = upTo;
        }
        ctx.drawImage(fanCanvas, 0, 0);
        lit = fan.filter((f) => f.ok && f.end <= tau).length;
    } else {
        lit = Math.round(m.hits * ease(p / 0.6));
    }
    text(T.made(lit), W / 2, 1690, 120, { color: ACCENT, weight: 900, stroke: 16 });
    if (p > 0.62) {
        const k = ease((p - 0.62) / 0.15);
        ctx.save(); ctx.globalAlpha = k;
        // 한 번도 안 들어갔으면 그게 이 영상의 펀치라인이다
        text(T.rate(m.hits, m.trials), W / 2, 1810, 60, { stroke: 12 });
        ctx.restore();
    }
}

/** 다운로드 아이콘(원 안의 아래 화살표). 스토어 로고는 상표라 그리지 않는다 — 공식 배지 파일이 생기면 이 자리에 그림으로. */
function downloadIcon(x: number, y: number, r: number) {
    ctx.strokeStyle = "#fff"; ctx.lineWidth = r * 0.16; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - r * 0.5); ctx.lineTo(x, y + r * 0.35);
    ctx.moveTo(x - r * 0.38, y); ctx.lineTo(x, y + r * 0.4); ctx.lineTo(x + r * 0.38, y); ctx.stroke();
}

/** 스토어 배지 모양 버튼: 검은 판 + 흰 테두리, 왼쪽 아이콘, 작은 글씨 위 · 큰 글씨 아래. */
function storeButton(x: number, y: number, w: number, h: number, small: string, big: string) {
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 26); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 3; ctx.stroke();
    downloadIcon(x + 90, y + h / 2, 38);
    text(small, x + 160, y + h / 2 - 28, 30, { align: "left", weight: 600, color: "rgba(255,255,255,0.85)" });
    text(big, x + 158, y + h / 2 + 18, 58, { align: "left", weight: 800 });
}

/** 마지막 화면은 영어(2026-10-28 오너: 외국인도 본다) — 스토어 배지 문구도 공식 배지와 같은 말로. */
function drawOutro(p: number) {
    ctx.fillStyle = "rgba(8,11,15,0.9)";
    ctx.fillRect(0, 0, W, H);
    const k = ease(p / 0.25);
    ctx.save(); ctx.globalAlpha = k;
    text(T.outro[0], W / 2, 420, 100, { weight: 900 });
    text(T.outro[1], W / 2, 540, 100, { weight: 900, color: ACCENT });
    if (logo.complete && logo.naturalWidth) {
        const lw = 460, lh = lw * logo.naturalHeight / logo.naturalWidth;
        ctx.drawImage(logo, (W - lw) / 2, 660, lw, lh);
    } else text("RANKUE", W / 2, 700, 90, { weight: 900 });
    text(T.outroSub, W / 2, 820, 40, { weight: 600, color: "rgba(255,255,255,0.8)" });
    ctx.restore();
    // 버튼 두 개가 차례로 올라온다
    const bw = 720, bh = 160, bx = (W - bw) / 2;
    ([[...T.ios, 0.12], [...T.android, 0.22]] as const).forEach(([small, big, delay], i) => {
        const q = ease((p - delay) / 0.2);
        ctx.save();
        ctx.globalAlpha = q;
        ctx.translate(0, (1 - q) * 60);
        storeButton(bx, 930 + i * (bh + 34), bw, bh, small, big);
        ctx.restore();
    });
    const q = ease((p - 0.35) / 0.2);
    ctx.save(); ctx.globalAlpha = q;
    chip(T.search, W / 2, 1360, 46, "center", ACCENT, INK);
    ctx.restore();
}

// ── 카메라 ───────────────────────────────────────────
function viewFor(scene: Scene, balls: readonly BallState[]): RenderFrame["view"] {
    const cue = balls.find((b) => b.id === input.cueBallId)!;
    if (scene.id === "hook" || scene.id === "slow" || scene.id === "settle") {
        // 큐볼 뒤에서 두 번째 적구를 바라본다 — 득점 순간이 화면 가운데로 온다
        const target = balls.find((b) => b.id === facts.timeline.find((x: any) => x.kind === "contact" && x.n === 2).ball)!;
        return { cueBallId: input.cueBallId, phi: Math.atan2(target.r[1] - cue.r[1], target.r[0] - cue.r[0]), mode: "follow" };
    }
    if (scene.id === "aim") return { cueBallId: input.cueBallId, phi: input.phi, mode: "follow" };
    return { cueBallId: input.cueBallId, phi: input.phi, mode: "overview", pitch: 58 };
}

let lastScene: string | null = null;
window.seek = (vt: number) => {
    clockMs = vt * 1000;
    const { scene, p, shotT } = sceneAt(scenes, vt);
    const top = scene.id === "play" || scene.id === "miracle" || scene.id === "outro";
    if (scene.id !== lastScene) {
        insets = scene.id === "miracle" ? { top: 380, right: 70, bottom: 330, left: 70 }
            : top ? { top: 380, right: 50, bottom: 110, left: 50 } : { top: 0, right: 0, bottom: 0, left: 0 };
        renderer.resize();
        renderer.setView(top ? "top" : "player");
        renderer.setZoom(scene.id === "aim" ? 1 : scene.id === "settle" ? 1.9 : 1.35);
        lastScene = scene.id;
    }
    // 슬로모션 동안 득점 쪽으로 천천히 다가간다(줌은 렌더러가 감쇠로 따라온다)
    if (scene.id === "slow") renderer.setZoom(1.3 + 0.6 * ease(p));
    const balls = ballsAt(shotT, scene);
    const pull = scene.id === "aim" ? (p < 0.8 ? 0.25 + 0.35 * (0.5 - 0.5 * Math.cos(p / 0.8 * Math.PI * 3)) : Math.max(0, 0.6 * (1 - (p - 0.8) / 0.08))) : 0;
    renderer.draw({
        balls,
        cue: { phi: input.phi, pullback: pull, visible: scene.id === "aim" && p < 0.9, ballId: input.cueBallId },
        view: top ? undefined : viewFor(scene, balls),
    });

    ctx.clearRect(0, 0, W, H);
    switch (scene.id) {
        case "hook": drawHook(p); break;
        case "rewind": drawRewind(p); break;
        case "aim": drawAim(p); break;
        case "play": drawTopBar(); drawTrail(shotT); drawCounter(shotT, scene); break;
        case "slow": case "settle": drawTopBar(); drawCounter(shotT, scene); break;
        case "miracle": drawMiracle(p); break;
        case "outro": drawOutro(p); break;
    }
    // 득점 순간(노래의 외침) 짧은 흰 번쩍임
    const since = vt - contactVt;
    if (since >= 0 && since < 0.2) { ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - since / 0.2)})`; ctx.fillRect(0, 0, W, H); }
    drawSubtitle(vt);
};

window.shortsReady = { duration: total, fps: 30 };
