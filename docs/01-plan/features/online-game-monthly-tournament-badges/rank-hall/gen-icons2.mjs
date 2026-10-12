import { gen, keyInfo } from "./genr.mjs";
const RAW = "/Users/choejeonghwan/rankue-app/reports/sim-rank-b-1012/raw";
const obj = (spec) => `Use the attached emblem only as the style reference: the same stylised 3D game render, the same chunky beveled gold metal with a thin bright rim light, the same glossy enamel and crisp highlights, the same pure solid black background. Create a different object in this same family, as a game menu icon: ${spec} Strict front view, centered, bold silhouette readable at 48 pixels, fills about 78% of the frame. Nothing else in the frame: no particles, no light rays, no smoke, no ground shadow, no text, no letters, no numbers, no watermark.`;
const JOBS = [
    ["icon-cabinet", obj("a trophy display cabinet — a chunky gold-framed case with dark green velvet inside and two shelves, three tiny round gold medals on the top shelf and a tiny gold trophy cup on the bottom shelf.")],
    ["icon-stats", obj("a statistics board — a chunky gold-framed panel with dark green enamel showing three rising gold bars (short, medium, tall) and a small glossy white billiard ball sitting on top of the tallest bar.")],
    ["icon-tournament", obj("a tournament crest — two crossed billiard cues behind a round gold laurel wreath, with a gold crown on top and a glossy red billiard ball in the middle of the wreath.")],
];
const out = await Promise.all(JOBS.map(([name, prompt]) => gen({ name, model: "openai/gpt-5-image-mini", refs: [`${RAW}/tier-gold.png`], prompt }).catch((e) => ({ name, error: String(e).slice(0, 160) }))));
for (const r of out) console.log(r.error ? `FAIL ${r.name}: ${r.error}` : `ok ${r.name} $${r.cost}`);
console.log("key:", JSON.stringify(await keyInfo()));
