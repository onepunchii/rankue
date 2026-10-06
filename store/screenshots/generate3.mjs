// 랭큐 스토어 스크린샷 생성기 v3(1.3, 2026-10-07) — raw3/ko 의 화면에 틀과 문구를 입힌다.
//   node store/screenshots/generate3.mjs                 애플 1320×2868 → out3/ko/  +  구글 1080×2160 → out3-play/ko/
//   ONLY=1,2 node store/screenshots/generate3.mjs        몇 장만
//   TARGET=apple|play node ...                           한쪽만
// 화면은 capture3-*.mts 가 찍는다(로컬 Vite + 가짜 응답). 여기서는 그림만 짠다 — 화면 안의 글자·숫자는 건드리지 않는다.
//  - 당구 다섯 장은 밝은 바탕 + 초록 판, 골프 다섯 장은 어두운 바탕 + 라임 판(종목이 한눈에 갈린다).
//  - 점수판은 가로 화면이라(세로로 세우면 글자가 눕는다) 가로 기기 + 아래에 '자동으로 쌓이는 기록' 조각을 붙인다.
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const DIR = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(DIR, "../../package.json"));
const { chromium } = require("playwright");

const TARGETS = {
    apple: { W: 1320, H: 2868, out: "out3", all: true },
    play: { W: 1080, H: 2160, out: "out3-play", all: false },
};
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean).map(Number);
const WANT = (process.env.TARGET || "apple,play").split(",").filter(Boolean);
const { slides } = JSON.parse(readFileSync(resolve(DIR, "captions3.json"), "utf8"));
const RAW = resolve(DIR, "raw3", "ko");
const RAW_W = 1320, RAW_H = 2868;

const THEME = {
    billiards: { bg: "#F1EFE9", ink: "#141413", sub: "#55554F", accent: "#0A6847", panel: "#0A6847", bezel: "#111113", edge: "rgba(255,255,255,0.14)" },
    golf: { bg: "#0C0D0E", ink: "#F4F5F2", sub: "#A9ADA4", accent: "#9BEF5C", panel: "#9BEF5C", bezel: "#050506", edge: "rgba(255,255,255,0.22)" },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const src = (name) => pathToFileURL(resolve(RAW, `${name}.png`)).href;

function html(slide, W, H) {
    const t = THEME[slide.theme];
    const s = W / 1320;                       // 애플 기준 배율
    const px = (n) => `${Math.round(n * s)}px`;
    const tall = H / W;                        // 2.17(애플) · 2.0(구글)
    const head = `
      <div class="brand">RANKUE</div>
      <h1>${esc(slide.title)}</h1>
      <p class="sub">${esc(slide.sub)}</p>`;
    let stage;
    if (slide.landscape) {
        const cw = Math.round(W * 0.86);                               // 아래 조각의 폭
        const [cx, cy, cWidth, cHeight] = slide.inset.crop;
        const k = cw / cWidth;
        stage = `
      <div class="stage land">
        <div class="device land"><div class="screen"><img src="${src(slide.raw)}"></div></div>
        <div class="inset" style="width:${cw}px;height:${Math.round(cHeight * k)}px">
          <img src="${src(slide.inset.raw)}" style="width:${Math.round(RAW_W * k)}px;margin-left:${-Math.round(cx * k)}px;margin-top:${-Math.round(cy * k)}px">
        </div>
      </div>`;
    } else {
        stage = `<div class="stage"><div class="device"><div class="screen"><img src="${src(slide.raw)}"></div></div></div>`;
    }
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${W}px; height:${H}px; overflow:hidden; }
  body { background:${t.bg}; color:${t.ink}; font-family: Pretendard, "Pretendard Variable", -apple-system, "Apple SD Gothic Neo", sans-serif; display:flex; flex-direction:column; position:relative; -webkit-font-smoothing:antialiased; }
  .panel { position:absolute; left:0; right:0; bottom:0; height:${Math.round(H * (slide.landscape ? 0.60 : 0.50))}px; background:${t.panel}; border-radius:${px(72)} ${px(72)} 0 0; }
  header { position:relative; padding:${px(tall > 2.1 ? 150 : 104)} ${px(88)} 0; text-align:center; }
  .brand { font-size:${px(34)}; font-weight:800; letter-spacing:0.14em; color:${t.accent}; }
  h1 { margin-top:${px(30)}; font-size:${px(104)}; line-height:1.14; font-weight:800; letter-spacing:-0.025em; word-break:keep-all; text-wrap:balance; }
  .sub { margin-top:${px(26)}; font-size:${px(46)}; line-height:1.3; font-weight:500; color:${t.sub}; letter-spacing:-0.01em; word-break:keep-all; }
  .stage { position:relative; flex:1; min-height:0; display:flex; justify-content:center; align-items:flex-end; padding:${px(64)} 0 ${px(tall > 2.1 ? 96 : 72)}; }
  /* 기기 = 테두리(패딩) + 화면. 화면 칸의 비율을 원본과 똑같이 잡아 아래가 잘리지 않게 한다 */
  .device { height:100%; display:flex; padding:${px(20)}; border-radius:${px(96)}; background:${t.bezel};
            box-shadow: 0 ${px(50)} ${px(110)} rgba(0,0,0,0.34), 0 0 0 ${px(2)} ${t.edge}; }
  .screen { height:100%; aspect-ratio:${RAW_W} / ${RAW_H}; border-radius:${px(78)}; overflow:hidden; background:#000; }
  .screen img { display:block; width:100%; height:100%; }
  .stage.land { flex-direction:column; justify-content:space-evenly; align-items:center; gap:0; padding-top:${px(20)}; }
  .device.land { height:auto; width:${Math.round(W * 0.93)}px; padding:${px(16)}; border-radius:${px(60)}; }
  .device.land .screen { height:auto; width:100%; aspect-ratio:${RAW_H} / ${RAW_W}; border-radius:${px(46)}; }
  .inset { overflow:hidden; border-radius:${px(48)}; background:#fff; box-shadow: 0 ${px(40)} ${px(90)} rgba(0,0,0,0.30); }
  .inset img { display:block; max-width:none; }
</style></head><body>
  <div class="panel"></div>
  <header>${head}</header>
  ${stage}
</body></html>`;
}

const browser = await chromium.launch();
let made = 0, skipped = 0;
for (const name of WANT) {
    const T = TARGETS[name];
    if (!T) { console.error(`모르는 대상: ${name}`); continue; }
    const outdir = resolve(DIR, T.out, "ko");
    mkdirSync(outdir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: T.W, height: T.H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    let order = 0;
    for (const slide of slides) {
        if (!T.all && !slide.play) continue;
        order++;                                         // 구글은 빠진 장을 건너뛰고 다시 번호를 매긴다
        if (ONLY.length && !ONLY.includes(slide.n)) continue;
        const need = [slide.raw, ...(slide.inset ? [slide.inset.raw] : [])];
        const missing = need.filter((r) => !existsSync(resolve(RAW, `${r}.png`)));
        if (missing.length) { console.log(`– ${name} ${slide.n}: 원본 없음(${missing.join(", ")}) — 건너뜀`); skipped++; continue; }
        const file = `${String(order).padStart(2, "0")}-${slide.raw.replace(/^\d+-/, "")}`;
        const htmlPath = resolve(outdir, `_${file}.html`);
        writeFileSync(htmlPath, html(slide, T.W, T.H));
        await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: resolve(outdir, `${file}.png`) });
        unlinkSync(htmlPath);                                // 중간 파일(이 맥의 절대 경로가 박혀 있다)은 남기지 않는다
        console.log(`✓ ${name} ${file}.png`);
        made++;
    }
    await ctx.close();
}
await browser.close();
console.log(`끝 — ${made}장 만들고 ${skipped}장 건너뜀`);
