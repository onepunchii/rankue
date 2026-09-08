/**
 * shared/sim 공개 API. README "index.ts 전부 재수출".
 * 규칙 엔진(rules/)은 자체 index 를 가지며 물리와 분리해 둔다 — 서버·클라이언트가 따로 import 한다.
 */
export * from "./types.js";
export * from "./params.js";
export * from "./dmath.js";
export * from "./vec.js";
export * from "./roots/common.js";
export * from "./roots/quadratic.js";
export * from "./roots/quartic.js";
export * from "./evolve.js";
export * from "./detect/index.js";
export * from "./resolve/stickBall.js";
export * from "./resolve/ballBall.js";
export * from "./resolve/ballTable.js";
export * from "./resolve/cushion/index.js";
export * from "./resolve/transition.js";
export * from "./resolve/kiss.js";
export * from "./simulate.js";
export * from "./continuize.js";
export * from "./hash.js";
export * from "./rng.js";
export * from "./version.js";
export * from "./rank.js";
export * from "./layouts.js";
export * from "./drills.js";
