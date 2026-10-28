/**
 * 쇼츠 3단계 — 프레임 찍기 + 공 소리 + 음성 합쳐 output.mp4.
 *
 *   npx tsx scripts/shorts/render.ts <slug> [--preview] [--music <곡.json> | --no-music]
 *
 *  - out/<slug>/shot.json · facts.json 이 있어야 한다(facts.ts). lines.json(narrate.ts)이 있으면 자막과 음성을 넣는다.
 *  - 배경 노래(기본 music/rankue-rankue.json): 득점 순간을 곡의 외침(hit)에 맞추고 영상 길이를 곡 길이에 맞춘다.
 *    노래가 있으면 공 소리는 그 밑에 작게 깐다. 2026-10-28 오너: 노래가 있으면 TTS 는 넣지 않는다.
 *  - 테이블 로고: 앱이 지금 거는 것(sim_table_brands, DB 읽기만)을 그대로 테이블 천에 올린다.
 *  - --preview: 장면마다 가운데 한 장씩만 찍어 preview/ 에 둔다(전체 렌더 전에 눈으로 보기).
 *  - 공 소리는 앱과 같은 절차 합성(client/src/sim/audio.ts renderSound)을 장면표대로 영상 시각에 다시 놓는다.
 */
import { build } from "esbuild";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { simulateShot } from "@shared/sim/simulate";
import { renderSound } from "../../client/src/sim/audio";
import { eventsForFeedback } from "../../client/src/sim/playback";
import { impulseToGain, playbackRateFor } from "../../client/src/sim/audioMapping";
import { buildTimeline, sceneAt, totalDuration, videoTimesOfShotTime, FPS, type FitOptions } from "./timeline";
import { pickBrands, type BrandTableId, type TableBrandRow, type TableBrandView } from "@shared/tableBrand";
import { readOnlyDb } from "./db";

const slug = process.argv[2];
const preview = process.argv.includes("--preview");
if (!slug) throw new Error("사용법: tsx scripts/shorts/render.ts <slug> [--preview]");
const dir = `scripts/shorts/out/${slug}`;
const shot = JSON.parse(readFileSync(`${dir}/shot.json`, "utf8"));
const facts = JSON.parse(readFileSync(`${dir}/facts.json`, "utf8"));
const trials = existsSync(`${dir}/trials.json`) ? JSON.parse(readFileSync(`${dir}/trials.json`, "utf8")) : undefined;
const lines = existsSync(`${dir}/lines.json`) ? JSON.parse(readFileSync(`${dir}/lines.json`, "utf8")) : [];

const res = simulateShot(shot.preState, shot.input, shot.params);
const contact2 = facts.timeline.find((x: any) => x.kind === "contact" && x.n === 2).t;
const cushions = facts.timeline.filter((x: any) => x.kind === "cushion").map((x: any) => x.t);

// ── 노래 ─────────────────────────────────────────────
const musicArg = process.argv.indexOf("--music");
const musicJson = process.argv.includes("--no-music") ? null
    : musicArg > 0 ? process.argv[musicArg + 1] : "scripts/shorts/music/rankue-rankue.json";
const music = musicJson && existsSync(musicJson) ? JSON.parse(readFileSync(musicJson, "utf8")) as { file: string; hit: number; length: number } : null;
const musicFile = music ? `${musicJson!.slice(0, musicJson!.lastIndexOf("/") + 1)}${music.file}` : null;
const fit: FitOptions = music ? { scoreAt: music.hit, total: music.length } : {};
const scenes = buildTimeline({ contact2, lastCushion: cushions.at(-1) ?? contact2, duration: res.duration }, fit);

// ── 테이블 로고 ───────────────────────────────────────
async function liveBrand(tableId: BrandTableId): Promise<TableBrandView | null> {
    const db = await readOnlyDb();
    const rows = (await db.query(`select * from sim_table_brands`)).rows;
    await db.end();
    const ms = (d: Date | null) => (d ? new Date(d).getTime() : null);
    const view = pickBrands(rows.map((r): TableBrandRow => ({
        id: r.id, title: r.title, image: r.image, opacity: r.opacity, scale: r.scale, place: r.place, tone: r.tone, sponsor: r.sponsor,
        tables: r.tables, enabled: r.enabled, startsAt: ms(r.starts_at), endsAt: ms(r.ends_at), createdAt: ms(r.created_at)!, updatedAt: ms(r.updated_at)!,
    })), Date.now())[tableId];
    if (!view) return null;
    // 페이지는 file 이 아니라 setContent 라 경로를 못 읽는다 — data URI 로 바꿔 넣는다
    const ext = view.image.split("?")[0].split(".").pop()!.toLowerCase();
    const mime = ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : "image/jpeg";
    const bytes = view.image.startsWith("/")
        ? readFileSync(`client/public${view.image}`)
        : Buffer.from(await (await fetch(view.image)).arrayBuffer());
    return { ...view, image: `data:${mime};base64,${bytes.toString("base64")}` };
}
const brand = await liveBrand(shot.params.table.id);
const total = totalDuration(scenes);

// ── 페이지 묶기 ─────────────────────────────────────────
const bundle = await build({
    entryPoints: ["scripts/shorts/page/entry.ts"], bundle: true, write: false, format: "iife", platform: "browser",
    target: "chrome120", tsconfig: "tsconfig.json", logLevel: "warning",
});
const js = bundle.outputFiles[0].text;
const wordmark = `data:image/png;base64,${readFileSync("client/public/brand/rankue-wordmark.png").toString("base64")}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
:root{--surface-1:#0b0f14;--surface-line:rgba(255,255,255,0.08);--ink-1:rgba(255,255,255,0.87);--ink-3:rgba(255,255,255,0.55)}
html,body{margin:0;background:#0b0f14;width:1080px;height:1920px;overflow:hidden}
#stage,#overlay{position:absolute;left:0;top:0;width:1080px;height:1920px}
</style></head><body><div id="stage"></div><canvas id="overlay" width="1080" height="1920"></canvas>
<script>window.__DATA=${JSON.stringify({ shot, facts, lines: music ? [] : lines, wordmark, brand, fit, trials })};</script><script>${js}</script></body></html>`;

// 맥은 GPU(Metal), 리눅스(GitHub Actions)는 GPU 가 없어 SwiftShader 소프트웨어 WebGL
const glArgs = process.platform === "darwin"
    ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
    : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const browser = await chromium.launch({ args: glArgs });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => window.brandReady(), null, { timeout: 15000 });
if (errors.length) throw new Error(`페이지 오류: ${errors.join("\n")}`);

if (preview) {
    const pdir = `${dir}/preview`;
    rmSync(pdir, { recursive: true, force: true });
    mkdirSync(pdir, { recursive: true });
    // 카메라 감쇠가 앞 프레임에 기대므로 처음부터 순서대로 돌리되, 장면마다 지정한 지점만 저장한다
    const marks = new Map<number, string>();
    for (const s of scenes) for (const q of [0.35, 0.9]) marks.set(Math.round((s.start + s.dur * q) * FPS), `${s.id}-${q}`);
    const n = Math.ceil(total * FPS);
    for (let f = 0; f < n; f++) {
        await page.evaluate((vt) => window.seek(vt), f / FPS);
        const name = marks.get(f);
        if (name) await page.screenshot({ path: `${pdir}/${String(f).padStart(4, "0")}-${name}.jpg`, type: "jpeg", quality: 80 });
    }
    await browser.close();
    console.log(`미리보기 ${marks.size}장 → ${pdir}  (${total.toFixed(1)}초, ${n}프레임)`);
    process.exit(0);
}

// ── 프레임 ─────────────────────────────────────────────
const fdir = `${dir}/frames`;
rmSync(fdir, { recursive: true, force: true });
mkdirSync(fdir, { recursive: true });
const n = Math.ceil(total * FPS);
const t0 = Date.now();
for (let f = 0; f < n; f++) {
    await page.evaluate((vt) => window.seek(vt), f / FPS);
    await page.screenshot({ path: `${fdir}/${String(f).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 });
    if (f % 150 === 0) console.log(`프레임 ${f}/${n} (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
}
await browser.close();
if (errors.length) throw new Error(`페이지 오류: ${errors.join("\n")}`);

// ── 공 소리(48kHz 모노 WAV) ──────────────────────────────
const SR = 48000;
const sfx = new Float32Array(Math.ceil((total + 1) * SR));
const bank = { strike: renderSound("strike", SR), ball: renderSound("ball", SR), cushion: renderSound("cushion", SR) };
const evs = eventsForFeedback(res);
evs.forEach((e, i) => {
    const gain = impulseToGain(e.impulse, e.kind) * 0.9;
    const rate = playbackRateFor(e.kind, e.impulse, i);
    for (const vt of videoTimesOfShotTime(scenes, e.t)) {
        const scene = sceneAt(scenes, vt).scene;
        const slow = (scene.shotTo - scene.shotFrom) / scene.dur; // 느린 장면은 소리도 낮고 길게
        const r = rate * Math.max(0.55, Math.min(1, slow));
        const src = bank[e.kind];
        const at = Math.round(vt * SR);
        for (let k = 0; at + k < sfx.length; k++) {
            const si = k * r;
            if (si >= src.length - 1) break;
            const i0 = Math.floor(si);
            sfx[at + k] += gain * (src[i0] + (src[i0 + 1] - src[i0]) * (si - i0));
        }
    }
});
// 큐 타격은 aim 장면 끝(큐가 나가는 순간)에도 한 번
{
    const aim = scenes.find((s) => s.id === "aim")!;
    const at = Math.round((aim.start + aim.dur * 0.86) * SR);
    bank.strike.forEach((v, k) => { if (at + k < sfx.length) sfx[at + k] += v * 0.8; });
}
writeFileSync(`${dir}/sfx.wav`, wav(sfx, SR));

// ── 합치기 ────────────────────────────────────────────
const voice = music ? [] : lines.filter((l: any) => l.audio);
const args = ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${fdir}/%05d.jpg`, "-i", `${dir}/sfx.wav`];
if (musicFile) args.push("-i", musicFile);
const vBase = musicFile ? 3 : 2;
voice.forEach((l: any) => args.push("-i", `${dir}/${l.audio}`));
const mixIn = [`[1:a]volume=${musicFile ? 0.45 : 0.9}[s]`];
if (musicFile) mixIn.push("[2:a]volume=1.0[m]");
voice.forEach((l: any, i: number) => mixIn.push(`[${i + vBase}:a]adelay=${Math.round(l.start * 1000)}|${Math.round(l.start * 1000)},volume=1.6[v${i}]`));
const labels = ["[s]", ...(musicFile ? ["[m]"] : []), ...voice.map((_: any, i: number) => `[v${i}]`)].join("");
mixIn.push(`${labels}amix=inputs=${voice.length + 1 + (musicFile ? 1 : 0)}:normalize=0,alimiter=limit=0.95[a]`);
args.push("-filter_complex", mixIn.join(";"), "-map", "0:v", "-map", "[a]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-c:a", "aac", "-b:a", "192k",
    "-t", total.toFixed(3), "-movflags", "+faststart", `${dir}/output.mp4`);
execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
console.log(`완성 → ${dir}/output.mp4  (${total.toFixed(1)}초, ${n}프레임, 렌더 ${((Date.now() - t0) / 1000).toFixed(0)}초)`);

function wav(samples: Float32Array, sr: number): Buffer {
    const buf = Buffer.alloc(44 + samples.length * 2);
    buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8);
    buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
    for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
    return buf;
}
