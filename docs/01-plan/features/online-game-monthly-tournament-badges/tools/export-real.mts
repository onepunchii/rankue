// 랭킹 그림 내보내기 — 바탕 따내기(가장자리에서 이어진 어두운 영역·이미 투명한 영역) → 잘라 맞추기 → webp.
// 이미지 라이브러리가 없어 브라우저 캔버스로 한다. 등급 배지는 일곱 장을 같은 틀로 잘라 방패 크기가 등급마다 같게 한다.
import { chromium } from "/Users/choejeonghwan/rankue-app/store/screenshots/capture3-lib.mts";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const RAW = "/Users/choejeonghwan/rankue-app/reports/real-badges-1012/raw";
const ROOM = "/Users/choejeonghwan/rankue-app/reports/sim-themes-1012/raw/b-room.png";
const OUT = "/Users/choejeonghwan/rankue-app/reports/real-badges-1012/cut";
const TIERS = ["iron", "bronze", "silver", "gold", "platinum", "diamond", "master"];
const br = await chromium.launch();
const page = await br.newPage();
await page.setContent("<canvas id=c></canvas><canvas id=o></canvas>");
await page.evaluate(`window.cut = async (src, T) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.getElementById('c'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true }); g.clearRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data, W = c.width, H = c.height;
    const isBg = (i) => p[i * 4 + 3] < 10 || Math.max(p[i * 4], p[i * 4 + 1], p[i * 4 + 2]) <= T;
    const mx = (i) => Math.max(p[i * 4], p[i * 4 + 1], p[i * 4 + 2]);
    const bg = new Uint8Array(W * H), q = new Int32Array(W * H); let qh = 0, qt = 0;
    const push = (i) => { if (!bg[i] && isBg(i)) { bg[i] = 1; q[qt++] = i; } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (qh < qt) { const i = q[qh++], x = i % W, y = (i - x) / W; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W); }
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let i = 0; i < W * H; i++) {
        if (bg[i]) { p[i * 4 + 3] = 0; continue; }
        const x = i % W, y = (i - x) / W;
        const edge = (x > 0 && bg[i - 1]) || (x < W - 1 && bg[i + 1]) || (y > 0 && bg[i - W]) || (y < H - 1 && bg[i + W]);
        if (edge && p[i * 4 + 3] > 250) p[i * 4 + 3] = Math.min(255, Math.max(0, (mx(i) - T) * 7));
        if (p[i * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    g.putImageData(d, 0, 0);
    return { W, H, x0, y0, x1, y1 };
};
window.crop = (box, size, q) => {
    const c = document.getElementById('c'), o = document.getElementById('o'); o.width = size; o.height = size;
    const g = o.getContext('2d'); g.clearRect(0, 0, size, size); g.imageSmoothingQuality = 'high';
    g.drawImage(c, box.x, box.y, box.s, box.s, 0, 0, size, size);
    return o.toDataURL('image/webp', q);
};
window.plain = async (src, sx, sy, sw, sh, w, h, q) => {
    const img = new Image(); img.src = src; await img.decode();
    const o = document.getElementById('o'); o.width = w; o.height = h; const g = o.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h); return o.toDataURL('image/webp', q);
};`);
const data = (p: string) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
// 실전 다마 메달 — 여섯 장을 **같은 틀**로 자른다(가운데 원의 크기 · 자리가 등급마다 같아야 숫자가 같은 자리에 얹힌다).
const REAL = ["bronze", "silver", "gold", "platinum", "diamond", "master"].filter((t) => existsSync(`${RAW}/real-${t}.png`));
const boxes: any[] = [];
for (const t of REAL) boxes.push(await page.evaluate(`cut(${JSON.stringify(data(`${RAW}/real-${t}.png`))}, 22)`));
const u = { x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)), x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)) };
// 가운데 원은 그림의 한가운데(512,512)에 그려졌다 — 틀도 거기에 맞춘다
const half = Math.max(512 - u.x0, u.x1 - 512, 512 - u.y0, u.y1 - 512) * 1.03;
const frame = { x: 512 - half, y: 512 - half, s: half * 2 };
console.log("틀:", JSON.stringify(frame), "상자들:", boxes.map((b) => `${b.x0},${b.y0}-${b.x1},${b.y1}`).join(" | "));
for (const t of REAL) {
    await page.evaluate(`cut(${JSON.stringify(data(`${RAW}/real-${t}.png`))}, 22)`);
    const url: string = await page.evaluate(`(() => { const c = document.getElementById('c'), o = document.getElementById('o'); o.width = 360; o.height = 360; const g = o.getContext('2d'); g.clearRect(0, 0, 360, 360); g.imageSmoothingQuality = 'high'; g.drawImage(c, ${frame.x}, ${frame.y}, ${frame.s}, ${frame.s}, 0, 0, 360, 360); return o.toDataURL('image/png'); })()`);
    writeFileSync(`${OUT}/real-${t}.png`, Buffer.from(url.split(",")[1], "base64"));
    console.log(`real-${t}.png`);
}
await br.close();
