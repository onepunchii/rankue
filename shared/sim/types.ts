/**
 * shared/sim — 랭큐 캐롬 시뮬레이터 v2 물리 엔진의 공용 타입.
 *
 * 설계 원칙 (변경하려면 README.md 를 먼저 고칠 것)
 *  - 순수 TypeScript. DOM·three.js·Node API 의존 없음. 브라우저·Web Worker·Vercel 서버가 같은 코드를 돌린다.
 *  - SI 단위: 미터, 초, 킬로그램, 라디안. 좌표계: 당구대 플레이 면의 한 모서리가 원점,
 *    x ∈ [0, width](짧은 변), y ∈ [0, length](긴 변), z 위쪽(+). 공 중심은 x ∈ [R, width−R] 등.
 *  - 결정론: 이 폴더 안에서는 Math.sin/cos/tan/atan/atan2/asin/acos/exp/log/pow/hypot/cbrt/random 을
 *    쓰지 않는다(dmath.ts 만 예외). iOS JavaScriptCore 와 V8 은 libm 이 달라 초월함수가 마지막 비트에서
 *    어긋나고, 그 한 비트가 쿠션 3개를 지나며 수 mm 차이로 커진다. `+ − × ÷ Math.sqrt Math.floor
 *    Math.abs Math.min/max` 는 IEEE-754 가 정확히 규정하므로 허용.
 *  - 함수는 입력을 변형하지 않고 새 값을 돌려준다(pooltool 규율). 상태는 명시적으로 복사한다.
 *  - 이벤트 기반 해석 적분: 이벤트 사이는 닫힌 식으로 정확히 전진하고, 이벤트 시각은 다항식 근으로 구한다.
 *    시간 스텝(dt)이라는 개념은 렌더링용 continuize 에만 존재한다.
 *
 * 출처: 모델·알고리즘은 논문(Coriolis, Leckie & Greenspan 2005/2006, Han 2005, Mathavan 2009/2010,
 * Alciatore TP A.4/A.5/A.14/A.30/A.31)과 pooltool(Apache-2.0, NOTICE.md) 을 따른다.
 * GPL 인 tailuge/billiards 코드는 어떤 형태로도 옮겨오지 않는다.
 */

/** 3차원 벡터. 항상 길이 3 의 새 배열을 만들어 돌려주고, 인자 배열은 변형하지 않는다. */
export type Vec3 = readonly [number, number, number];

/** 공의 운동 상태. `airborne` 는 v2.1(점프·마세이 z축)용으로 예약만 해 둔다. */
export type MotionState = "stationary" | "spinning" | "rolling" | "sliding" | "airborne";

export interface BallState {
    readonly id: string;
    /** 위치 (m). z 는 v2.0 에서 항상 R(공 중심 높이)이다. */
    readonly r: Vec3;
    /** 속도 (m/s). */
    readonly v: Vec3;
    /** 각속도 (rad/s). x·y 성분은 구름/미끄럼, z 성분은 사이드스핀(잉글리시). */
    readonly w: Vec3;
    readonly state: MotionState;
}

/** 쿠션 4면. 좌표계 기준: left x=0, right x=width, bottom y=0, top y=length. */
export type CushionId = "left" | "right" | "bottom" | "top";

/** 선형 쿠션 세그먼트(코 라인). 캐롬 테이블은 포켓·둥근 코너가 없어 4개면 충분하다. */
export interface CushionSegment {
    readonly id: CushionId;
    /** 세그먼트 양 끝점 (x, y). 코 라인(공이 닿는 선)이며 두께가 아니다. */
    readonly p1: readonly [number, number];
    readonly p2: readonly [number, number];
    /** 테이블 안쪽을 향하는 단위 법선 (x, y). */
    readonly normal: readonly [number, number];
}

export type SimEvent =
    | {
        readonly type: "ball-ball";
        readonly t: number;
        /** 사전순 정렬된 두 공 id. 규칙 판정은 여기서 "누가 누구를 먼저 맞혔나"를 읽는다. */
        readonly ids: readonly [string, string];
    }
    | {
        readonly type: "ball-cushion";
        readonly t: number;
        readonly ids: readonly [string];
        readonly cushion: CushionId;
    }
    | {
        readonly type: "transition";
        readonly t: number;
        readonly ids: readonly [string];
        readonly from: MotionState;
        readonly to: MotionState;
    };

/** 큐 타격 입력. 네트워크로 보내는 것은 이것뿐이며, 결과 위치는 절대 보내지 않는다. */
export interface ShotInput {
    readonly cueBallId: string;
    /** 큐가 향하는 방향(테이블 평면, rad). +x 축이 0, 반시계 양수. */
    readonly phi: number;
    /** 큐 속도 (m/s). 큐볼 속도가 아니다 — 타격 모델이 변환한다. */
    readonly V0: number;
    /**
     * 팁 가로 오프셋, R 의 비율. **큐 축에 수직한 평면**(선수가 큐를 따라 내려다본 공 면)에서 잰다 — TP A.19.
     * 양수 = 큐 진행 방향 기준 오른쪽(오른쪽 사이드스핀). |a| ≤ cue.maxOffset
     */
    readonly a: number;
    /**
     * 팁 세로 오프셋, R 의 비율. 같은 평면에서 큐 축 기준 위가 양수(밀어치기). 큐를 들어도(theta > 0) 이 값이
     * 그대로 밀어치기·끌어치기 스핀을 정한다(테이블 수직 오프셋이 아니다). |b| ≤ cue.maxOffset, a²+b² ≤ maxOffset²
     */
    readonly b: number;
    /** 큐 들림각 (rad, 0 = 수평, [0, π/2)). v2.0 은 이 값으로 스핀 축만 기울인다(마세이 커브는 미끄럼 상태에서 자연히 나온다). */
    readonly theta: number;
}

/** 한 시각의 전체 스냅샷. history 는 이벤트가 해결된 직후 상태를 담는다. */
export interface Snapshot {
    readonly t: number;
    readonly balls: readonly BallState[];
}

export interface SimResult {
    readonly engineVersion: string;
    readonly paramsHash: string;
    readonly input: ShotInput;
    readonly events: readonly SimEvent[];
    /** history[0] 은 타격 직후(t=0), 마지막은 모든 공이 정지한 시각. */
    readonly history: readonly Snapshot[];
    readonly final: readonly BallState[];
    /** 총 소요 시간 (s). */
    readonly duration: number;
    /** 이벤트 목록 + 최종 상태의 비트 단위 해시. 두 기기의 값이 다르면 결정론이 깨진 것이다. */
    readonly hash: string;
    /** 이벤트 상한(2000)에 걸려 강제 종료됐으면 true. 규칙 판정은 이 샷을 무효로 본다. */
    readonly truncated: boolean;
}

/** 이벤트 감지기가 돌려주는 후보. t 는 절대 시각이 아니라 현재 시각으로부터의 지연이다. */
export interface EventCandidate {
    readonly dt: number;
    readonly event: SimEvent;
}
