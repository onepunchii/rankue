import { gen, keyInfo } from "./gen.mjs";
const cue = (d) => `Macro studio product photograph of the decorated butt section of exactly one carom billiard cue. The cue runs perfectly horizontally through the vertical middle of the frame and extends past both the left and the right edge of the frame; it is about one fifth of the frame height thick. Strict side view, sharp focus, soft even studio light with a gentle highlight along the top. ${d} Pure solid black background with nothing else in the frame: no table, no balls, no hands, no second cue, no text, no logo, no brand marks.`;
const JOBS = [
    ["a-cue2", cue("Design: dark polished ebony wood with a row of small white diamond-shaped inlays, framed left and right by thin silver rings; at the far left the pale maple forearm begins.")],
    ["b-cue2", cue("Design: reddish rosewood with classic long pointed veneers in cream and black (four-point style), a thin brass ring, then a dark brown leather-look grip on the right.")],
    ["c-cue2", cue("Design: matte black carbon fibre weave with two thin glowing electric-blue rings, then a black rubber grip with fine ribs on the right. Modern, minimal.")],
    ["d-cue2", cue("Design: deep teal-green stained maple with visible wood grain, two thin brass rings, then a natural cork-coloured grip on the right. Clean, minimal.")],
];
let cost = 0;
const out = await Promise.all(JOBS.map(([name, prompt]) => gen({ name, model: "openai/gpt-5-image-mini", prompt }).catch((e) => ({ name, error: String(e).slice(0, 160) }))));
for (const r of out) { cost += r.cost ?? 0; console.log(r.error ? `FAIL ${r.name}: ${r.error}` : `ok   ${r.name} ${Math.round(r.bytes / 1024)}KB $${r.cost}`); }
console.log("this run $", cost.toFixed(4), "| after:", JSON.stringify(await keyInfo()));
