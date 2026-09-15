/** 필드 골프 엔진 자료형(계약서 README.md). 네트워크로 가는 것은 StrokeInput 뿐. */

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
export interface Vec2 { readonly x: number; readonly y: number }

export type ClubId = "D" | "3W" | "5I" | "7I" | "9I" | "PW" | "SW" | "PT";
export const CLUB_IDS: readonly ClubId[] = ["D", "3W", "5I", "7I", "9I", "PW", "SW", "PT"];

export type Surface = "tee" | "fairway" | "fringe" | "green" | "rough" | "deeprough" | "bunker" | "water" | "ob";
export type Preset = "pro" | "amateur";
export type StrokeMode = 0 | 1 | 2 | 3;   // 0 풀 · 1 칩 · 2 익스플로전 · 3 퍼트

export interface StrokeInput {
    readonly club: ClubId;
    readonly aimDeg10: number;   // 0.1° 정수, + 오른쪽
    readonly powerPct: number;   // 20..115
    readonly spinX: number;      // −100 드로우 … +100 페이드
    readonly spinY: number;      // −100 펀치 … +100 하이
    readonly impactMs: number;   // 탭 시각 오차(ms)
    readonly padX: number;       // 패드 놓음 가로 흘림(−100..100), − = 아웃투인
    readonly tapX: number;       // 탭 가로 위치(−100..100), + = 토
    readonly mode: StrokeMode;
}

export type Phase = "air" | "roll" | "rest" | "holed" | "water" | "ob";

export interface BallState3 {
    readonly p: Vec3;
    readonly v: Vec3;
    /** 각속도 벡터(rad/s). 비행 중엔 방향 고정·크기만 감쇠 */
    readonly w: Vec3;
    readonly phase: Phase;
    readonly t: number;
}

export type EventKind = "launch" | "apex" | "land" | "bounce" | "roll" | "tree" | "water" | "ob" | "lip" | "holed" | "rest";
export interface StrokeEvent { readonly kind: EventKind; readonly t: number; readonly p: Vec3; readonly speed: number }

export type Contact = "pure" | "fat" | "thin" | "top" | "shank";

/** 임팩트 진단 — 샷 카드에 그대로 찍는다 */
export interface ImpactDiag {
    readonly club: ClubId;
    readonly zoneMs: number;
    readonly tNorm: number;        // impactMs / zoneMs
    readonly severity: number;     // 창 밖 심각도 0..1
    readonly contact: Contact;
    readonly faceDeg: number;      // + 열림
    readonly pathDeg: number;      // + 인투아웃
    readonly launchHDeg: number;   // 출발 방위(조준 기준, + 우)
    readonly launchVDeg: number;   // 발사각
    readonly tiltDeg: number;      // 스핀축 기울기(+ 좌로 휨)
    readonly ballSpeed: number;    // m/s
    readonly spinRpm: number;
    readonly toeHeelCm: number;    // + 토
    readonly shape: "straight" | "draw" | "fade" | "hook" | "slice" | "pull" | "push" | "pullhook" | "pushslice";
}

export interface LaunchState {
    readonly v: Vec3;
    readonly w: Vec3;
    readonly diag: ImpactDiag;
    /** 퍼트·탑처럼 공중을 거의 안 뜨면 바로 구름으로 시작 */
    readonly startPhase: "air" | "roll";
}

export interface WindEnv {
    /** 10 m 높이 기준풍 벡터(m/s), 홀 좌표. z 는 0 */
    readonly w10: Vec2;
    /** 돌풍 위상 시드(방·홀·타수 해시). 0 이면 돌풍 없음 */
    readonly gustSeed: number;
}

export interface StrokeResult {
    readonly events: readonly StrokeEvent[];
    readonly final: BallState3;
    /** 120 Hz 위치 샘플(x,y,z 반복) — 렌더용. 해시에는 안 들어간다 */
    readonly frames: Float32Array;
    readonly hash: string;
    readonly diag: ImpactDiag;
    readonly carryM: number;
    readonly totalM: number;
    readonly apexM: number;
    readonly airTime: number;
    readonly truncated: boolean;
}
