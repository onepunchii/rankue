// 큐 케이스 — 큐 36 · 초크 16 · 장갑 16. 본 셋(anchor-*)을 본으로 같은 화풍 · 같은 구도.
// 실전(점수판)과 온라인은 그림에서 한 가지로만 가른다: 온라인 큐 · 장갑에는 차가운 청록 네온 선이 하나 들어간다.
import { runAll, RAW } from "./genr.mjs";
const NO = "Pure solid black background. Nothing else in the frame: no table, no balls, no hands, no particles, no light rays, no smoke, no ground shadow, no text, no letters, no numbers, no logos, no flags, no watermark.";
const cue = (spec, online = false) => `Use the attached cue as the exact style and composition reference: the same stylised 3D collectible game-item render, the same single carom billiard cue lying in a straight diagonal from the bottom-left corner to the top-right corner, tip at the top right, the same length, the same thickness, the same framing, the same light maple shaft with white ferrule and blue-chalked tip, the same thin warm rim light. Change only the decorated butt half (below the joint) and the joint rings: ${spec}${online ? " ONLINE edition: add one thin glowing cyan neon line ring just below the joint and a faint cyan glow on the butt cap, like a digital edition of the cue." : ""} It must look clearly different from a plain cue at small size. ${NO}`;
const chalk = (spec) => `Use the attached chalk cube as the exact style and composition reference: the same stylised 3D collectible render, the same three-quarter view from slightly above, the same size and framing, the same powdery matte top with a shallow round cup worn by a cue tip, the same glossy paper wrapper on the four sides. Change the colours and the wrapper pattern: ${spec} No letters on the wrapper. ${NO}`;
const glove = (spec, online = false) => `Use the attached glove as the exact style and composition reference: the same stylised 3D collectible render, the same three-finger billiard bridge glove for the left hand (thumb, index and middle fingers covered; ring and little fingers open), laid flat palm-down, seen from directly above, the same size, framing and outline. Change the colours and decoration: ${spec}${online ? " ONLINE edition: the finger-edge trim glows as a thin cyan neon line." : ""} ${NO}`;
const REF = { cue: [`${RAW}/anchor-cue-full.png`], chalk: [`${RAW}/anchor-chalk.png`], glove: [`${RAW}/anchor-glove.png`] };
const C = (name, spec, online) => ({ name: `cue-${name}`, refs: REF.cue, prompt: cue(spec, online) });
const K = (name, spec) => ({ name: `chalk-${name}`, refs: REF.chalk, prompt: chalk(spec) });
const G = (name, spec, online) => ({ name: `glove-${name}`, refs: REF.glove, prompt: glove(spec, online) });

export const JOBS = [
    // ── 실전 · 누적(공식 경기 수) 6
    C("games-10", "a plain starter cue: pale natural ash wood butt with visible straight grain, no inlays at all, one thin black ring at the joint, a plain black rubber butt cap."),
    C("games-50", "honey maple butt with two simple dark walnut points, one silver ring at the joint."),
    C("games-100", "dark walnut butt with four sharp maple points, a double silver ring collar at the joint, a black linen-textured wrap."),
    C("games-300", "deep red cocobolo butt with four ebony points edged in thin white veneer lines, a triple silver ring collar, a black leather wrap."),
    C("games-500", "black ebony butt with six long ivory-white points and small mother-of-pearl dots between them, a gold ring collar, a dark brown leather wrap with fine stitching."),
    C("games-1000", "the grand milestone cue: glossy black ebony butt fully inlaid with gold filigree scrollwork and mother-of-pearl diamonds, a wide gold ring collar set with small rubies, a gold butt cap, a black crocodile-texture leather wrap."),
    // ── 실전 · 하이런 4
    C("run-5", "black butt with a single stylised orange flame inlay licking up from the butt cap toward the joint, a copper ring at the joint."),
    C("run-10", "black butt with a bigger two-tone orange and yellow flame inlay wrapping around the butt, a gold ring at the joint."),
    C("run-15", "dark navy butt with a crackling electric blue lightning bolt inlay running the full length of the butt, a silver ring at the joint, the lightning slightly glowing."),
    C("run-20", "the legendary high-run cue: midnight purple butt with a white-hot lightning and blue flame inlay together, glowing softly, a platinum ring collar with small sapphires."),
    // ── 실전 · 명장면 8
    C("finisher", "the finishing-stroke cue: black butt with a single long silver arrow inlay pointing toward the tip, a red ring at the joint."),
    C("shutout", "the shutout cue: matte charcoal butt with a white shield-shaped inlay in the middle and steel-blue points, a steel ring collar."),
    C("comeback", "the comeback cue: butt that fades from deep red at the butt cap to bright gold near the joint, with a rising zig-zag inlay line, a gold ring."),
    C("no-miss", "the no-empty-inning cue: polished silver-grey birdseye maple butt with an unbroken continuous spiral inlay of thin black line from bottom to top, a black ring."),
    C("over-target", "the over-the-handicap cue: forest green butt with gold upward chevron inlays stacked like rank stripes, a gold ring."),
    C("regular", "the regular-player cue: warm brown leather-wrapped butt with brass studs in a row and an old-fashioned brass ring collar, a classic vintage billiard-hall look."),
    C("traveller", "the traveller cue: navy butt with a small compass-rose inlay in mother-of-pearl and a dotted route line inlay, a silver ring."),
    C("dama-up", "the handicap-up cue: white butt with a royal-blue round medal-shaped inlay and blue points, a gold ring."),
    // ── 실전 · 숨은 큐 4
    C("jjajang", "a playful hidden cue themed on black-bean noodles delivered to a Korean billiard hall: glossy black butt with a swirling glossy dark-brown sauce-like marble pattern, a small inlay of a pair of wooden chopsticks crossed, a yellow ring at the joint."),
    C("dawn", "a hidden late-night cue: deep indigo night-sky butt with tiny silver star inlays and a thin crescent moon inlay, a pale silver ring."),
    C("triple-three", "a hidden cue: black butt with three identical small gold diamond inlays in a row, repeated three times along the butt, a gold ring."),
    C("anniversary", "a hidden anniversary cue: cream ivory butt with a pastel ribbon-band inlay wrapping around and a small gold star, a rose-gold ring."),
    // ── 온라인 · 등급 7
    C("tier-iron", "plain light steel-grey butt with a hammered metal texture and four round rivets, no inlays, a steel ring.", true),
    C("tier-bronze", "light maple butt with warm copper-bronze rings and a small amber gem inlay.", true),
    C("tier-silver", "maple and dark wood butt with a bright silver ring collar and a small blue sapphire inlay, short silver laurel inlays.", true),
    C("tier-gold", "rosewood butt with four gold-edged points, a gold ring collar and a small ruby inlay with a gold laurel inlay.", true),
    C("tier-platinum", "black ebony butt with white diamond-shaped inlays, a pale platinum ring collar and a teal aquamarine gem inlay with small swept wing inlays.", true),
    C("tier-diamond", "black ebony butt with icy blue swirling inlays and a row of small faceted blue diamonds, a white-gold ring collar.", true),
    C("tier-master", "black obsidian butt with royal purple enamel panels, gold trim, a small gold crown inlay and gold wing inlays, a wide gold ring collar with purple gems.", true),
    // ── 온라인 · 월대회 · 이달의 랭킹 · 업적 7
    C("cup-champion", "the monthly cup champion cue: gold butt with a small trophy-cup inlay in white enamel, red enamel bands, a crown-shaped gold collar.", true),
    C("cup-runnerup", "the monthly cup runner-up cue: bright silver butt with a small trophy-cup inlay, royal-blue enamel bands, a silver collar.", true),
    C("cup-semi", "the monthly cup semi-final cue: copper-bronze butt with a small trophy-cup inlay, forest-green enamel bands, a bronze collar.", true),
    C("month-top", "the monthly ranking number-one cue: white butt with a gold laurel wreath inlay circling the middle and a small gold crown, a gold ring.", true),
    C("online-first-win", "the first online win cue: teal butt with a single small white star inlay, a silver ring.", true),
    C("online-streak", "the online win-streak cue: black butt with a chain of five glowing cyan chevrons pointing toward the tip, a silver ring.", true),
    C("online-100", "the hundred online wins cue: carbon-fibre black butt with a cyan circuit-line inlay pattern and a silver collar.", true),

    // ── 초크 · 권역 구장 투어 9
    K("seoul", "deep royal blue chalk, wrapper in navy with a gold border pattern of a simple stylised palace-roof roofline motif."),
    K("gyeonggi", "emerald green chalk, wrapper in dark green with a gold border of simple rolling-hill wave lines."),
    K("incheon", "sky blue chalk, wrapper in white with a navy border of simple sea-wave lines."),
    K("gangwon", "pine green chalk, wrapper in deep forest green with a silver border of small pine-tree triangles."),
    K("chungcheong", "sand-gold chalk, wrapper in warm brown with a cream border of simple field-row lines."),
    K("jeolla", "crimson red chalk, wrapper in deep red with a gold border of simple bamboo segments."),
    K("gyeongsang", "violet purple chalk, wrapper in plum with a gold border of simple mountain-peak zig-zags."),
    K("busan", "turquoise chalk, wrapper in deep teal with a white border of simple seagull-wing and wave lines."),
    K("jeju", "tangerine orange chalk, wrapper in dark basalt grey with an orange border of small round stone dots."),
    // ── 초크 · 계절 한정 4
    K("spring", "soft cherry-blossom pink chalk, wrapper in white with a pink border of small five-petal blossoms."),
    K("summer", "fresh mint chalk, wrapper in deep teal with a white border of simple wave curls."),
    K("autumn", "maple orange-red chalk, wrapper in dark brown with a gold border of small maple leaves."),
    K("winter", "snow white chalk with a faint icy blue tint, wrapper in midnight navy with a silver border of small snowflakes."),
    // ── 초크 · 특별 3
    K("regular-gold", "a precious gold chalk: metallic gold powdery top, wrapper in black lacquer with a raised gold border, slightly sparkling."),
    K("crew", "a crew expedition chalk: bright red chalk, wrapper in black with a white border of small repeated triangle pennants."),
    K("first-trip", "a first-expedition chalk: silver-grey chalk, wrapper in white with a silver border of a dotted route line and small compass points."),

    // ── 장갑 · 달마다 12(그 달의 다이아몬드 레일을 다 켜면)
    G("m01", "black glove with icy silver trim, the round emblem on the back of the hand is white enamel with a small silver snowflake."),
    G("m02", "black glove with deep red trim, emblem with a small red camellia flower."),
    G("m03", "black glove with pale spring-green trim, emblem with a small white plum blossom on a branch."),
    G("m04", "black glove with soft pink trim, emblem with a small cluster of cherry blossoms."),
    G("m05", "black glove with fresh leaf-green trim, emblem with a small pair of young green leaves."),
    G("m06", "black glove with blue-violet trim, emblem with a small hydrangea flower ball."),
    G("m07", "black glove with ocean teal trim, emblem with a small curling wave."),
    G("m08", "black glove with sunflower-yellow trim, emblem with a small sunflower."),
    G("m09", "black glove with warm gold trim, emblem in navy enamel with a small round golden full moon."),
    G("m10", "black glove with warm orange trim, emblem in cream enamel with a small pink-and-white cosmos flower (eight rounded petals, yellow centre) — not a maple leaf."),
    G("m11", "black glove with ginkgo-yellow trim, emblem with a small golden ginkgo leaf."),
    G("m12", "black glove with midnight-blue trim, emblem in deep navy with three small silver stars."),
    // ── 장갑 · 특별 4
    G("first", "a starter glove: plain black with simple grey trim, plain steel emblem."),
    G("year-gold", "the year-round attendance glove: black glove with rich gold trim and gold stitching along the fingers, a gold emblem with a small laurel wreath."),
    G("crew", "a crew glove: black glove with bright red trim, emblem in white enamel with a small red triangle pennant."),
    G("cup-entry", "the online monthly cup entrant glove: black glove with dark navy trim, emblem with a small silver trophy cup.", true),
];
if (import.meta.url === `file://${process.argv[1]}`) await runAll(JOBS);
