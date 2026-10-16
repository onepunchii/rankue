// 하대(가로) 큐 견본 — 바탕색과 다른 영역만 잘라 장식장 줄처럼 쌓는다(sheets/sheet-cue-rack.jpg).
// 쓰는 법: npx tsx sheet-butt.mts <이름:표시이름> ...
import { chromium } from "/Users/choejeonghwan/rankue-app/store/screenshots/capture3-lib.mts";
import { readFileSync } from "node:fs";
const RAW = "/Users/choejeonghwan/rankue-app/reports/cue-case-1016/raw";
const OUT = "/Users/choejeonghwan/rankue-app/docs/01-plan/features/billiards-cue-case/sheets";
// --out=파일이름 --title=제목 --cols=2 (선택)
const flag = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const OUTNAME = flag("out", "sheet-cue-rack"), TITLE = flag("title", "큐 케이스 — 하대 가로 시안"), COLS = Number(flag("cols", "1"));
const items = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((a) => { const [f, label] = a.split(":"); return { f, label: label ?? f }; });
const br = await chromium.launch();
const page = await br.newPage({ viewport: { width: 1400, height: 600 } });
await page.setContent("<canvas id=c></canvas>");
const crops: { label: string; url: string }[] = [];
for (const it of items) {
    const src = `data:image/png;base64,${readFileSync(`${RAW}/${it.f}.png`).toString("base64")}`;
    // 문자열로 넘긴다(tsx 가 함수에 붙이는 __name 이 브라우저에 없다).
    const url = await page.evaluate(`(async (src) => {
        const img = new Image(); img.src = src; await img.decode();
        const c = document.getElementById("c"); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
        const W = c.width, H = c.height, p = g.getImageData(0, 0, W, H).data;
        // 바탕이 가장자리로 갈수록 어두워지는 그림이 있어 색 하나로 견주면 바탕까지 잡힌다.
        // 줄마다 그 줄의 왼쪽 끝 색을 바탕으로 보고, 폭의 30% 넘게 다른 줄만 큐로 친다. 칸(세로)도 같은 식(위 끝 색).
        const d = (i, j) => Math.abs(p[i] - p[j]) + Math.abs(p[i + 1] - p[j + 1]) + Math.abs(p[i + 2] - p[j + 2]);
        let y0 = H, y1 = 0;
        for (let y = 0; y < H; y++) { const b = (y * W + 2) * 4; let n = 0; for (let x = 0; x < W; x += 2) if (d((y * W + x) * 4, b) > 50) n++; if (n > W * 0.15) { if (y < y0) y0 = y; y1 = y; } }
        let x0 = W, x1 = 0;
        for (let x = 0; x < W; x++) { const b = (2 * W + x) * 4; let n = 0; for (let y = y0; y <= y1; y++) if (d((y * W + x) * 4, b) > 50) n++; if (n > (y1 - y0 + 1) * 0.3) { if (x < x0) x0 = x; x1 = x; } }
        const o = document.createElement("canvas"); o.width = x1 - x0 + 8; o.height = y1 - y0 + 8;
        o.getContext("2d").drawImage(c, x0 - 4, y0 - 4, o.width, o.height, 0, 0, o.width, o.height);
        return o.toDataURL("image/png");
    })(${JSON.stringify(src)})`) as string;
    crops.push({ label: it.label, url });
}
const rows = crops.map((c) => `<div class=row><div class=lb>${c.label}</div><img src="${c.url}"></div>`).join("");
await page.setContent(`<style>body{margin:0;background:#111;font:15px -apple-system,sans-serif;color:#bbb}
h1{margin:0;padding:14px 20px;background:#000;color:#f2c14e;font-size:20px}
.row{padding:10px 20px 14px;border-bottom:1px solid #2a2a2a;background:radial-gradient(ellipse at 30% 40%,#3a3a3a,#232323 70%)}
.lb{margin-bottom:6px;color:#9a9a9a;font-weight:600}.lb b{color:#3ee6e6}img{width:100%;display:block;filter:drop-shadow(0 6px 6px rgba(0,0,0,.6))}
.grid{display:grid;grid-template-columns:repeat(${COLS},1fr)}</style>
<h1>${TITLE}</h1><div class=grid>${rows}</div>`);
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/${OUTNAME}.jpg`, fullPage: true, type: "jpeg", quality: 85 });
await br.close();
console.log("ok", crops.length);
