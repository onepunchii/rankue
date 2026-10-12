// 그림 한 장 — OpenRouter(이미지 출력 모델). 키는 파일에서 읽고 찍지 않는다. 결과는 reports/sim-badges-1012/raw 에(저장소에서는 무시되는 폴더).
import fs from "node:fs";
import path from "node:path";
const S = path.dirname(new URL(import.meta.url).pathname);
const KEY = fs.readFileSync(path.join(S, "openrouter-key.txt"), "utf8").trim();
const OUT = "/Users/choejeonghwan/rankue-app/reports/sim-badges-1012/raw";
const LEDGER = path.join(OUT, "_ledger.jsonl");

export async function keyInfo() {
    const r = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${KEY}` } });
    const j = await r.json();
    const d = j?.data ?? {};
    return { status: r.status, usage: d.usage, limit: d.limit, remaining: d.limit_remaining, free: d.is_free_tier };
}

export async function gen({ name, model, prompt, aspect, refs = [] }) {
    const file = path.join(OUT, `${name}.png`);
    if (fs.existsSync(file) && !process.env.FORCE) return { name, skipped: true, file };
    const content = [{ type: "text", text: prompt }, ...refs.map((p) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${fs.readFileSync(p).toString("base64")}` } }))];
    const body = { model, messages: [{ role: "user", content: refs.length ? content : prompt }], modalities: ["image", "text"], usage: { include: true }, ...(aspect ? { image_config: { aspect_ratio: aspect } } : {}) };
    const t0 = Date.now();
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://www.rankue.co.kr", "X-Title": "Rankue design samples" },
        body: JSON.stringify(body),
    });
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { return { name, error: `non-json ${r.status}: ${text.slice(0, 200)}` }; }
    if (!r.ok || j.error) return { name, error: `${r.status} ${JSON.stringify(j.error ?? j).slice(0, 300)}` };
    const msg = j.choices?.[0]?.message ?? {};
    const img = msg.images?.[0]?.image_url?.url ?? msg.images?.[0]?.url ?? null;
    if (!img) return { name, error: `no image; keys=${Object.keys(msg)}; text=${String(msg.content ?? "").slice(0, 160)}` };
    const m = /^data:(image\/[a-z+]+);base64,(.*)$/s.exec(img);
    if (!m) return { name, error: `unexpected image url: ${img.slice(0, 60)}` };
    fs.writeFileSync(file, Buffer.from(m[2], "base64"));
    const rec = { name, model: j.model ?? model, mime: m[1], bytes: fs.statSync(file).size, ms: Date.now() - t0, cost: j.usage?.cost ?? null, tokens: j.usage?.completion_tokens ?? null, at: new Date().toISOString(), prompt };
    fs.appendFileSync(LEDGER, JSON.stringify(rec) + "\n");
    return { name, file, model: rec.model, mime: rec.mime, bytes: rec.bytes, ms: rec.ms, cost: rec.cost, tokens: rec.tokens };
}
