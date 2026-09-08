/**
 * 규칙 엔진 타입. 물리 이벤트 로그(SimEvent[])를 읽어 한 샷의 결과를 판정한다.
 * 문자열 메시지 대신 코드를 돌려주고, 표시 문구는 i18n 이 맡는다.
 */

export type GameType = "3c" | "4c";

/** 3쿠션 규칙 세트. UMB/KBF = 모든 득점 1점(기본, 점수판 usePbaRule=false 와 일치). PBA = 뱅크샷 2점. */
export type ThreeCushionRuleSet = "umb" | "pba";

export interface ThreeCushionRules {
    readonly gameType: "3c";
    readonly ruleSet: ThreeCushionRuleSet;
    /** PBA 뱅크샷 점수(기본 2). ruleSet 이 umb 면 무시. */
    readonly bankShotPoint: number;
}

export interface FourBallRules {
    readonly gameType: "4c";
    /** 득점 단위. 국내 당구장 관행 10점. */
    readonly pointUnit: number;
    /** 3쿠션 이상으로 득점하면 2배(당구장 흔한 관행). */
    readonly threeCushionDouble: boolean;
    /** 상대 큐볼에 '수동' 접촉(적구가 밀려가 닿음)도 파울로 볼지. 기본 false — 큐볼이 직접 닿을 때만 파울. */
    readonly passiveOpponentContactIsFoul: boolean;
    /** 파울 감점(단위 배수). 기본 1 → −pointUnit. */
    readonly foulPenaltyUnits: number;
}

export type Rules = ThreeCushionRules | FourBallRules;

export type ShotOutcomeCode =
    | "point"            // 정상 득점
    | "point-bank"       // PBA 뱅크샷(쿠션 3개 먼저) 득점
    | "point-3c"         // 4구: 3쿠션 이상 득점(2배 옵션)
    | "miss-no-contact"  // 아무 공도 못 맞힘
    | "miss-one-ball"    // 한 공만 맞힘
    | "miss-cushions"    // 3쿠션: 두 공 다 맞혔지만 쿠션 부족
    | "foul-opponent"    // 4구: 상대 큐볼 접촉
    | "miss-finish"      // 마무리 규칙(마지막 점수는 3쿠션/뱅크) 미충족 → 무득점
    | "foul-truncated"   // 물리 이벤트 상한 초과 → 샷 무효
    | "foul-opening"     // 3쿠션 개시 샷: 첫 접촉이 빨간 공이 아님(UMB 개시 규칙) → 무득점·이닝 소모
    | "foul-timeout"     // 대전 40초 룰: 시간 초과 → 무득점·이닝 소모(샷 없이 서버가 넘긴다)
    | "no-shot";         // 이벤트 없음(0 파워) → 이닝 소모 안 함

/** evaluateShot 부가 옵션. */
export interface EvaluateOptions {
    /**
     * 개시 샷인가(3쿠션). UMB 규칙: 개시 샷은 빨간 공을 먼저 맞혀야 한다 — 첫 접촉이 상대 큐볼이면 foul-opening.
     * 아무 공도 못 맞히면 보통의 miss-no-contact. 4구는 무시. 개시 샷 판정은 session.isOpeningShot 가 맡는다.
     */
    readonly opening?: boolean;
}

export interface ShotOutcome {
    readonly code: ShotOutcomeCode;
    /** 득점 변화(부호 포함, 단위 반영). 음수 정상. */
    readonly points: number;
    /** 득점이면 true. 이닝은 !scored 일 때 넘어간다(no-shot 제외). */
    readonly scored: boolean;
    /** 이닝을 소모하는가. no-shot 만 false. */
    readonly consumesInning: boolean;
    /** 큐볼이 두 번째 적구를 맞히기 전까지 밟은 쿠션 수(첫 적구 전후 모두 포함). */
    readonly cushionsBeforeSecond: number;
    /** 첫 적구를 맞히기 전 쿠션 수(뱅크샷 판정용). */
    readonly cushionsBeforeFirst: number;
    /** 맞힌 순서대로의 공 id(중복 제거, 최대 2). */
    readonly contacts: readonly string[];
    /** 첫 적구 접촉 이후 발생한 공–공 이벤트 수(쫑·키스). 코칭 UI 용, 판정엔 무관. */
    readonly kisses: number;
}
