/**
 * 1차 8클럽 표(세션 조사 §2.1 — TrackMan 투어 평균을 SI 로, 드라이버는 '프로 프리셋' 76.5 m/s 로 250 m).
 * 창·페이스·패스·기어 상수는 제안서 §2 표. 프리셋 아마 0.88× 는 볼스피드에만 곱한다(오너 확정).
 * v0.2 수직 타점: 페이스 기하(스위트스팟→윗변/리딩엣지 cm)와 수직 기어효과(드라이버 1 cm 위 ≈ 스핀 −600 rpm·발사각 +1°,
 * 페어웨이우드 −350/+0.7, 아이언 −150/+0.4 — TrackMan·Ping 공개 피팅 자료의 통상 범위). 아이언은 페이스가 얕아 잔디·리딩엣지가 지배한다.
 */
import type { ClubId, Preset, Surface } from "./types.js";

export interface Club {
    readonly id: ClubId;
    readonly ballSpeed: number;     // m/s (100 % 파워, 프로)
    readonly launchDeg: number;
    readonly spinRpm: number;
    readonly spinLoftDeg: number;   // L = dynLoft − attack 대푯값
    readonly kPath: number;         // 출발 방향 = face + kPath·(path − face)
    readonly kGearDegPerCm: number; // 타점 → 축 기울기
    readonly gearLaunchDegPerCm: number;
    readonly gearSpeedK: number;    // 볼스피드 ×(1 − k·d²)
    readonly faceMaxDeg: number;    // 회전 타이밍 창 끝(|t|=1)의 페이스 각
    readonly pathErrMaxDeg: number; // 패드 흘림(padX 100)의 패스 오차
    readonly faceUpCm: number;      // 스위트스팟 → 페이스 윗변(크라운) 거리
    readonly faceDownCm: number;    // 스위트스팟 → 리딩엣지 거리
    readonly kVertRpmPerCm: number; // 수직 기어효과: 타점 1 cm 위 → 스핀 −k
    readonly kVertLaunchPerCm: number; // 타점 1 cm 위 → 발사각 +
    readonly kVertSpeed: number;    // 볼스피드 ×(1 − k·h²)
    readonly zoneCoef: number;      // 창 폭 계수(×50 ms)
    readonly sweepMs: number;       // 바늘 통과 시간(화면용)
    readonly iron: boolean;         // 생크·아이언 기어 계수
}

export const CLUBS: Readonly<Record<ClubId, Club>> = {
    D: { id: "D", ballSpeed: 76.5, launchDeg: 10.9, spinRpm: 2686, spinLoftDeg: 12, kPath: 0.15, kGearDegPerCm: 4.5, gearLaunchDegPerCm: 1.0, gearSpeedK: 0.012, faceMaxDeg: 5.0, pathErrMaxDeg: 3.0, faceUpCm: 2.8, faceDownCm: 2.8, kVertRpmPerCm: 600, kVertLaunchPerCm: 1.0, kVertSpeed: 0.006, zoneCoef: 0.70, sweepMs: 750, iron: false },
    "3W": { id: "3W", ballSpeed: 70.6, launchDeg: 9.2, spinRpm: 3655, spinLoftDeg: 15, kPath: 0.15, kGearDegPerCm: 3.0, gearLaunchDegPerCm: 0.8, gearSpeedK: 0.012, faceMaxDeg: 4.5, pathErrMaxDeg: 3.0, faceUpCm: 1.9, faceDownCm: 1.9, kVertRpmPerCm: 350, kVertLaunchPerCm: 0.7, kVertSpeed: 0.007, zoneCoef: 0.76, sweepMs: 780, iron: false },
    "5I": { id: "5I", ballSpeed: 59.0, launchDeg: 12.1, spinRpm: 5361, spinLoftDeg: 22, kPath: 0.20, kGearDegPerCm: 1.0, gearLaunchDegPerCm: 0.4, gearSpeedK: 0.018, faceMaxDeg: 3.5, pathErrMaxDeg: 2.5, faceUpCm: 2.2, faceDownCm: 1.9, kVertRpmPerCm: 150, kVertLaunchPerCm: 0.4, kVertSpeed: 0.008, zoneCoef: 0.86, sweepMs: 850, iron: true },
    "7I": { id: "7I", ballSpeed: 53.6, launchDeg: 16.3, spinRpm: 7097, spinLoftDeg: 26, kPath: 0.20, kGearDegPerCm: 1.0, gearLaunchDegPerCm: 0.4, gearSpeedK: 0.018, faceMaxDeg: 3.5, pathErrMaxDeg: 2.5, faceUpCm: 2.2, faceDownCm: 1.8, kVertRpmPerCm: 150, kVertLaunchPerCm: 0.4, kVertSpeed: 0.008, zoneCoef: 1.00, sweepMs: 850, iron: true },
    "9I": { id: "9I", ballSpeed: 48.7, launchDeg: 20.4, spinRpm: 8647, spinLoftDeg: 30, kPath: 0.20, kGearDegPerCm: 1.0, gearLaunchDegPerCm: 0.4, gearSpeedK: 0.018, faceMaxDeg: 3.0, pathErrMaxDeg: 2.5, faceUpCm: 2.3, faceDownCm: 1.7, kVertRpmPerCm: 130, kVertLaunchPerCm: 0.4, kVertSpeed: 0.008, zoneCoef: 1.10, sweepMs: 900, iron: true },
    PW: { id: "PW", ballSpeed: 45.6, launchDeg: 24.2, spinRpm: 9304, spinLoftDeg: 33, kPath: 0.25, kGearDegPerCm: 1.0, gearLaunchDegPerCm: 0.4, gearSpeedK: 0.018, faceMaxDeg: 3.0, pathErrMaxDeg: 2.5, faceUpCm: 2.4, faceDownCm: 1.6, kVertRpmPerCm: 120, kVertLaunchPerCm: 0.4, kVertSpeed: 0.008, zoneCoef: 1.16, sweepMs: 900, iron: true },
    SW: { id: "SW", ballSpeed: 40.0, launchDeg: 29.0, spinRpm: 10500, spinLoftDeg: 38, kPath: 0.25, kGearDegPerCm: 1.0, gearLaunchDegPerCm: 0.4, gearSpeedK: 0.018, faceMaxDeg: 2.5, pathErrMaxDeg: 2.0, faceUpCm: 2.6, faceDownCm: 1.5, kVertRpmPerCm: 100, kVertLaunchPerCm: 0.4, kVertSpeed: 0.008, zoneCoef: 1.20, sweepMs: 950, iron: true },
    PT: { id: "PT", ballSpeed: 6.0, launchDeg: 0, spinRpm: 0, spinLoftDeg: 4, kPath: 0, kGearDegPerCm: 0, gearLaunchDegPerCm: 0, gearSpeedK: 0, faceMaxDeg: 1.2, pathErrMaxDeg: 0, faceUpCm: 1.5, faceDownCm: 1.5, kVertRpmPerCm: 0, kVertLaunchPerCm: 0, kVertSpeed: 0, zoneCoef: 1.50, sweepMs: 1100, iron: false },
};

export const ZONE_BASE_MS = 50;
export const PERFECT_BAND = 0.33;
/** tapY 100 = 공 반지름 × 1.5 (공 밖까지: 티·잔디·헛스윙 영역) */
export const TAPY_RANGE_R = 1.5;
export const BALL_R_CM = 2.135;
/** 솔 바운스·공 압축이 봐주는 폭: 이 안의 저점 오차는 벌점 없음 */
export const TURF_FREE_CM = 0.4;
/** 익스플로전 이상적 진입: 스위트스팟이 공 중심 0.7R(1.5 cm) 아래 모래를 지난다 */
export const EXPLOSION_IDEAL_TAPY = -47;
export const PRESET_SPEED: Readonly<Record<Preset, number>> = { pro: 1.0, amateur: 0.88 };

/** 라이 계수(조사 §5 라이 표 + 제안서 §4). dirDeg 는 깊은 러프의 결정론 편차 폭 */
export interface LieCoef { readonly speed: number; readonly launchAdd: number; readonly spin: number; readonly zone: number; readonly dirDeg: number }
export const LIE: Readonly<Record<Surface, LieCoef>> = {
    tee: { speed: 1.0, launchAdd: 0, spin: 1.0, zone: 1.0, dirDeg: 0 },
    fairway: { speed: 1.0, launchAdd: 0, spin: 1.0, zone: 1.0, dirDeg: 0 },
    fringe: { speed: 0.98, launchAdd: 0.5, spin: 0.90, zone: 0.95, dirDeg: 0 },
    green: { speed: 1.0, launchAdd: 0, spin: 1.0, zone: 1.0, dirDeg: 0 },
    rough: { speed: 0.92, launchAdd: 1.2, spin: 0.60, zone: 0.80, dirDeg: 0 },
    deeprough: { speed: 0.78, launchAdd: 2.0, spin: 0.40, zone: 0.65, dirDeg: 3 },
    bunker: { speed: 0.88, launchAdd: 0, spin: 0.75, zone: 0.60, dirDeg: 0 },
    water: { speed: 1.0, launchAdd: 0, spin: 1.0, zone: 1.0, dirDeg: 0 },
    ob: { speed: 1.0, launchAdd: 0, spin: 1.0, zone: 1.0, dirDeg: 0 },
};

/** 미리보기·클럽 휠용 캐리 근사(무풍·평지·프로). 실제 값은 simulateStroke 가 낸다 */
export function nominalCarryM(id: ClubId, preset: Preset): number {
    const pro: Record<ClubId, number> = { D: 250, "3W": 229, "5I": 179, "7I": 154, "9I": 132, PW: 119, SW: 97, PT: 0 };
    const f = PRESET_SPEED[preset];
    // 캐리 ≈ 볼스피드^1.4 비례(모델 회귀) → 0.88^1.4 ≈ 0.836
    return Math.round(pro[id] * (f === 1 ? 1 : 0.836));
}
