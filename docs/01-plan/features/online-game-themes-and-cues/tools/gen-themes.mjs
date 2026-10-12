import { gen, keyInfo } from "./gen.mjs";
const MODEL = "openai/gpt-5-image-mini";
const wood = (w) => `Top-down flat photograph of ${w}, filling the entire square frame edge to edge as a material texture. Straight grain running horizontally, evenly lit with soft diffuse light, no vignette, no reflections of objects, no knots, no joints, no screws, no objects, no text, no logo, no border.`;
const cue = (d) => `Studio product photograph of exactly one carom billiard cue stick lying perfectly horizontal across the middle of the frame, the whole cue visible from the small leather tip at the far left to the rubber bumper at the far right, strict side view, sharp focus along the full length. ${d} Isolated on a pure solid black background with nothing else in the frame: no table, no balls, no chalk, no hands, no shadow blob, no text, no logo, no brand marks.`;
const room = (d) => `Wide interior photograph used as a blurred backdrop: ${d} Shot strongly out of focus with heavy bokeh so no detail is sharp, dim overall, the lower half of the frame darker and empty. No people, no faces, no billiard table, no text, no signs, no logos, no screens.`;
const JOBS = [
    ["a-wood", wood("dark red-brown mahogany wood with a deep high-gloss piano lacquer finish")],
    ["b-wood", wood("warm medium-brown walnut wood with a satin oil finish and gentle natural grain")],
    ["c-wood", wood("matte black stained ash wood with clearly visible open grain, charcoal black, no gloss")],
    ["d-wood", wood("pale natural hard maple wood with a smooth satin finish and very fine light grain")],
    ["a-cue", cue("Design: pale maple shaft with a white ferrule; dark ebony butt with two thin silver rings and a row of small white diamond-shaped inlays; black rubber grip.")],
    ["b-cue", cue("Design: honey maple shaft with a cream ferrule; reddish rosewood butt with classic four-point veneers in cream and black; dark brown leather-look grip.")],
    ["c-cue", cue("Design: matte black carbon-fibre shaft with a black ferrule; charcoal butt with two thin electric-blue ring accents; black rubber grip. Modern and minimal.")],
    ["d-cue", cue("Design: light maple shaft with a white ferrule; deep teal-green stained butt with two thin brass rings; natural cork-coloured grip. Clean and minimal.")],
    ["a-room", room("a large dark tournament arena hall, rows of empty seats fading into darkness, a few cool white spotlights high above, blue-black tones.")],
    ["b-room", room("a cosy old-fashioned billiard hall, warm tungsten pendant lamps glowing, dark wood-panelled walls, amber and brown tones.")],
    ["c-room", room("a modern lounge at night, dark concrete walls, thin neon light strips in cyan and violet glowing far in the background, deep charcoal tones.")],
    ["d-room", room("a bright minimalist studio room in soft daylight, pale plaster walls, light oak floor, large window light from one side, calm grey-beige tones.")],
];
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const jobs = JOBS.filter(([n]) => !only || only.has(n));
console.log("before:", JSON.stringify(await keyInfo()));
let cost = 0;
for (let i = 0; i < jobs.length; i += 4) {
    const out = await Promise.all(jobs.slice(i, i + 4).map(([name, prompt]) => gen({ name, model: MODEL, prompt }).catch((e) => ({ name, error: String(e).slice(0, 160) }))));
    for (const r of out) { cost += r.cost ?? 0; console.log(r.error ? `FAIL ${r.name}: ${r.error}` : r.skipped ? `skip ${r.name}` : `ok   ${r.name} ${Math.round(r.bytes / 1024)}KB ${Math.round(r.ms / 1000)}s $${r.cost}`); }
}
console.log("this run $", cost.toFixed(4), "| after:", JSON.stringify(await keyInfo()));
