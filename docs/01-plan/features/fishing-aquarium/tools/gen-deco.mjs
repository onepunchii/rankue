// 수족관 꾸미기 장식(2026-10-16 오너: "조건 달성을 통한 굿즈로 수족관 꾸미기" → 자리 칸 · 크루원 구경 + 카드 · 24점).
// 어탁과 같은 손(먹 판화). 흰 바탕 — 화면이 먹선만 따내 낮엔 먹색, 밤엔 달빛색으로 칠한다. 글자 없음.
// node gen-deco.mjs  (키는 OPENROUTER_KEY_FILE, 결과는 reports/cue-case-1016/raw/deco-*.png)
import { runAll } from "../../billiards-cue-case/tools/genr.mjs";
const REF = process.env.DECO_REF; // 화풍 기준(어탁 한 장)
const style = "in exactly the same black-ink scientific engraving / gyotaku illustration style as the reference image (fine stippled ink lines, no colour, pure white background, wide white margin, nothing cut off by the edges). No text, no letters, no numbers, no frame, no people.";
const SQ = (name, what) => ({ name: `deco-${name}`, model: "openai/gpt-5-image-mini", prompt: `${what}, seen from the side as an aquarium ornament, ${style}`, refs: REF ? [REF] : [] });
const WIDE = (name, what, aspect = "21:9") => ({ name: `deco-${name}`, model: "google/gemini-3.1-flash-image", aspect, prompt: `${what}. ${style}`, refs: REF ? [REF] : [] });
export const JOBS = [
    WIDE("bg-dawn", "A very wide faint distant seascape for the back wall of an aquarium: a calm horizon at dawn with a low rising sun, a far lighthouse on a small cape and a few distant islands, drawn lightly", "16:9"),
    WIDE("bg-moon", "A very wide faint distant night seascape for the back wall of an aquarium: a large full moon above a calm sea with a moonlit path of ripples and far low islands, drawn lightly", "16:9"),
    WIDE("bg-mist", "A very wide faint distant freshwater landscape for the back wall of an aquarium: a quiet Korean reservoir in morning mist with soft layered hills and a few reeds, drawn lightly", "16:9"),
    WIDE("floor-sand", "A long low strip of smooth sea-floor sand with gentle ripples and a few tiny shells, seen from the side, as the bottom of an aquarium"),
    WIDE("floor-pebble", "A long low strip of rounded pebbles and gravel, seen from the side, as the bottom of an aquarium"),
    WIDE("floor-rock", "A long low strip of rugged coastal rock shelf (Korean gaetbawi) with barnacles, seen from the side, as the bottom of an aquarium"),
    WIDE("floor-mud", "A long low strip of soft freshwater mud with roots and fallen leaves, seen from the side, as the bottom of an aquarium"),
    SQ("rock", "A large rugged coastal rock (Korean gaetbawi) with barnacles and small mussels"),
    SQ("kelp", "A tall forest of wavy brown seaweed (miyeok / kelp) fronds rising from a rock"),
    SQ("lighthouse", "A small lighthouse miniature standing on a rocky base, like a harbour lighthouse"),
    SQ("boat", "A small Korean wooden fishing boat model with a little cabin and fishing rods, resting on the sea floor"),
    SQ("lotus", "A cluster of lotus plants with round leaves and two lotus flowers rising on long stems from mud"),
    SQ("reed", "A clump of tall river reeds and cattails rising from mud"),
    SQ("trap", "A traditional cylindrical net fish trap (tongbal) lying on the sea floor with a rope"),
    SQ("crewbuoy", "A round fishing buoy floating on a short rope with a small triangular pennant flag on top"),
    SQ("lamp", "An old squid-fishing lamp (jibeodeung) — a large glass bulb lantern with a metal reflector, as used on squid boats"),
    SQ("frame", "A small wooden picture frame standing on the sea floor showing a gyotaku fish print inside"),
    SQ("float", "A long slender fishing float (bobber) standing upright with a small weight and line"),
    SQ("shell", "A small pile of sea shells, a conch and a scallop on sand"),
    SQ("goldanchor", "A grand ornate ship's anchor with decorative engraving and a chain, standing upright"),
];
if (import.meta.url === `file://${process.argv[1]}`) await runAll(JOBS);
