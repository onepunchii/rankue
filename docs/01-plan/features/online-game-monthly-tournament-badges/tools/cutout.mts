// 검은 바탕 따내기 — 가장자리에서 이어진 어두운 영역만 투명하게(안쪽의 어두운 금속은 남긴다). 브라우저 캔버스로 한다(이미지 라이브러리가 없다).
import { chromium } from "/Users/choejeonghwan/rankue-app/store/screenshots/capture3-lib.mts";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const RAW = "/Users/choejeonghwan/rankue-app/reports/sim-badges-1012/raw";
const CUT = "/Users/choejeonghwan/rankue-app/reports/sim-badges-1012/cut";
const names = readdirSync(RAW).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4));
const br = await chromium.launch();
const page = await br.newPage();
await page.setContent("<canvas id=c></canvas>");
const fn = `async (src, T) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.getElementById('c'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true }); g.clearRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data, W = c.width, H = c.height;
    const mx = (i) => Math.max(p[i * 4], p[i * 4 + 1], p[i * 4 + 2]);
    const bg = new Uint8Array(W * H), q = new Int32Array(W * H); let qh = 0, qt = 0;
    const push = (i) => { if (!bg[i] && mx(i) <= T) { bg[i] = 1; q[qt++] = i; } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (qh < qt) { const i = q[qh++], x = i % W, y = (i - x) / W; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W); }
    let kept = 0;
    for (let i = 0; i < W * H; i++) {
        if (bg[i]) { p[i * 4 + 3] = 0; continue; }
        kept++;
        const x = i % W, y = (i - x) / W;
        const edge = (x > 0 && bg[i - 1]) || (x < W - 1 && bg[i + 1]) || (y > 0 && bg[i - W]) || (y < H - 1 && bg[i + W]);
        if (edge) p[i * 4 + 3] = Math.min(255, Math.max(0, (mx(i) - T) * 7));
    }
    g.putImageData(d, 0, 0);
    return { url: c.toDataURL('image/png'), kept: Math.round((kept / (W * H)) * 100) };
}`;
for (const n of names) {
    const src = `data:image/png;base64,${readFileSync(`${RAW}/${n}.png`).toString("base64")}`;
    const T = /iron|medal-4$|medal-5$/.test(n) ? 16 : 26;
    const r: any = await page.evaluate(`(${fn})(${JSON.stringify(src)}, ${T})`);
    writeFileSync(`${CUT}/${n}.png`, Buffer.from(r.url.split(",")[1], "base64"));
    console.log(n, `남긴 면적 ${r.kept}%`);
}
await br.close();
