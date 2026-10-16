// 큐 3차 — 하대(손잡이 쪽)만 가로로, 카탈로그 모양. 상위 모델(gemini-3.1-flash-image) · 21:9.
// 오너(2026-10-16): "더 퀄리티있게 상위모델 써서 · 한국적인 거랑 큐가 일단 많아야 돼".
// 온라인 큐는 그림에서 한 가지로만 가른다: 이음쇠 바로 옆의 얇은 청록 네온 링.
import { runAll } from "./genr.mjs";
const MODEL = "google/gemini-3.1-flash-image";
const butt = (design, online) => `A luxury product catalog illustration of ONLY the butt section of a carom billiard cue (the lower half held in the hand; no shaft, no tip), lying perfectly horizontal, strict straight side view (orthographic, no perspective, no tilt), spanning nearly the full width of the image and centred vertically; the cue's diameter is about one sixth of the image height. Left end: a rounded black rubber bumper and an engraved silver butt cap. Right end: a polished metal joint collar, cut off flat. The cylinder tapers very slightly toward the right. Classic handmade cue construction from left to right: butt sleeve with a decorative art panel, a thin ring band, then the forearm with long sharp inlaid points (spears) of contrasting veneer pointing right toward the joint, then the joint ring. Museum-quality fine wood marquetry and inlay work (mother-of-pearl, abalone, turquoise, coloured veneers, engraved metal), glossy clear-coat with a soft reflection along the top edge. Design: ${design}${online ? " ONLINE edition: one thin glowing cyan neon ring right next to the joint collar." : ""} Plain flat solid dark charcoal-grey background, evenly lit, nothing else. No text, no letters, no numbers, no hangul, no logos, no brand names, no signatures, no flags, no hands.`;
const R = (name, design, online = false) => ({ name: `rack-${name}`, model: MODEL, aspect: "21:9", prompt: butt(design, online) });

export const JOBS = [
    // ── 실전 · 누적(공식 경기 수) 6
    R("games-10", "a plain starter cue: pale natural ash wood with straight grain, no inlays, one thin black ring band."),
    R("games-50", "honey maple with two simple dark walnut points and one silver ring band."),
    R("games-100", "dark walnut with four sharp birdseye-maple points, a double silver ring band, a small diamond inlay in the sleeve."),
    R("games-300", "deep red cocobolo with four ebony points edged in thin white veneer lines, a triple silver ring band, sleeve with a row of small mother-of-pearl dots."),
    R("games-500", "black ebony with six long ivory-white points and mother-of-pearl dots between them, gold ring bands, sleeve with a gold geometric band."),
    R("games-1000", "the grand milestone cue: glossy black ebony, sleeve covered in gold filigree scrollwork with mother-of-pearl diamonds, ivory-white points edged in gold, gold ring bands set with small rubies."),
    // ── 실전 · 하이런 4
    R("run-5", "black wood, sleeve panel with a stylised orange flame inlay, copper ring bands, plain black points."),
    R("run-10", "black wood, a two-tone orange and yellow flame inlay licking along the whole sleeve and forearm, gold ring bands."),
    R("run-15", "dark navy wood, a crackling electric-blue lightning bolt inlay running along the sleeve, long blue points, silver ring bands."),
    R("run-20", "the legendary high-run cue: midnight purple wood, sleeve with a white-hot lightning bolt in mother-of-pearl wrapped in blue flames, long electric-blue points, platinum ring bands with small sapphires."),
    // ── 실전 · 명장면 8
    R("finisher", "black wood with one long silver arrow inlay pointing right toward the joint, red ring band."),
    R("shutout", "matte charcoal wood, sleeve with a white shield inlay, steel-blue points, steel ring bands."),
    R("comeback", "wood that fades from deep red at the left to bright gold at the right, rising zig-zag inlay line along the sleeve, gold ring bands."),
    R("no-miss", "silver-grey birdseye maple with one unbroken continuous spiral line inlay in black from end to end, black ring bands."),
    R("over-target", "forest green wood with stacked gold chevron inlays like rank stripes, gold ring bands."),
    R("regular", "a vintage billiard-hall cue: warm brown leather-look wrap on the sleeve with brass studs, old brass ring bands, walnut points."),
    R("traveller", "navy wood, sleeve with a mother-of-pearl compass rose and a dotted route line inlay, silver ring bands."),
    R("dama-up", "white wood with royal-blue round medal inlays in the sleeve and royal-blue points, gold ring bands."),
    // ── 실전 · 숨은 큐 4
    R("jjajang", "a playful hidden cue themed on black-bean noodles delivered to a Korean billiard hall: glossy black wood with a swirling dark-brown marbled sauce pattern in the sleeve, a pair of crossed wooden chopsticks inlay, yellow ring bands."),
    R("dawn", "a late-night cue: deep indigo night-sky wood with tiny silver star inlays and a crescent moon in mother-of-pearl, pale silver ring bands."),
    R("triple-three", "black wood with three groups of three small gold diamond inlays along the sleeve and forearm, gold ring bands."),
    R("anniversary", "cream ivory wood with a pastel ribbon inlay wrapping the sleeve and a small gold star, rose-gold ring bands."),
    // ── 실전 · 계절 한정 4
    R("spring", "light maple, sleeve inlaid with cherry-blossom branches in pink mother-of-pearl, soft pink points, rose-gold ring bands."),
    R("summer", "teal-blue wood, sleeve inlaid with curling ocean waves in abalone and white veneer, white points, silver ring bands."),
    R("autumn", "warm walnut, sleeve inlaid with red and orange maple leaves in coloured veneer, deep red points, gold ring bands."),
    R("winter", "white holly wood, sleeve inlaid with snowflakes and snowy pine branches in silver and pale-blue veneer, navy points, silver ring bands."),
    // ── 온라인 · 등급 7
    R("tier-iron", "the plainest entry-level cue: completely plain matte grey-brown ash wood, NO art panel, NO inlays, NO points, NO gems, only two thin brushed-steel ring bands and a plain steel butt cap. Simple and humble.", true),
    R("tier-bronze", "light maple with copper-bronze ring bands, a small amber gem inlay in the sleeve, chestnut points.", true),
    R("tier-silver", "maple and dark wood with bright silver ring bands, a small blue sapphire and short silver laurel sprigs in the sleeve, navy points.", true),
    R("tier-gold", "rosewood with four gold-edged points, gold ring bands, a ruby inlay framed by a gold laurel wreath in the sleeve.", true),
    R("tier-platinum", "black ebony with white diamond-shaped inlays, pale platinum ring bands, a teal aquamarine gem with small swept wings in the sleeve, teal points.", true),
    R("tier-diamond", "black ebony with icy-blue swirling inlays and a row of small faceted blue diamonds, white-gold ring bands, icy-blue points.", true),
    R("tier-master", "black obsidian with royal purple enamel panels, gold trim, a small gold crown with gold wings in the sleeve, purple points, gold ring bands with purple gems.", true),
    // ── 온라인 · 월대회 · 이달의 랭킹 · 업적 7
    R("cup-champion", "the monthly cup champion cue: gold-leaf wood, sleeve with a trophy cup inlay in white enamel between red enamel bands, red points, gold ring bands.", true),
    R("cup-runnerup", "the monthly cup runner-up cue: bright silver-grey wood, sleeve with a trophy cup inlay, royal-blue enamel bands and points, silver ring bands.", true),
    R("cup-semi", "the monthly cup semi-final cue: copper-bronze wood, sleeve with a trophy cup inlay, forest-green enamel bands and points, bronze ring bands.", true),
    R("month-top", "the monthly ranking number-one cue: white wood with a gold laurel wreath around the sleeve and a small gold crown, gold points, gold ring bands.", true),
    R("online-first-win", "teal wood with a single white star inlay in the sleeve, white points, silver ring bands.", true),
    R("online-streak", "black wood with a chain of five cyan chevrons pointing right along the forearm, silver ring bands.", true),
    R("online-100", "carbon-fibre black with a cyan circuit-line inlay pattern across the sleeve, silver ring bands.", true),
    // ── 한국 컬렉션 20
    R("kr-najeon-crane", "Korean najeon-chilgi: glossy black lacquer, sleeve inlaid in iridescent mother-of-pearl with two flying cranes among clouds, mother-of-pearl points, silver ring bands."),
    R("kr-najeon-peony", "Korean najeon-chilgi: deep red-black lacquer, sleeve inlaid with large peony flowers and vines in iridescent mother-of-pearl and abalone, mother-of-pearl points, gold ring bands."),
    R("kr-minhwa-tiger", "Korean folk painting (minhwa): sleeve panel in coloured veneer marquetry showing a friendly, humorous striped tiger under a pine tree with a magpie on a branch, light maple forearm with dark green points, brass ring bands."),
    R("kr-munsal", "Korean hanok door latticework: honey-coloured pine wood, the sleeve and forearm inlaid with a fine geometric hanok window lattice (munsal) pattern in dark walnut lines, paper-white panels between, brass ring bands."),
    R("kr-celadon", "Korean Goryeo celadon: pale jade-green glaze-like wood with crackle texture, sleeve inlaid (sanggam technique) with white and black cranes and clouds in round medallions, jade points, silver ring bands."),
    R("kr-moonjar", "Korean Joseon white porcelain moon jar: soft milky cream-white wood with a subtle warm glaze sheen, a single round moon-jar silhouette in the sleeve, very minimal, thin pale-gold ring bands."),
    R("kr-dancheong", "Korean palace dancheong: sleeve with bands of traditional dancheong patterns (green, red, blue, white and yellow lotus and geometric motifs), birdseye maple forearm with long dark green and red points, brass ring bands."),
    R("kr-saekdong", "Korean saekdong (rainbow-striped hanbok sleeve): sleeve with bright saekdong stripes in red, yellow, green, blue, pink and white veneer, ebony forearm with white points, gold ring bands."),
    R("kr-plum", "Korean four gentlemen series — plum blossom: ink-black wood, sleeve with a gnarled plum branch and white-pink blossoms in mother-of-pearl, ivory points, silver ring bands."),
    R("kr-orchid", "Korean four gentlemen series — orchid: ink-black wood, sleeve with long flowing orchid leaves and one small flower in jade-green and white inlay, jade points, silver ring bands."),
    R("kr-chrysanthemum", "Korean four gentlemen series — chrysanthemum: ink-black wood, sleeve with golden chrysanthemum flowers and leaves in gold and amber inlay, gold points, silver ring bands."),
    R("kr-bamboo", "Korean four gentlemen series — bamboo: ink-black wood, sleeve with bamboo stalks and leaves in green and pale-gold inlay, green points shaped like bamboo leaves, silver ring bands."),
    R("kr-sipjangsaeng", "Korean ten symbols of longevity (sipjangsaeng): sleeve panel in rich coloured marquetry showing sun, clouds, mountains, water, pine, deer, crane, turtle and bullocho mushrooms, deep blue forearm with gold points, gold ring bands."),
    R("kr-ilwol", "Korean royal Irworobongdo screen: sleeve panel showing five blue-green mountain peaks, a red sun and a white moon, pine trees and waves in coloured inlay, dark navy forearm with gold points, gold ring bands."),
    R("kr-silla-crown", "Silla gold crown: wood covered in hammered gold leaf, sleeve decorated with tree-branch shaped gold motifs and dangling small gold spangles and green jade comma-shaped beads (gogok), black points, gold ring bands."),
    R("kr-jogakbo", "Korean jogakbo patchwork wrapping cloth: sleeve made of a mosaic of small rectangles in soft pastel silk colours (indigo, pink, jade, cream, saffron) in veneer, cream forearm with indigo points, silver ring bands."),
    R("kr-turtleship", "Korean turtle ship (geobukseon): sleeve panel in coloured marquetry showing the dragon-headed turtle ship on stylised waves, deep sea-blue forearm with white points, bronze ring bands."),
    R("kr-hahoe", "Korean Hahoe mask: sleeve panel in carved-look light wood marquetry with two smiling Hahoe masks (the yangban and the bride) side by side, dark ebony forearm with red and black points, brass ring bands."),
    R("kr-lantern", "Korean cheongsachorong lanterns: dark night-blue wood, sleeve with a row of glowing red-and-blue silk lanterns in coloured inlay, red points, gold ring bands."),
    // ── 4차(2026-10-16): 실전 사람 1 · 온라인 게임 안 10 · 크루 6
    R("new-face", "the new-faces cue: warm teak wood, sleeve inlaid with a ring of ten small different-coloured round dots (like ten different people) in mother-of-pearl, abalone and coloured veneer, teak and ebony points, silver ring bands."),
    R("on-games-50", "the fifty online matches cue: dark slate-blue wood, sleeve with five small silver rings inlaid in a row, white points, silver ring bands.", true),
    R("on-games-300", "the three hundred online matches cue: black wood, sleeve with a wide band of fine silver and cyan pinstripes like a counter display, long silver points, platinum ring bands.", true),
    R("on-run-5", "the online high-run 5 cue: black wood, sleeve with a small cyan flame inlay, cyan-edged black points, silver ring bands.", true),
    R("on-run-10", "the online high-run 10 cue: black wood, a big two-tone cyan and white flame inlay licking along the sleeve and forearm, silver ring bands.", true),
    R("on-run-15", "the online high-run 15 cue: deep violet wood, sleeve with a cyan-white plasma flame and lightning together, long cyan points, platinum ring bands.", true),
    R("bank-first", "the first bank-shot cue: walnut wood, sleeve with an inlaid zig-zag ball path line in white that bounces off a straight rail line before reaching a small red dot, white points, silver ring bands.", true),
    R("bank-50", "the bank-shot master cue: ebony wood, sleeve with many crossing bouncing ball-path lines inlaid in gold forming a geometric star-like pattern framed by two straight rail lines, gold points, gold ring bands.", true),
    R("five-cushion", "the five-cushion cue: midnight blue wood, sleeve with a single long ball-path line in silver that bounces five times between two rail lines (five zig-zag bounces clearly visible), silver points, silver ring bands.", true),
    R("on-comeback", "the online comeback cue: wood that fades from deep cyan at the left to bright white-gold at the right, rising zig-zag inlay line, silver ring bands.", true),
    R("rival", "the rival cue: half dark ebony and half pale maple split down the length, two opposing arrowheads meeting in the middle of the sleeve in mother-of-pearl, black and white points, silver ring bands.", true),
    R("crew-champion", "the crew tournament champion cue: deep crimson wood, sleeve with a gold laurel wreath around a blank round white enamel shield (room for a crew emblem), gold points, wide gold ring bands."),
    R("crew-runnerup", "the crew tournament runner-up cue: deep navy wood, sleeve with a silver laurel wreath around a blank round white enamel shield, silver points, silver ring bands."),
    R("crew-regular", "the crew regulars cue: warm chestnut wood, sleeve with a row of small triangle pennant inlays in red, gold and white, chestnut points, brass ring bands."),
    R("crew-founder", "the crew founding-member cue: black ebony, sleeve with an inlaid cornerstone block and a small gold key in mother-of-pearl, ivory points, gold ring bands."),
    R("crew-battle", "the crew-versus-crew cue: black wood, sleeve with two crossed pennant flags (one red, one blue) in coloured veneer, red and blue points alternating, steel ring bands."),
    R("crew-hundred", "the crew hundred games cue: forest green wood, sleeve with a band of tiny interlocking hands-like knot pattern (a braided cord) in gold, green and gold points, gold ring bands."),
    R("kr-baekho", "Korean white tiger (baekho), the guardian of the west: black ebony, sleeve with a majestic white tiger in mother-of-pearl and silver among stylised clouds, silver points, platinum ring bands."),
];
if (import.meta.url === `file://${process.argv[1]}`) await runAll(JOBS);
