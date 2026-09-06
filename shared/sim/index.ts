/**
 * shared/sim 공개 API. README "index.ts 전부 재수출".
 * 규칙 엔진(rules/)은 자체 index 를 가지며 물리와 분리해 둔다 — 서버·클라이언트가 따로 import 한다.
 */
export * from "./types";
export * from "./params";
export * from "./dmath";
export * from "./vec";
export * from "./roots/common";
export * from "./roots/quadratic";
export * from "./roots/quartic";
export * from "./evolve";
export * from "./detect/index";
export * from "./resolve/stickBall";
export * from "./resolve/ballBall";
export * from "./resolve/cushion/index";
export * from "./resolve/transition";
export * from "./resolve/kiss";
export * from "./simulate";
export * from "./continuize";
export * from "./hash";
export * from "./rng";
export * from "./version";
export * from "./layouts";
