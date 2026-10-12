import { gen } from "./genb.mjs";
const RAW = "/Users/choejeonghwan/rankue-app/reports/sim-badges-1012/raw";
const medalRef = (spec) => `Use the attached medal as the exact style and composition reference: same medal shape and size, same blank recessed round plate in the middle (keep it empty), same laurel ring with two tiny crossed cues, same V-shaped ribbon shape, same framing, lighting and pure solid black background. Create a different placing of the same medal family. ${spec} The metal must be clearly visible against the black background (not dark). No text, no letters, no numbers, no watermark.`;
const out = await Promise.all([
    gen({ name: "medal-4b", model: "openai/gpt-5-image-mini", refs: [`${RAW}/medal-1.png`], prompt: medalRef("Fourth place: light polished steel medal (cool pale grey, brighter than gunmetal) with a ring of violet-purple enamel around the plate, no crown, violet-purple ribbon with thin steel edges.") }),
    gen({ name: "medal-5b", model: "openai/gpt-5-image-mini", refs: [`${RAW}/medal-1.png`], prompt: medalRef("Fifth place: light polished steel medal (cool pale grey, brighter than gunmetal) with a ring of teal enamel around the plate, no crown, teal ribbon with thin steel edges.") }),
]);
for (const r of out) console.log(r.error ? `FAIL ${r.name}: ${r.error}` : `ok ${r.name} $${r.cost}`);
