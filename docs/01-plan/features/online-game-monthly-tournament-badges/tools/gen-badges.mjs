import { gen, keyInfo } from "./genb.mjs";
const RAW = "/Users/choejeonghwan/rankue-app/reports/sim-badges-1012/raw";
const MODEL = "openai/gpt-5-image-mini";
const tier = (spec) => `Use the attached emblem as the exact style and composition reference: keep the same shield shape and size, the same two crossed billiard cues behind it, the same three glossy billiard balls (white, yellow, red) in a triangle, the same framing, lighting and pure solid black background. Create a different rank of the same emblem family. ${spec} Strict front view, centered, symmetrical. No text, no letters, no numbers, no watermark.`;
const medal = (spec) => `A single award medal for a monthly billiards league, strict front view, perfectly centered and symmetrical, isolated on a pure solid black background. A round medal hanging from a short V-shaped ribbon. Polished metal with hard enamel, crisp beveled edges, soft studio lighting. The middle of the medal is a smooth, completely blank, slightly recessed round plate — leave it empty, a number will be added later. Around the plate: a ring of engraved laurel leaves, with two tiny crossed billiard cues at the bottom of the ring. ${spec} The medal with its ribbon fills about 80% of the frame. No text, no letters, no numbers, no watermark, no extra objects.`;
const medalRef = (spec) => `Use the attached medal as the exact style and composition reference: same medal shape and size, same blank recessed round plate in the middle (keep it empty), same laurel ring with two tiny crossed cues, same V-shaped ribbon shape, same framing, lighting and pure solid black background. Create a different placing of the same medal family. ${spec} No text, no letters, no numbers, no watermark.`;
const STAGE = process.env.STAGE ?? "1";
const JOBS = STAGE === "1" ? [
    { name: "tier-iron", refs: [`${RAW}/tier-gold.png`], prompt: tier("This one is the lowest rank: dark brushed gunmetal iron, matte charcoal enamel on the shield face, completely plain — remove the laurel wreath, no ornaments at all.") },
    { name: "tier-bronze", refs: [`${RAW}/tier-gold.png`], prompt: tier("This one: warm bronze metal, dark brown enamel on the shield face, no laurel wreath — only a simple raised rim and two small rivets.") },
    { name: "tier-silver", refs: [`${RAW}/tier-gold.png`], prompt: tier("This one: bright polished silver metal, deep navy enamel on the shield face, a short thin laurel sprig on each side (smaller than the reference).") },
    { name: "tier-platinum", refs: [`${RAW}/tier-gold.png`], prompt: tier("This one: pale platinum metal with a cool teal-white sheen, dark teal enamel on the shield face, replace the laurel with a pair of small sharp metal wings on both sides.") },
    { name: "tier-diamond", refs: [`${RAW}/tier-gold.png`], prompt: tier("This one: white-gold metal set with icy blue faceted diamond gems along the rim, deep sapphire-blue enamel on the shield face, larger swept wings on both sides and one large faceted blue gem at the top of the shield.") },
    { name: "tier-master", refs: [`${RAW}/tier-gold.png`], prompt: tier("This one is the highest rank and the most ornate: black metal with gold trim, deep royal purple enamel on the shield face, a gold crown on top of the shield, large layered wings and radiating pointed rays behind the shield.") },
    { name: "medal-1", prompt: medal("First place: rich gold medal with a small gold crown fixed on top of the medal, red ribbon with thin gold edges.") },
] : [
    { name: "medal-2", refs: [`${RAW}/medal-1.png`], prompt: medalRef("Second place: bright silver medal, no crown, royal blue ribbon with thin silver edges.") },
    { name: "medal-3", refs: [`${RAW}/medal-1.png`], prompt: medalRef("Third place: warm bronze medal, no crown, forest green ribbon with thin bronze edges.") },
    { name: "medal-4", refs: [`${RAW}/medal-1.png`], prompt: medalRef("Fourth place: dark gunmetal medal with a thin gold rim, no crown, deep purple ribbon.") },
    { name: "medal-5", refs: [`${RAW}/medal-1.png`], prompt: medalRef("Fifth place: dark gunmetal medal with a thin silver rim, no crown, charcoal grey ribbon.") },
];
let cost = 0;
for (let i = 0; i < JOBS.length; i += 4) {
    const out = await Promise.all(JOBS.slice(i, i + 4).map((j) => gen({ ...j, model: MODEL }).catch((e) => ({ name: j.name, error: String(e).slice(0, 160) }))));
    for (const r of out) { cost += r.cost ?? 0; console.log(r.error ? `FAIL ${r.name}: ${r.error}` : r.skipped ? `skip ${r.name}` : `ok   ${r.name} ${Math.round(r.bytes / 1024)}KB ${Math.round(r.ms / 1000)}s $${r.cost}`); }
}
console.log("this run $", cost.toFixed(4), "| key:", JSON.stringify(await keyInfo()));
