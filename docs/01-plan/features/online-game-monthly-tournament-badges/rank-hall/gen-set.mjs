import { gen, keyInfo } from "./genr.mjs";
const RAW = "/Users/choejeonghwan/rankue-app/reports/sim-rank-b-1012/raw";
const REF = [`${RAW}/tier-gold.png`];
const tier = (spec) => `Use the attached emblem as the exact style reference: the same stylised 3D game-rank render, the same framing and size, the same kite-shaped shield with two crossed billiard cues behind it and three glossy billiard balls (white, yellow, red) in a triangle on the shield face, the same thin bright rim light along the outer edge, the same pure solid black background. Create a different rank of this same emblem family. ${spec} Strict front view, centered, symmetrical, bold silhouette readable at 48 pixels. Nothing outside the emblem: no particles, no light rays, no smoke, no ground shadow, no text, no letters, no numbers, no watermark.`;
const obj = (spec) => `Use the attached emblem only as the style reference: the same stylised 3D game render, the same chunky beveled metal with a thin bright rim light, the same glossy enamel and crisp highlights, the same pure solid black background. Create a different object in this same family: ${spec} Strict front view, centered, symmetrical, bold silhouette readable at 48 pixels, fills about 80% of the frame. Nothing else in the frame: no particles, no light rays, no smoke, no ground shadow, no text, no letters, no numbers, no watermark.`;
const JOBS = [
    ["tier-iron", tier("IRON rank, the lowest and plainest: light brushed steel-grey metal with a hammered texture and four round rivets on the frame, slate-grey enamel shield face. Remove the laurel wreath completely and remove the gem — no ornaments at all. The metal must be clearly lighter than the black background.")],
    ["tier-bronze", tier("BRONZE rank: warm copper-bronze metal with orange highlights, dark chestnut-brown enamel shield face, a small round amber gem at the top instead of the ruby. Remove the laurel wreath — only two short plain leaf tips at the bottom corners.")],
    ["tier-silver", tier("SILVER rank: bright polished silver metal, deep navy-blue enamel shield face, a round blue sapphire gem at the top. Replace the laurel wreath with a short silver laurel sprig on each side (about half the size of the reference wreath).")],
    ["tier-platinum", tier("PLATINUM rank: pale platinum-white metal with teal accents, dark teal enamel shield face, a large pointed aquamarine crystal at the top. Replace the laurel wreath with a pair of sharp swept metal wings spreading outward from both sides.")],
    ["tier-diamond", tier("DIAMOND rank: white-gold frame encrusted with small icy-blue faceted diamonds, bright sapphire-blue enamel shield face, a large brilliant-cut diamond at the top. Replace the laurel wreath with big layered wings made of faceted blue crystal shards.")],
    ["tier-master", tier("MASTER rank, the highest and most ornate: black obsidian metal with gold trim, royal purple enamel shield face, a gold crown with purple gems sitting on top of the shield, large layered gold wings on both sides, and a sunburst of gold spikes behind the shield.")],
    ["medal-1", obj("a first-place medal — a thick round gold medal hanging from a short red V-shaped ribbon with gold edges, a small gold crown on top of the medal, a ring of laurel leaves around a smooth completely blank round centre plate (leave the plate empty).")],
    ["medal-2", obj("a second-place medal — a thick round bright silver medal hanging from a short royal-blue V-shaped ribbon with silver edges, a ring of laurel leaves around a smooth completely blank round centre plate (leave the plate empty). No crown.")],
    ["medal-3", obj("a third-place medal — a thick round copper-bronze medal hanging from a short forest-green V-shaped ribbon with bronze edges, a ring of laurel leaves around a smooth completely blank round centre plate (leave the plate empty). No crown.")],
    ["trophy", obj("a grand gold trophy cup with two curved handles on a short black base, three glossy billiard balls (white, yellow, red) sitting in the cup, a laurel engraved on the front and a ruby gem on the stem.")],
];
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
let cost = 0;
const jobs = JOBS.filter(([n]) => !only || only.has(n));
for (let i = 0; i < jobs.length; i += 4) {
    const out = await Promise.all(jobs.slice(i, i + 4).map(([name, prompt]) => gen({ name, model: "openai/gpt-5-image-mini", refs: REF, prompt }).catch((e) => ({ name, error: String(e).slice(0, 160) }))));
    for (const r of out) { cost += r.cost ?? 0; console.log(r.error ? `FAIL ${r.name}: ${r.error}` : r.skipped ? `skip ${r.name}` : `ok   ${r.name} $${r.cost}`); }
}
console.log("this run $", cost.toFixed(4), "| key:", JSON.stringify(await keyInfo()));
