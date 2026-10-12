import { gen, keyInfo } from "./genb.mjs";
const RAW = "/Users/choejeonghwan/rankue-app/reports/sim-badges-1012/raw";
const icon = (spec) => `Use the attached emblem only as the style reference: the same polished gold metal with hard enamel, the same crisp bevels, the same soft studio lighting and the same pure solid black background, the same glossy billiard balls (white, yellow, red). Create a different object in that same family, as a single game menu icon: ${spec} Strict front view, centered, symmetrical where possible, the object fills about 75% of the frame with empty black margin all around. No shield unless stated. No text, no letters, no numbers, no watermark, no extra objects.`;
const JOBS = [
    ["icon-versus", "two billiard cues crossed in an X with a white ball on the left and a yellow ball on the right facing each other, a small gold spark where the cues cross — meaning a head-to-head match."],
    ["icon-drill", "a round gold target (three concentric enamel rings in dark green) with a red billiard ball sitting exactly on the bullseye and one cue pointing at it from the lower left — meaning a practice challenge."],
    ["icon-practice", "a single white billiard ball resting on a small round patch of blue cloth with a gold rim, and one cue lying behind it — meaning solo practice."],
    ["icon-trophy", "a gold trophy cup with two handles on a short dark base, three billiard balls (white, yellow, red) sitting in the cup, a small laurel on the front of the cup — meaning the ranking."],
    ["icon-cabinet", "a small dark walnut display shelf with a gold frame, front view, two shelves, each holding three tiny gold round medals — meaning a trophy cabinet."],
];
let cost = 0;
for (let i = 0; i < JOBS.length; i += 4) {
    const out = await Promise.all(JOBS.slice(i, i + 4).map(([name, spec]) => gen({ name, model: "openai/gpt-5-image-mini", refs: [`${RAW}/tier-gold.png`], prompt: icon(spec) }).catch((e) => ({ name, error: String(e).slice(0, 160) }))));
    for (const r of out) { cost += r.cost ?? 0; console.log(r.error ? `FAIL ${r.name}: ${r.error}` : r.skipped ? `skip ${r.name}` : `ok   ${r.name} $${r.cost}`); }
}
console.log("this run $", cost.toFixed(4), "| key:", JSON.stringify(await keyInfo()));
