// 실전(오프라인 점수판) 다마 메달 시안 — 가운데가 빈 둥근 메달(숫자는 화면이 얹는다). 결과는 reports/real-badges-1012/raw(저장소에서 무시되는 폴더).
import fs from "node:fs";
import path from "node:path";
const S = path.dirname(new URL(import.meta.url).pathname);
const KEY = fs.readFileSync(path.join(S, "openrouter-key.txt"), "utf8").trim();
const OUT = "/Users/choejeonghwan/rankue-app/reports/real-badges-1012/raw";
const REF = "/Users/choejeonghwan/rankue-app/reports/sim-rank-b-1012/raw";
async function gen(name, prompt, refs) {
    const file = path.join(OUT, `${name}.png`);
    if (fs.existsSync(file) && !process.env.FORCE) return `skip ${name}`;
    const content = [{ type: "text", text: prompt }, ...refs.map((p) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${fs.readFileSync(p).toString("base64")}` } }))];
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://www.rankue.co.kr", "X-Title": "Rankue design samples" }, body: JSON.stringify({ model: "openai/gpt-5-image-mini", messages: [{ role: "user", content }], modalities: ["image", "text"], usage: { include: true } }) });
    const j = await r.json().catch(() => null);
    const img = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const m = img ? /^data:(image\/[a-z+]+);base64,(.*)$/s.exec(img) : null;
    if (!m) return `FAIL ${name}: ${r.status} ${JSON.stringify(j?.error ?? j?.choices?.[0]?.finish_reason ?? "no image").slice(0, 160)}`;
    fs.writeFileSync(file, Buffer.from(m[2], "base64"));
    return `ok ${name} $${j.usage?.cost ?? "?"}`;
}
const BASE = "The background must be flat pure black (#000000) everywhere: absolutely no glow, no halo, no gradient, no vignette. Strict front view, centered, bold silhouette readable at 48 pixels, fills about 80% of the frame. The round disc in the middle must be completely EMPTY and flat — no ball, no symbol, no pattern, no highlight streak — because a number will be printed there later. No particles, no light rays, no ground shadow, no text, no letters, no numbers, no watermark.";
const which = process.argv[2] ?? "gold";
if (which === "gold") {
    console.log(await gen("real-gold", `Two images are attached as style references only (stylised 3D game render, chunky beveled gold metal with a thin bright rim light, glossy dark green enamel, flat black background). Create a NEW object in the same style: a round rank medallion for a billiards player. A thick chunky circular gold ring with a beveled rim; inside it a large flat disc of deep dark green enamel. Behind the ring, two billiard cues crossed in an X so only their ends stick out at the four diagonals. A half wreath of gold laurel leaves hugging the lower half of the ring, and one small faceted red gem set at the very top of the ring. ${BASE}`, [`${REF}/tier-gold.png`, `${REF}/icon-practice2.png`]));
} else {
    const spec = {
        bronze: "Material: warm bronze / copper metal. Simplest version: the plain thick ring and the two crossed cues only — no laurel leaves, no gem.",
        silver: "Material: polished silver / steel metal. The ring, the two crossed cues, and just two small laurel sprigs at the bottom of the ring — no gem.",
        platinum: "Material: pale platinum metal with a cool teal tint. The ring, the crossed cues, a fuller laurel wreath reaching three quarters of the way up both sides, a teal faceted gem at the top, and a small pointed ornament on the left and right of the ring.",
        diamond: "Material: bright silver-blue metal with ice-blue crystal facets set into the ring. The ring, the crossed cues, a full laurel wreath all the way round, a large brilliant-cut diamond at the top, and small crystal spikes around the ring.",
        master: "Material: rich gold with deep red enamel inlays on the ring. The ring, the crossed cues, a full gold laurel wreath all the way round, and a gold crown with red gems sitting on top of the ring.",
    };
    const jobs = Object.entries(spec).map(([k, v]) => gen(`real-${k}`, `The attached image is a gold rank medallion. Draw the SAME medallion — same construction, same proportions, same size of the empty dark green centre disc, same viewing angle — but as a different rank. ${v} ${BASE}`, [`${OUT}/real-gold.png`]));
    for (const r of await Promise.all(jobs)) console.log(r);
}
