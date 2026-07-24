// 랭큐 스토어 스크린샷 생성기 v2 — 애플 우선, 5개 언어, 대표컷=가로 점수판.
// 밝은 앱 화면 + 다크·에메랄드 프레임(스크린이 돋보이도록). 이미지는 data URI 임베드.
// 사용: node store/screenshots/generate2.mjs            → 애플 6.5" 1284×2778 → out2/<lang>/
//       W=1242 H=2688 node ...                          → 애플 6.5"(alt)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = Number(process.env.W || 1284), H = Number(process.env.H || 2778);
const LANGS = (process.env.LANGS || "ko en vi tr es").split(/\s+/).filter(Boolean);
const RAW = process.env.RAW || "raw2";
const OUT = process.env.OUT || "out2";

const { slides, captions } = JSON.parse(readFileSync(resolve(DIR, "captions2.json"), "utf8"));

function slideHtml(dataUri, caption, landscape) {
  const lines = caption.split("\n").map((l) => l.trim());
  const devW = landscape ? 1200 : 1000;      // 가로폰은 넓게
  const bezel = landscape ? 18 : 26;
  const radius = landscape ? 54 : 96;
  const top = landscape ? 1240 : 540;        // 가로폰은 짧아 중앙으로 내려 균형
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; overflow:hidden; }
  body { background:#0A0A0A; font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif; position:relative; }
  .glow { position:absolute; inset:0; background:
    radial-gradient(900px 700px at 50% -60px, rgba(16,185,129,0.22), transparent 70%),
    radial-gradient(700px 520px at 86% 34%, rgba(16,185,129,0.09), transparent 70%),
    radial-gradient(820px 600px at 10% 84%, rgba(16,185,129,0.10), transparent 70%); }
  .brand { position:absolute; top:100px; left:0; right:0; text-align:center; color:#10B981; font-weight:900; font-style:italic; font-size:44px; letter-spacing:3px; }
  .cap { position:absolute; top:180px; left:80px; right:80px; text-align:center; color:#f1f5f9; font-weight:800; font-size:94px; line-height:1.16; letter-spacing:-2.5px; }
  .device { position:absolute; left:50%; transform:translateX(-50%); top:${top}px; width:${devW}px; border-radius:${radius}px; overflow:hidden; border:${bezel}px solid #1c1c1e; box-shadow:0 60px 140px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.05), 0 30px 110px rgba(16,185,129,0.20); background:#f2f0eb; }
  .device img { display:block; width:100%; }
  </style></head><body>
    <div class="glow"></div>
    <div class="brand">RANKUE</div>
    <div class="cap">${lines.join("<br>")}</div>
    <div class="device"><img src="${dataUri}"></div>
  </body></html>`;
}

function shoot(htmlPath, out) {
  execFileSync(CHROME, [
    "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    `--window-size=${W},${H}`, `--screenshot=${out}`, `file://${htmlPath}`,
  ], { stdio: "pipe" });
}

let n = 0;
for (const lang of LANGS) {
  const cap = captions[lang];
  if (!cap) { console.error(`⚠️ no captions for ${lang}`); continue; }
  const outdir = resolve(DIR, OUT, lang);
  mkdirSync(outdir, { recursive: true });
  for (const s of slides) {
    const img = resolve(DIR, RAW, lang, s.file);
    if (!existsSync(img)) { console.error(`⚠️ missing ${RAW}/${lang}/${s.file}`); continue; }
    const dataUri = `data:image/png;base64,${readFileSync(img).toString("base64")}`;
    const html = slideHtml(dataUri, cap[s.key] || "", !!s.landscape);
    const htmlPath = resolve(outdir, `_${s.key}.html`);
    writeFileSync(htmlPath, html);
    shoot(htmlPath, resolve(outdir, s.file));
    console.log(`✅ ${lang}/${s.file}`);
    n++;
  }
}
console.log(`done — ${n} images → ${OUT}/`);
