/**
 * 쇼츠 2단계 — 대본 · 음성 · 자막 타이밍(lines.json). 전부 오픈라우터 키 하나로 한다.
 *
 *   npx tsx scripts/shorts/narrate.ts <slug> [--script-only]
 *
 *  1. 대본: facts.json + 장면표(장면별 길이)를 LLM 에 넘겨 캐스터 · 해설 2인 중계 대본을 JSON 으로 받는다(script.json).
 *     --script-only 면 여기서 멈춘다(대본만 손보고 싶을 때). script.json 이 이미 있으면 다시 쓰지 않는다 — 지우면 새로 쓴다.
 *  2. 음성: 줄마다 /audio/speech(OpenAI 호환)로 mp3 를 받고 ffprobe 로 길이를 잰다.
 *  3. 배치: 줄을 자기 장면 시작부터 차례로 놓는다. 장면을 넘치면 atempo 로 최대 1.25배까지 줄이고,
 *     그래도 넘치면 다음 장면으로 밀린다(경고). 자막은 이 시각을 그대로 쓴다 — 음성을 다시 받아쓸 필요가 없다.
 *
 * 환경 변수: OPENROUTER_API_KEY(필수) · SHORTS_SCRIPT_MODEL · SHORTS_TTS_MODEL · SHORTS_VOICE_CASTER · SHORTS_VOICE_ANALYST
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { simulateShot } from "@shared/sim/simulate";
import { buildTimeline, totalDuration, type SceneId } from "./timeline";

const slug = process.argv[2];
if (!slug) throw new Error("사용법: tsx scripts/shorts/narrate.ts <slug> [--script-only]");
const scriptOnly = process.argv.includes("--script-only");
const KEY = (process.env.OPENROUTER_API_KEY ?? "").trim();
if (!KEY) throw new Error("OPENROUTER_API_KEY 가 없다 — .env 에 넣어 주세요");
const SCRIPT_MODEL = process.env.SHORTS_SCRIPT_MODEL ?? "anthropic/claude-sonnet-5.5";
const TTS_MODEL = process.env.SHORTS_TTS_MODEL ?? "google/gemini-3.8-flash-tts";
const VOICE: Record<string, string> = {
    캐스터: process.env.SHORTS_VOICE_CASTER ?? "Fenrir",
    해설: process.env.SHORTS_VOICE_ANALYST ?? "Charon",
};
const STYLE: Record<string, string> = {
    캐스터: "한국 스포츠 중계 캐스터. 빠르고 들뜬 목소리, 결정적 순간엔 소리친다.",
    해설: "한국 당구 해설위원. 차분하고 아는 게 많은 목소리, 가끔 놀라서 웃는다.",
};

const dir = `scripts/shorts/out/${slug}`;
const shot = JSON.parse(readFileSync(`${dir}/shot.json`, "utf8"));
const facts = JSON.parse(readFileSync(`${dir}/facts.json`, "utf8"));
const res = simulateShot(shot.preState, shot.input, shot.params);
const contact2 = facts.timeline.find((x: any) => x.kind === "contact" && x.n === 2).t;
const cushions = facts.timeline.filter((x: any) => x.kind === "cushion").map((x: any) => x.t);
const scenes = buildTimeline({ contact2, lastCushion: cushions.at(-1) ?? contact2, duration: res.duration });
const total = totalDuration(scenes);

interface ScriptLine { scene: SceneId; speaker: "캐스터" | "해설"; text: string }

async function api(path: string, body: unknown): Promise<Response> {
    const r = await fetch(`https://openrouter.ai/api/v1${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://rankue.app", "X-Title": "Rankue Shorts" },
        body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`오픈라우터 ${path} ${r.status}: ${(await r.text()).slice(0, 400)}`);
    return r;
}

// ── 1. 대본 ──────────────────────────────────────────
const scriptPath = `${dir}/script.json`;
let script: ScriptLine[];
if (existsSync(scriptPath)) {
    script = JSON.parse(readFileSync(scriptPath, "utf8"));
    console.log(`대본 재사용: ${scriptPath}`);
} else {
    const slots = scenes.map((s) => ({ scene: s.id, seconds: Math.round(s.dur * 10) / 10, maxChars: Math.floor(s.dur * 6.5) }));
    const { hitMask: _omit, ...miracle } = facts.miracle;
    const prompt = `당구 시뮬레이터 앱 "랭큐"의 유튜브 쇼츠 「이게 들어가?」 대본을 써 줘. 캐스터와 해설위원 2인 중계다.

## 샷 사실(이것만 근거로 쓴다 — 숫자를 지어내지 말 것)
${JSON.stringify({ ...facts, miracle }, null, 1)}

- timeline: 큐볼이 첫 적구를 맞힌 뒤 쿠션을 차례로 맞고(n=쿠션 번호) 두 번째 적구에 닿으면 득점(3쿠션은 두 번째 적구 전 쿠션 3개 이상).
- miracle: 같은 자리에서 손 떨림 수준의 오차로 1,000번 다시 쳐서 득점한 횟수. 생각보다 높거나 낮으면 그 반전을 재미로 살려도 된다.
- 선수는 "플레이어 A/B"로만 부른다(실명 · 닉네임 금지). tipSide 양수 = 오른쪽 회전.

## 장면(순서대로, 장면마다 seconds 동안 화면에 나온다)
${JSON.stringify(slots)}
- hook: 결말 직전 느린 화면. 시청자를 붙잡는 한마디.
- rewind: 되감기. 아주 짧게(없어도 됨).
- aim: 치기 전. 경기 상황과 세기 · 당점.
- play: 위에서 본 화면, 쿠션 카운터가 1부터 올라간다. 쿠션을 세는 중계.
- slow: 마지막 쿠션 → 두 번째 적구, 느린 화면. 가장 크게 터지는 순간.
- settle: 득점 직후 반응.
- miracle: 1,000번 다시 쳐 본 결과 화면.
- outro: "당신이라면?" 랭큐 앱에서 직접 쳐 보라는 마무리.

## 규칙
- 장면마다 0~2줄. 한 장면의 글자 합이 maxChars 를 넘지 않는다(말할 시간이 그만큼뿐이다).
- 한국어 구어체, 짧고 리듬 있게. 과장은 좋지만 사실과 다른 말은 금지. 이모지 · 해시태그 금지.
- 자막으로도 나가므로 한 줄은 30자 이내.

JSON 배열만 출력: [{"scene":"hook","speaker":"캐스터","text":"..."}]`;
    const r = await api("/chat/completions", { model: SCRIPT_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0.9 });
    const content: string = (await r.json()).choices[0].message.content;
    script = JSON.parse(content.slice(content.indexOf("["), content.lastIndexOf("]") + 1));
    writeFileSync(scriptPath, JSON.stringify(script, null, 2));
    console.log(`대본 → ${scriptPath}`);
}
script.forEach((l) => console.log(`  [${l.scene}] ${l.speaker}: ${l.text}`));
if (scriptOnly) process.exit(0);

// ── 2 · 3. 음성과 배치 ─────────────────────────────────
const probe = (f: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const out: { start: number; end: number; text: string; speaker: string; audio: string; scene: string }[] = [];
let cursor = 0;
for (let i = 0; i < script.length; i++) {
    const l = script[i];
    const scene = scenes.find((s) => s.id === l.scene) ?? scenes[0];
    const raw = `voice-${String(i).padStart(2, "0")}.raw.mp3`;
    const r = await api("/audio/speech", {
        model: TTS_MODEL, input: l.text, voice: VOICE[l.speaker] ?? VOICE.캐스터, response_format: "mp3", instructions: STYLE[l.speaker],
    });
    writeFileSync(`${dir}/${raw}`, Buffer.from(await r.arrayBuffer()));
    const start = Math.max(scene.start + 0.12, cursor + 0.06);
    const room = scene.start + scene.dur - start;
    let file = raw;
    let dur = probe(`${dir}/${raw}`);
    if (dur > room && room > 0.3) {
        const tempo = Math.min(1.25, dur / room);
        file = `voice-${String(i).padStart(2, "0")}.mp3`;
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${dir}/${raw}`, "-filter:a", `atempo=${tempo.toFixed(3)}`, `${dir}/${file}`]);
        dur = probe(`${dir}/${file}`);
    }
    if (start + dur > scene.start + scene.dur + 0.05) console.warn(`  ! "${l.text}" 가 ${l.scene} 장면을 ${(start + dur - scene.start - scene.dur).toFixed(2)}초 넘친다`);
    out.push({ start: round(start), end: round(start + dur), text: l.text, speaker: l.speaker, audio: file, scene: l.scene });
    cursor = start + dur;
}
if (cursor > total) console.warn(`  ! 음성이 영상 끝(${total.toFixed(1)}초)보다 ${(cursor - total).toFixed(1)}초 길다`);
writeFileSync(`${dir}/lines.json`, JSON.stringify(out, null, 2));
console.log(`음성 ${out.length}줄 → ${dir}/lines.json (TTS ${TTS_MODEL}, 대본 ${SCRIPT_MODEL})`);

function round(x: number) { return Math.round(x * 1000) / 1000; }
