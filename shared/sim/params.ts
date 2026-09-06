/**
 * 물리 파라미터와 테이블·큐 프리셋. 값의 출처는 각 항목 옆에 적는다.
 * 숫자를 바꾸면 paramsHash 가 바뀌어 리플레이·래더 기간이 갈린다 — 바꿀 때는 ENGINE_VERSION 도 올릴 것.
 */
import type { CushionSegment } from "./types";

export interface BallParams {
    /** 질량 (kg) */
    readonly m: number;
    /** 반지름 (m) */
    readonly R: number;
    /** 공–천 미끄럼 마찰 계수. Mathavan 2009 측정 0.178–0.245, pooltool 0.2 */
    readonly muS: number;
    /** 공–천 구름 마찰 계수. 히팅 캐롬 천 0.008–0.012, pooltool 0.01 */
    readonly muR: number;
    /** 수직축 스핀(ω_z) 감속 (rad/s²). Dr. Dave 5–15, pooltool 환산 10.9 */
    readonly spinDecel: number;
    /** 공–공 반발 계수. Mathavan 2014 0.89, Marlow 0.92, pooltool 0.95 → 캐롬 페놀 수지 0.93 */
    readonly eB: number;
    /** 공–공 마찰 μ(v) = a + b·exp(−c·v_rel). Alciatore TP A.14 / pooltool 수렴 피팅 */
    readonly muBB: { readonly a: number; readonly b: number; readonly c: number };
    /** 쿠션 운동학적 반발 계수 (Han 2005 / sphere-half-space 모델용 상수). pooltool 0.85, 캐롬 히팅 테이블은 더 탄력 → 0.88 */
    readonly eC: number;
    /**
     * 쿠션 **에너지** 반발 계수 e_e (Stronge) — mathavan2010 모델 전용. eC 와 뜻이 다르므로 따로 둔다.
     * Mathavan 2010 의 피팅값은 0.98(스누커 강체 쿠션, v_n < 1.5 m/s)이지만 우리 구현에서는 수직 입사 구름 공의
     * 반발 속도비가 e_e 와 같게 나와(40-physics-review Finding 3: 0.98 이면 0.980) 실측 운동학 COR 대역
     * 0.82–0.91(Mathavan 2009)을 벗어난다. 그래서 보정 전까지 대역 안의 0.88 을 쓴다.
     * 보정 항목: 문헌 노트 §9.1 의 e_e(v_n) — 1 m/s 아래 0.98 에서 3.5 m/s 에 ≈ 0.85 로 감소 — 는 아직 상수다
     * (세 모델 모두 e·μ 가 상수라 반사각·속도비가 입사 속도와 무관하다; "빠를수록 짧게" 는 재현되지 않는다).
     */
    readonly eE: number;
    /** 쿠션 마찰 계수. pooltool 캐롬 프리셋 0.15, Mathavan 2010 μ_w 0.14–0.2 */
    readonly fC: number;
    /** 중력 가속도 */
    readonly g: number;
}

export interface TableSpec {
    readonly id: "DAEDAE" | "JUNGDAE_KR";
    /** UI 표시용 한국어 이름 */
    readonly name: string;
    /** 짧은 변 (m) — x 축 */
    readonly width: number;
    /** 긴 변 (m) — y 축 */
    readonly length: number;
    /** 쿠션 코(nose) 높이 (m). UMB 대대 37 mm → sinθ = (h−R)/R ≈ 0.203. 국내 중대는 실측 전까지 같은 비율 가정 */
    readonly cushionHeight: number;
    readonly ball: BallParams;
}

export interface CueParams {
    /** 큐 질량 (kg). 캐롬 큐 500–540 g */
    readonly M: number;
    /** 팁 반발 효율 η(가죽 팁 COR 0.72 기준 ≈ 0.88). 큐볼 속도에 곱한다. */
    readonly tipEfficiency: number;
    /** 샤프트 엔드매스 비 m_b/m_e. TP A.31 전형 8–20, 기본 12 → 최대 오프셋에서 스쿼트 ≈ 3° */
    readonly endmassRatio: number;
    /** 허용 최대 팁 오프셋 (R 비율). 초과하면 미스큐 → 입력 단계에서 거부 */
    readonly maxOffset: number;
}

export type CushionModelId = "han2005" | "sphereHalfSpace" | "mathavan2010";

export interface SimParams {
    readonly table: TableSpec;
    readonly cue: CueParams;
    readonly cushionModel: CushionModelId;
    /**
     * 테이블 컨디션 스칼라(1.0 = 문헌값, 양의 유한수). 히팅·습도 느낌을 한 숫자로:
     * muR·muS 는 1/condition 배, eC·eE 는 condition^0.25 배로 스케일한다(구현은 applyCondition 참고).
     */
    readonly condition: number;
}

const CAROM_BALL_61_5: BallParams = {
    m: 0.210,       // UMB 205–220 g
    R: 0.03075,     // 61.5 mm
    muS: 0.20,
    muR: 0.010,
    spinDecel: 11,
    eB: 0.93,
    muBB: { a: 9.951e-3, b: 0.108, c: 1.088 },
    eC: 0.88,
    eE: 0.88,
    fC: 0.15,
    g: 9.81,
};

/** 국내식 중대 4구 공. 65.5 mm, 약 250 g (기존 프리셋 값 유지, 실측 대상) */
const CAROM_BALL_65_5: BallParams = {
    ...CAROM_BALL_61_5,
    m: 0.250,
    R: 0.03275,
};

export const TABLES: Record<TableSpec["id"], TableSpec> = {
    DAEDAE: {
        id: "DAEDAE",
        name: "대대",
        width: 1.422,
        length: 2.844,
        cushionHeight: 0.037,
        ball: CAROM_BALL_61_5,
    },
    JUNGDAE_KR: {
        id: "JUNGDAE_KR",
        name: "중대",
        width: 1.224,
        length: 2.448,
        // 실측 전: 대대와 같은 (h−R)/R 비율을 유지 → 0.03275 × 1.203
        cushionHeight: 0.0394,
        ball: CAROM_BALL_65_5,
    },
};

export const DEFAULT_CUE: CueParams = {
    M: 0.52,
    tipEfficiency: 0.88,
    endmassRatio: 12,
    maxOffset: 0.5,
};

export const DEFAULT_PARAMS: SimParams = {
    table: TABLES.DAEDAE,
    cue: DEFAULT_CUE,
    cushionModel: "han2005",
    condition: 1.0,
};

/** 테이블 컨디션을 반영한 실효 공 파라미터. condition=1 이면 입력 그대로. */
export function applyCondition(ball: BallParams, condition: number): BallParams {
    if (condition === 1) return ball;
    const inv = 1 / condition;
    // condition^0.25 를 초월함수 없이: sqrt(sqrt(x))
    const eScale = Math.sqrt(Math.sqrt(condition));
    return {
        ...ball,
        muS: ball.muS * inv,
        muR: ball.muR * inv,
        eC: Math.min(0.98, ball.eC * eScale),
        eE: Math.min(0.98, ball.eE * eScale),
    };
}

/** 4면 쿠션 세그먼트. 법선은 테이블 안쪽. */
export function cushionSegments(table: TableSpec): readonly CushionSegment[] {
    const w = table.width, l = table.length;
    return [
        { id: "left", p1: [0, 0], p2: [0, l], normal: [1, 0] },
        { id: "right", p1: [w, 0], p2: [w, l], normal: [-1, 0] },
        { id: "bottom", p1: [0, 0], p2: [w, 0], normal: [0, 1] },
        { id: "top", p1: [0, l], p2: [w, l], normal: [0, -1] },
    ];
}
