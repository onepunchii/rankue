// 랭큐 스토어 스크린샷 목업 생성기 — 당구(hiq) 실화면 캡처 + 브랜드(블랙·에메랄드 #10B981) 배경 + 카피
// 사용: node store/screenshots/generate.mjs                  → 애플 6.5" 1284×2778 (out/)
//       W=1080 H=2160 OUT=out-play node store/screenshots/generate.mjs  → 플레이 2:1 (out-play/) + feature-graphic 1024×500
// (onp store/screenshots/generate.mjs 이식 — 다크 테마)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = Number(process.env.W || 1284), H = Number(process.env.H || 2778);
const OUT = process.env.OUT || "out";

const { slides, captions } = JSON.parse(readFileSync(resolve(DIR, "captions.json"), "utf8"));

for (const s of slides) {
  if (!existsSync(resolve(DIR, "raw", s.file))) {
    console.error(`❌ raw/${s.file} 없음 — capture.py 먼저 실행`);
    process.exit(1);
  }
}

function slideHtml(imgPath, caption) {
  const lines = caption.split("\n").map((l) => l.trim());
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; overflow:hidden; }
  body {
    background:#0A0A0A;
    font-family:-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
    position:relative;
  }
  /* 브랜드 글로우 — 에메랄드 */
  .glow { position:absolute; inset:0;
    background:
      radial-gradient(900px 700px at 50% -80px, rgba(16,185,129,0.22), transparent 70%),
      radial-gradient(700px 500px at 85% 30%, rgba(16,185,129,0.08), transparent 70%),
      radial-gradient(800px 600px at 8% 80%, rgba(16,185,129,0.10), transparent 70%);
  }
  .cap {
    position:absolute; top:150px; left:70px; right:70px;
    text-align:center; color:#f1f5f9; font-weight:800;
    font-size:100px; line-height:1.18; letter-spacing:-2.5px;
    text-wrap:balance;
  }
  .device {
    position:absolute; left:50%; transform:translateX(-50%);
    top:${lines.length > 1 ? 505 : 405}px;
    width:1020px; border-radius:112px; overflow:hidden;
    border:9px solid #262626;
    box-shadow: 0 60px 140px rgba(0,0,0,0.65), 0 0 0 2px rgba(255,255,255,0.05), 0 30px 110px rgba(16,185,129,0.22);
    background:#0A0A0A;
  }
  .device img { display:block; width:100%; }
  </style></head><body>
    <div class="glow"></div>
    <div class="cap">${lines.join("<br>")}</div>
    <div class="device"><img src="${imgPath}"></div>
  </body></html>`;
}

function featureHtml(imgPath) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1024px; height:500px; overflow:hidden; }
  body {
    background:#0A0A0A;
    font-family:-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
    position:relative;
  }
  .glow { position:absolute; inset:0;
    background:
      radial-gradient(700px 500px at 20% 20%, rgba(16,185,129,0.25), transparent 70%),
      radial-gradient(600px 400px at 90% 90%, rgba(16,185,129,0.12), transparent 70%);
  }
  .txt { position:absolute; left:70px; top:50%; transform:translateY(-50%); width:520px; }
  .name { color:#10B981; font-weight:900; font-size:76px; letter-spacing:-1px; font-style:italic; }
  .tag { color:#f1f5f9; font-weight:800; font-size:40px; letter-spacing:-1px; margin-top:18px; line-height:1.25; }
  .sub { color:#94a3b8; font-weight:600; font-size:24px; margin-top:16px; }
  .device {
    position:absolute; right:60px; top:56px;
    width:300px; border-radius:44px; overflow:hidden;
    border:5px solid #262626;
    box-shadow: 0 30px 70px rgba(0,0,0,0.65), 0 15px 60px rgba(16,185,129,0.25);
    background:#0A0A0A;
  }
  .device img { display:block; width:100%; }
  </style></head><body>
    <div class="glow"></div>
    <div class="txt">
      <div class="name">RANKUE</div>
      <div class="tag">당구 실력 랭킹,<br>경기는 자동 기록</div>
      <div class="sub">RP 레이팅 · 매장 랭킹 · 라이벌 매칭</div>
    </div>
    <div class="device"><img src="${imgPath}"></div>
  </body></html>`;
}

function shoot(htmlPath, out, w, h) {
  execFileSync(CHROME, [
    "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    `--window-size=${w},${h}`, `--screenshot=${out}`, `file://${htmlPath}`,
  ], { stdio: "pipe" });
}

let total = 0;
for (const [locale, caps] of Object.entries(captions)) {
  const outDir = resolve(DIR, OUT, locale);
  mkdirSync(outDir, { recursive: true });
  slides.forEach((s, i) => {
    const img = resolve(DIR, "raw", s.file);
    const html = slideHtml(`file://${img}`, caps[s.key]);
    const htmlPath = resolve(DIR, OUT, `.tmp-${locale}-${s.key}.html`);
    writeFileSync(htmlPath, html);
    const out = resolve(outDir, `${i + 1}-${s.key}.png`);
    shoot(htmlPath, out, W, H);
    total++;
    console.log(`✅ ${OUT}/${locale}/${i + 1}-${s.key}.png`);
  });
}

// 플레이 스토어용 그래픽 이미지 1024×500 (out-play 실행 시에만)
if (OUT === "out-play") {
  const img = resolve(DIR, "raw", slides[0].file); // 01 대시보드 — RP 레이팅 히어로
  const htmlPath = resolve(DIR, OUT, ".tmp-feature.html");
  writeFileSync(htmlPath, featureHtml(`file://${img}`));
  const out = resolve(DIR, OUT, "feature-graphic.png");
  shoot(htmlPath, out, 1024, 500);
  total++;
  console.log(`✅ ${OUT}/feature-graphic.png (1024×500)`);
}

console.log(`\n완료: ${total}장`);
