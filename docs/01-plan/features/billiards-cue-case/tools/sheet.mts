// 시안 시트 — raw 그림을 종류별로 한 장에 모아 jpg 로(docs/…/billiards-cue-case/sheets).
import { chromium } from "/Users/choejeonghwan/rankue-app/store/screenshots/capture3-lib.mts";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
const RAW = "/Users/choejeonghwan/rankue-app/reports/cue-case-1016/raw";
const OUT = "/Users/choejeonghwan/rankue-app/docs/01-plan/features/billiards-cue-case/sheets";
mkdirSync(OUT, { recursive: true });
const files = readdirSync(RAW).filter((f) => f.endsWith(".png") && !f.startsWith("anchor") && !f.startsWith("_"));
const groups: [string, string, string, number][] = [
    ["chalks", "초크", "chalk-", 6],
    ["gloves", "장갑", "glove-", 6],
    ["pennants", "크루 페넌트", "pennant-", 4],
];
const br = await chromium.launch();
const page = await br.newPage({ viewport: { width: 1500, height: 800 } });
for (const [key, title, prefix, cols] of groups) {
    const list = files.filter((f) => f.startsWith(prefix)).sort();
    if (!list.length) continue;
    const cells = list.map((f) => {
        const name = f.replace(prefix, "").replace(".png", "");
        const online = prefix === "glove-" && name === "cup-entry"; // 네모 시트의 온라인은 월대회 출전 장갑 하나뿐
        return `<figure><img src="data:image/png;base64,${readFileSync(`${RAW}/${f}`).toString("base64")}"><figcaption>${online ? '<b>온라인</b> ' : ""}${name}</figcaption></figure>`;
    }).join("");
    await page.setContent(`<style>body{margin:0;background:#0b0b0d;color:#ddd;font:14px -apple-system,sans-serif;padding:24px}h1{font-size:22px;margin:0 0 16px;color:#f2c14e}
    .g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px}figure{margin:0;background:#000;border:1px solid #222;border-radius:10px;overflow:hidden}
    img{width:100%;display:block}figcaption{padding:6px 8px;font-size:13px;color:#aaa}b{color:#3ee6e6;font-weight:600}</style>
    <h1>큐 케이스 — ${title} ${list.length}종 (시안)</h1><div class=g>${cells}</div>`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/sheet-${key}.jpg`, fullPage: true, type: "jpeg", quality: 82 });
    console.log(key, list.length);
}
await br.close();
