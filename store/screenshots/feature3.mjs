// 구글 플레이 그래픽 이미지(1024×500) v3 — 옛 것(out-play/feature-graphic.png)에는 'RP 레이팅 · 매장 랭킹 · 라이벌 매칭'이 박혀 있다.
//   node store/screenshots/feature3.mjs  →  out3-play/feature-graphic.png
// 가장자리는 기기마다 잘릴 수 있어 글자를 안쪽에 둔다. '1위·무료·최고' 같은 말은 쓰지 않는다.
import { writeFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const DIR = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(DIR, "../../package.json"));
const { chromium } = require("playwright");
const W = 1024, H = 500;
const raw = pathToFileURL(resolve(DIR, "raw3", "ko", "01-scoreboard.png")).href;
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${W}px; height:${H}px; overflow:hidden; }
  body { background:#F1EFE9; color:#141413; font-family:Pretendard, -apple-system, "Apple SD Gothic Neo", sans-serif; position:relative; -webkit-font-smoothing:antialiased; }
  .panel { position:absolute; right:0; top:0; bottom:0; width:548px; background:#0A6847; border-radius:56px 0 0 56px; }
  .copy { position:absolute; left:64px; top:0; bottom:0; width:400px; display:flex; flex-direction:column; justify-content:center; }
  .brand { font-size:19px; font-weight:800; letter-spacing:0.14em; color:#0A6847; }
  h1 { margin-top:14px; font-size:58px; line-height:1.12; font-weight:800; letter-spacing:-0.025em; word-break:keep-all; }
  p { margin-top:18px; font-size:22px; line-height:1.4; font-weight:500; color:#55554F; letter-spacing:-0.01em; word-break:keep-all; }
  .device { position:absolute; right:44px; top:50%; transform:translateY(-50%); width:486px; padding:9px; border-radius:34px; background:#111113; box-shadow:0 26px 60px rgba(0,0,0,0.36), 0 0 0 1px rgba(255,255,255,0.14); }
  .screen { width:100%; aspect-ratio:2868 / 1320; border-radius:26px; overflow:hidden; background:#000; }
  .screen img { display:block; width:100%; height:100%; }
</style><body>
  <div class="panel"></div>
  <div class="copy">
    <div class="brand">RANKUE</div>
    <h1>손안의<br>당구 점수판</h1>
    <p>점수판 · 경기 기록 · 온라인 대전 · 크루</p>
  </div>
  <div class="device"><div class="screen"><img src="${raw}"></div></div>
</body></html>`;
const out = resolve(DIR, "out3-play", "feature-graphic.png");
const tmp = resolve(DIR, "out3-play", "_feature.html");
writeFileSync(tmp, html);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length);
if (broken) throw new Error("그림을 못 불렀다");
await page.screenshot({ path: out });
unlinkSync(tmp);
await browser.close();
console.log(`✓ ${out}`);
