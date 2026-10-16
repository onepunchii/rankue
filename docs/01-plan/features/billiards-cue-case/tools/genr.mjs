// 그림 한 장 — OpenRouter(이미지 출력 모델). 키는 저장소 밖 파일(OPENROUTER_KEY_FILE)에서 읽고 찍지 않는다.
// 결과는 reports/cue-case-1016/raw 에(저장소에서 무시되는 폴더). 이미 있는 이름은 건너뛴다(FORCE=1 이면 다시).
import fs from "node:fs";
import path from "node:path";
const KEY = fs.readFileSync(process.env.OPENROUTER_KEY_FILE, "utf8").trim();
export const RAW = "/Users/choejeonghwan/rankue-app/reports/cue-case-1016/raw";
const LEDGER = path.join(RAW, "_ledger.jsonl");
fs.mkdirSync(RAW, { recursive: true });

export async function keyInfo() {
    const r = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${KEY}` } });
    const d = (await r.json())?.data ?? {};
    return { status: r.status, usage: d.usage, limit: d.limit, remaining: d.limit_remaining };
}

export async function gen({ name, model = "openai/gpt-5-image-mini", prompt, refs = [], aspect }) {
    const file = path.join(RAW, `${name}.png`);
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
    if (!img) return { name, error: `no image; text=${String(msg.content ?? "").slice(0, 160)}` };
    const m = /^data:(image\/[a-z+]+);base64,(.*)$/s.exec(img);
    if (!m) return { name, error: `unexpected image url: ${img.slice(0, 60)}` };
    fs.writeFileSync(file, Buffer.from(m[2], "base64"));
    const rec = { name, model: j.model ?? model, bytes: fs.statSync(file).size, ms: Date.now() - t0, cost: j.usage?.cost ?? null, at: new Date().toISOString(), prompt };
    fs.appendFileSync(LEDGER, JSON.stringify(rec) + "\n");
    return { name, file, cost: rec.cost };
}

// 넷씩 나란히 돌린다.
export async function runAll(jobs) {
    const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
    const list = jobs.filter((j) => !only || only.has(j.name));
    let cost = 0;
    for (let i = 0; i < list.length; i += 4) {
        const out = await Promise.all(list.slice(i, i + 4).map((j) => gen(j).catch((e) => ({ name: j.name, error: String(e).slice(0, 160) }))));
        for (const r of out) { cost += r.cost ?? 0; console.log(r.error ? `FAIL ${r.name}: ${r.error}` : r.skipped ? `skip ${r.name}` : `ok   ${r.name} $${r.cost}`); }
    }
    console.log("this run $", cost.toFixed(4), "| key:", JSON.stringify(await keyInfo()));
}
