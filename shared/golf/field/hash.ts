/** 샷 해시 — events + final 만(프레임·서브스텝은 제외). 서버 재시뮬과 대조한다. */
import { fnv1a64String } from "../../sim/hash.js";
import { stableStringify } from "../../sim/version.js";
import type { BallState3, StrokeEvent } from "./types.js";

export function strokeHash(events: readonly StrokeEvent[], final: BallState3): string {
    return fnv1a64String(stableStringify({ events, final: { p: final.p, v: final.v, w: final.w, phase: final.phase, t: final.t } }));
}
