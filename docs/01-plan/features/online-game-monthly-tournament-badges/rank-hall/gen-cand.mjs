import { gen, keyInfo } from "./genr.mjs";
export const EMBLEM = (spec) => `Competitive mobile game rank emblem, stylised 3D render, strict front view, perfectly centered and left-right symmetrical, on a pure solid black background. Bold, chunky silhouette that still reads clearly at 48 pixels. Thick beveled metal frame with a thin bright rim light along the whole outer edge, deep glossy hard enamel, crisp specular highlights, a faceted gemstone as the focal point, premium collectible feel like a top-tier esports rank badge that players want to earn. Billiards identity: a kite-shaped shield with two crossed billiard cues behind it, and three glossy billiard balls (one white, one yellow, one red) in a small triangle on the face of the shield. ${spec} Nothing outside the emblem itself: no floating particles, no light rays, no smoke, no ground shadow, no text, no letters, no numbers, no watermark. The emblem fills about 80% of the frame with clean black margin all around.`;
const GOLD = EMBLEM("GOLD rank: rich yellow gold metal, emerald-green enamel shield face, a glowing ruby gem set at the top of the shield, a full laurel wreath of gold leaves hugging both sides.");
const out = await Promise.all([
    gen({ name: "cand-gold-mini", model: "openai/gpt-5-image-mini", prompt: GOLD }),
    gen({ name: "cand-gold-full", model: "openai/gpt-5-image", prompt: GOLD }),
    gen({ name: "cand-gold-gem3pro", model: "google/gemini-3-pro-image", prompt: GOLD }),
].map((p) => p.catch((e) => ({ error: String(e).slice(0, 200) }))));
for (const r of out) console.log(r.error ? `FAIL ${r.name ?? ""}: ${r.error}` : `ok ${r.name} ${r.model} ${Math.round(r.bytes / 1024)}KB ${Math.round(r.ms / 1000)}s $${r.cost}`);
console.log("key:", JSON.stringify(await keyInfo()));
