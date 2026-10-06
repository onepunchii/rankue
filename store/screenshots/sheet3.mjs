// 스토어 스크린샷 한눈에 보기 — out3/ko 의 그림을 한 장에 늘어놓는다(검토용, 스토어에 올리는 파일이 아니다).
//   node store/screenshots/sheet3.mjs            애플 세트 → out3/_sheet.png
//   TARGET=play node store/screenshots/sheet3.mjs  구글 세트 → out3-play/_sheet.png
import { readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const DIR = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(DIR, "../../package.json"));
const { chromium } = require("playwright");
const play = process.env.TARGET === "play";
const OUT = resolve(DIR, play ? "out3-play" : "out3");
const files = readdirSync(resolve(OUT, "ko")).filter((f) => /^\d\d-.*\.png$/.test(f)).sort();
const ratio = play ? 2160 / 1080 : 2868 / 1320;
const cols = Math.min(5, files.length), tw = 300, th = Math.round(tw * ratio), gap = 24;
const rows = Math.ceil(files.length / cols);
const W = cols * tw + (cols + 1) * gap, H = rows * (th + 44) + (rows + 1) * gap;
const html = `<!doctype html><meta charset="utf-8"><style>
  * { margin:0; box-sizing:border-box; } body { width:${W}px; height:${H}px; background:#DCDAD3; font-family:Pretendard,-apple-system,sans-serif; padding:${gap}px; display:grid; grid-template-columns:repeat(${cols}, ${tw}px); gap:${gap}px; }
  figure { width:${tw}px; } img { display:block; width:${tw}px; height:${th}px; border-radius:14px; box-shadow:0 6px 18px rgba(0,0,0,.18); } figcaption { height:44px; padding-top:10px; font-size:15px; font-weight:600; color:#3a3a36; text-align:center; }
</style>${files.map((f) => `<figure><img src="${pathToFileURL(resolve(OUT, "ko", f)).href}"><figcaption>${f.replace(/\.png$/, "")}</figcaption></figure>`).join("")}`;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })).newPage();
// 파일로 써서 연다 — setContent(about:blank)에서는 file:// 그림이 막혀 빈 칸으로 찍힌다
const tmp = resolve(OUT, "_sheet.html");
writeFileSync(tmp, html);
await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length);
if (broken) throw new Error(`그림 ${broken}장을 못 불렀다`);
await page.screenshot({ path: resolve(OUT, "_sheet.png") });
unlinkSync(tmp);
await browser.close();
console.log(`✓ ${files.length}장 → ${resolve(OUT, "_sheet.png")}`);
