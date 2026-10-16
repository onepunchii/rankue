// 큐 2차 — 오너 지적: 비스듬한 전체 큐는 끝이 이상하고 장식장에 많이 안 들어간다 → 하대(손잡이 쪽)만 가로로 눕힌 카탈로그 모양.
// 먼저 견본 몇 장으로 모델 · 비율을 고른다.
import { runAll } from "./genr.mjs";
const butt = (design) => `A product catalog illustration of ONLY the butt section of a carom billiard cue (the lower half held in the hand, no shaft, no tip), lying perfectly horizontal, strict straight side view (orthographic, no perspective), spanning the full width of the image from edge to edge and centred vertically. Left end: a rounded black rubber bumper and an engraved silver butt cap. Right end: a polished metal joint collar, cut off flat. The cylinder tapers very slightly toward the right. Classic luxury cue construction from left to right: butt sleeve with a decorative panel, a thin ring band, then the forearm with long sharp inlaid points (spears) of contrasting veneer pointing right toward the joint, then the joint ring. Fine wood marquetry with crisp inlays (mother-of-pearl, turquoise, coloured veneers), glossy clear-coat reflections along the top edge. Design: ${design} Dark charcoal background. No text, no letters, no numbers, no logos, no brand names, no signatures, no people, no hands.`;
const D = {
    grand: "black ebony with gold filigree scrollwork inlays and mother-of-pearl diamonds in the sleeve, four long ivory-white points edged in thin gold lines, gold ring bands set with small rubies.",
    lightning: "midnight purple-black wood, the sleeve panel inlaid with a white-hot lightning bolt and blue flames in coloured veneer, long electric-blue points, platinum ring bands.",
    dancheong: "a Korean palace theme: the sleeve panel inlaid with traditional Korean dancheong pattern bands (green, red, blue, white and yellow lotus and geometric motifs), forearm of light birdseye maple with long dark green and red points, brass ring bands.",
};
const JOBS = [];
for (const [k, d] of Object.entries(D)) {
    JOBS.push({ name: `butt-mini-${k}`, model: "openai/gpt-5-image-mini", prompt: butt(d) });
    JOBS.push({ name: `butt-gem-${k}`, model: "google/gemini-2.5-flash-image", aspect: "21:9", prompt: butt(d) });
}
JOBS.push({ name: "butt-g31-dancheong", model: "google/gemini-3.1-flash-image", aspect: "21:9", prompt: butt(D.dancheong) });
await runAll(JOBS);
