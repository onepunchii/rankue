// 크루 페넌트 8 — 당구장 벽에 거는 삼각 깃발. 가운데 흰 패치는 비워 두고 크루 엠블럼을 화면이 얹는다(골프 깃발에서 배운 것: 바탕과 같은 색의 자리는 구별이 안 된다).
// 첫 장(pennant-games-100)을 본으로 나머지를 같은 모양으로.
import { runAll, RAW } from "./genr.mjs";
const NO = "Pure solid black background. Nothing else in the frame: no wall, no hands, no particles, no light rays, no ground shadow, no text, no letters, no numbers, no logos, no national flags, no watermark.";
const BASE = "A single felt crew pennant like the ones hung on the wall of a billiard hall: a long triangle pointing downward, hanging from a short polished wooden dowel with a braided cord loop on top, a thick stitched border, a short gold fringe along the two long edges, and a large round WHITE felt patch with a thin gold stitched ring in the upper wide part (the patch is completely blank, for a crew emblem). Stylised 3D collectible game-item render: soft felt texture, crisp stitching, thin bright rim light, front view, centred, fills about 80% of the frame height.";
const ref = (spec) => `Use the attached pennant as the exact style and shape reference: the same downward triangle, the same wooden dowel and braided cord, the same stitched border and gold fringe, the same large blank round white patch with a gold ring in the same place, the same size and framing. Change only the felt colour and the small embroidered motif below the patch: ${spec} Keep the white patch completely blank. ${NO}`;
const ANCHOR = `${RAW}/pennant-games-100.png`;
export const JOBS = [
    { name: "pennant-games-100", prompt: `${BASE} Felt colour: billiard-cloth green. Below the patch, one small embroidered gold star. ${NO}` },
];
const SET = [
    ["games-500", "deep forest green felt; below the patch three small embroidered gold stars in a row; the fringe is thicker and richer gold."],
    ["cup-5", "navy blue felt; below the patch a small embroidered silver trophy cup."],
    ["cup-20", "royal purple felt; below the patch a small embroidered gold trophy cup inside a tiny laurel wreath."],
    ["battle-10", "bright red felt; below the patch two small crossed billiard cues embroidered in cream and gold."],
    ["regular", "burgundy felt; below the patch three small embroidered billiard balls in a row — white, yellow and red (carom balls, no numbers)."],
    ["crew-of-month", "rich gold-yellow felt with a black stitched border; below the patch a small embroidered black-and-gold crown."],
    ["store-trips", "teal felt; below the patch a small embroidered silver compass rose."],
];
const all = [...JOBS, ...SET.map(([n, s]) => ({ name: `pennant-${n}`, refs: [ANCHOR], prompt: ref(s) }))];
if (import.meta.url === `file://${process.argv[1]}`) {
    await runAll(JOBS);
    await runAll(all.slice(1));
}
