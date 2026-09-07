/**
 * 조준 입력의 위험 안내(순수 함수, 테스트 동반). 화면은 왼쪽 위 칩 열에 문구 하나로 보여 준다 — 판정·물리에는 관여하지 않는다.
 * 엔진은 당점이 링(maxOffset) 밖이면 RangeError("miscue") 를 던지고 화면은 링 안으로 클램프하므로 게임에서 실제 미스큐는 나지 않는다.
 * 그래서 이건 "실제 큐라면 위험한 입력" 을 알려 주는 조언이다(2026-09-07 오너 요청).
 *
 *  - miscue(경고): 당점이 링의 85 % 밖. 실제 미스큐 한계(0.5 R)에 바짝 붙었다.
 *  - masse(경고): 큐 각 ≥ 30° 이고 당점이 링의 60 % 밖. 세운 큐 + 바깥 당점은 초크 없이는 잘 빗나간다.
 *  - jump(안내): 미리보기에서 큐볼이 천에서 1 cm 이상 뜬다(엔진 v2.2 z 축 — 큐를 들어 치면 슬레이트에 눌렸다 튀어 오른다;
 *    정점 5 mm 미만은 엔진이 천에 붙인다). 실측(2026-09-07): 45° 는 세기 6 m/s(67 %)부터 14 mm, 9 m/s 면 80 cm.
 *    미리보기가 아직 없으면(드래그 직후 30 ms) 점프는 판단하지 않는다 — 어림하면 미리보기가 오는 순간 문구가 깜빡인다.
 * 우선순위: miscue > masse > jump. 큐 각 10~30° 마세의 몇 mm 홉은 안내하지 않는다(문턱 아래).
 */
import type { ShotInput, SimResult } from "@shared/sim/types";

export type RiskKind = "miscue" | "masse" | "jump";
export interface ShotRisk {
    readonly kind: RiskKind;
    readonly level: "warn" | "info";
}

export const MISCUE_RATIO = 0.85;
export const MASSE_RATIO = 0.6;
export const MASSE_THETA_DEG = 30;
/** 큐볼이 천(z = R)에서 이만큼(m) 이상 뜨면 점프샷. */
export const JUMP_HOP_M = 0.01;

const DEG = Math.PI / 180;

/** 당점 오프셋 / 링 반지름(0 = 중앙, 1 = 링 위). */
export function offsetRatio(a: number, b: number, maxOffset: number): number {
    if (!(maxOffset > 0)) return 0;
    return Math.sqrt(a * a + b * b) / maxOffset;
}

/** 미리보기 궤적에서 큐볼의 최대 뜬 높이(m, z − R). history 가 없으면 0. */
export function cueBallHop(result: Pick<SimResult, "history"> | null | undefined, cueBallId: string, R: number): number {
    if (!result) return 0;
    let hop = 0;
    for (const frame of result.history) {
        for (const b of frame.balls) {
            if (b.id !== cueBallId) continue;
            const h = b.r[2] - R;
            if (h > hop) hop = h;
        }
    }
    return hop;
}

export interface RiskPreview {
    readonly result: Pick<SimResult, "history">;
    readonly cueBallId: string;
    readonly R: number;
}

export function shotRisk(input: Pick<ShotInput, "a" | "b" | "theta" | "V0">, maxOffset: number, preview: RiskPreview | null): ShotRisk | null {
    const ratio = offsetRatio(input.a, input.b, maxOffset);
    const thetaDeg = input.theta / DEG;
    if (ratio >= MISCUE_RATIO) return { kind: "miscue", level: "warn" };
    if (thetaDeg >= MASSE_THETA_DEG && ratio >= MASSE_RATIO) return { kind: "masse", level: "warn" };
    if (preview && cueBallHop(preview.result, preview.cueBallId, preview.R) >= JUMP_HOP_M) return { kind: "jump", level: "info" };
    return null;
}

export const RISK_KEYS: Readonly<Record<RiskKind, string>> = {
    miscue: "sim.risk.miscue",
    masse: "sim.risk.masse",
    jump: "sim.risk.jump",
};
