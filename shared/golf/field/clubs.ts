/**
 * 클럽 표 — 트랙맨 PGA 투어 평균(볼스피드·발사각·스핀·캐리)을 SI 로. 드라이버는 '프로 프리셋' 76.5 m/s 로 250 m(오너 확정).
 * 출처(2026-09-15 확인): PGA/LPGA 투어 평균 캐리·볼스피드 표(neogolfclub.com/technology/tour-averages, 트랙맨 자료 전재),
 * 트랙맨 '평균 남성 아마' 드라이버(blog.trackmangolf.jp: 93.4 mph·132.6 mph·12.6°·3275 rpm·204 yd). LPGA 발사각·스핀과
 * 아마 프리셋의 아이언 배율은 공개 표의 통상값(추정, 표에 표시).
 * 창·페이스·패스·기어 상수는 제안서 §2 표. v0.2 수직 타점: 페이스 기하(스위트스팟→윗변/리딩엣지 cm)와 수직 기어효과
 * (드라이버 1 cm 위 ≈ 스핀 −600 rpm·발사각 +1°, 페어웨이우드 −350/+0.7, 아이언 −150/+0.4 — 트랙맨·핑 공개 피팅 자료의 통상 범위).
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
    /** 트랙맨 PGA 투어 평균 캐리(m) — 테스트가 모델 출력과 대조한다 */
    readonly carryPgaM: number;
}

const MPH = 0.44704, YD = 0.9144;
const wood = { kPath: 0.15, gearLaunchDegPerCm: 0.8, gearSpeedK: 0.012, pathErrMaxDeg: 3.0, iron: false };
const iron = { kPath: 0.20, kGearDegPerCm: 1.0, gearLaunchDegPerCm: 0.4, gearSpeedK: 0.018, pathErrMaxDeg: 2.5, kVertLaunchPerCm: 0.4, kVertSpeed: 0.008, iron: true };

export const CLUBS: Readonly<Record<ClubId, Club>> = {
    D: { id: "D", ballSpeed: 76.5, launchDeg: 10.9, spinRpm: 2686, spinLoftDeg: 12, ...wood, kGearDegPerCm: 4.5, gearLaunchDegPerCm: 1.0, faceMaxDeg: 5.0, faceUpCm: 2.8, faceDownCm: 2.8, kVertRpmPerCm: 600, kVertLaunchPerCm: 1.0, kVertSpeed: 0.006, zoneCoef: 0.70, sweepMs: 750, carryPgaM: 275 * YD },
    "3W": { id: "3W", ballSpeed: 158 * MPH, launchDeg: 9.2, spinRpm: 3655, spinLoftDeg: 15, ...wood, kGearDegPerCm: 3.0, faceMaxDeg: 4.5, faceUpCm: 1.9, faceDownCm: 1.9, kVertRpmPerCm: 350, kVertLaunchPerCm: 0.7, kVertSpeed: 0.007, zoneCoef: 0.76, sweepMs: 780, carryPgaM: 243 * YD },
    "5W": { id: "5W", ballSpeed: 152 * MPH, launchDeg: 9.4, spinRpm: 4350, spinLoftDeg: 17, ...wood, kGearDegPerCm: 2.5, gearLaunchDegPerCm: 0.7, faceMaxDeg: 4.2, faceUpCm: 1.8, faceDownCm: 1.8, kVertRpmPerCm: 300, kVertLaunchPerCm: 0.6, kVertSpeed: 0.007, zoneCoef: 0.80, sweepMs: 800, carryPgaM: 230 * YD },
    HY: { id: "HY", ballSpeed: 146 * MPH, launchDeg: 10.2, spinRpm: 4437, spinLoftDeg: 19, ...wood, kPath: 0.18, kGearDegPerCm: 1.8, gearLaunchDegPerCm: 0.6, gearSpeedK: 0.015, pathErrMaxDeg: 2.8, faceMaxDeg: 4.0, faceUpCm: 1.9, faceDownCm: 1.8, kVertRpmPerCm: 250, kVertLaunchPerCm: 0.5, kVertSpeed: 0.007, zoneCoef: 0.83, sweepMs: 820, carryPgaM: 225 * YD },
    "3I": { id: "3I", ballSpeed: 142 * MPH, launchDeg: 10.4, spinRpm: 4630, spinLoftDeg: 20, ...iron, faceMaxDeg: 3.8, faceUpCm: 2.1, faceDownCm: 1.9, kVertRpmPerCm: 160, zoneCoef: 0.80, sweepMs: 830, carryPgaM: 212 * YD },
    "4I": { id: "4I", ballSpeed: 137 * MPH, launchDeg: 11.0, spinRpm: 4836, spinLoftDeg: 21, ...iron, faceMaxDeg: 3.7, faceUpCm: 2.1, faceDownCm: 1.9, kVertRpmPerCm: 160, zoneCoef: 0.83, sweepMs: 840, carryPgaM: 203 * YD },
    "5I": { id: "5I", ballSpeed: 59.0, launchDeg: 12.1, spinRpm: 5361, spinLoftDeg: 22, ...iron, faceMaxDeg: 3.5, faceUpCm: 2.2, faceDownCm: 1.9, kVertRpmPerCm: 150, zoneCoef: 0.86, sweepMs: 850, carryPgaM: 194 * YD },
    "6I": { id: "6I", ballSpeed: 127 * MPH, launchDeg: 14.1, spinRpm: 6231, spinLoftDeg: 24, ...iron, faceMaxDeg: 3.5, faceUpCm: 2.2, faceDownCm: 1.85, kVertRpmPerCm: 150, zoneCoef: 0.93, sweepMs: 850, carryPgaM: 183 * YD },
    "7I": { id: "7I", ballSpeed: 53.6, launchDeg: 16.3, spinRpm: 7097, spinLoftDeg: 26, ...iron, faceMaxDeg: 3.5, faceUpCm: 2.2, faceDownCm: 1.8, kVertRpmPerCm: 150, zoneCoef: 1.00, sweepMs: 850, carryPgaM: 172 * YD },
    "8I": { id: "8I", ballSpeed: 115 * MPH, launchDeg: 18.1, spinRpm: 7998, spinLoftDeg: 28, ...iron, faceMaxDeg: 3.2, faceUpCm: 2.25, faceDownCm: 1.75, kVertRpmPerCm: 140, zoneCoef: 1.05, sweepMs: 880, carryPgaM: 160 * YD },
    "9I": { id: "9I", ballSpeed: 48.7, launchDeg: 20.4, spinRpm: 8647, spinLoftDeg: 30, ...iron, faceMaxDeg: 3.0, faceUpCm: 2.3, faceDownCm: 1.7, kVertRpmPerCm: 130, zoneCoef: 1.10, sweepMs: 900, carryPgaM: 148 * YD },
    PW: { id: "PW", ballSpeed: 45.6, launchDeg: 24.2, spinRpm: 9304, spinLoftDeg: 33, ...iron, kPath: 0.25, faceMaxDeg: 3.0, faceUpCm: 2.4, faceDownCm: 1.6, kVertRpmPerCm: 120, zoneCoef: 1.16, sweepMs: 900, carryPgaM: 136 * YD },
    // SW 는 트랙맨 표에 없다 — 56° 풀샷 통상값(추정)
    SW: { id: "SW", ballSpeed: 40.0, launchDeg: 29.0, spinRpm: 10500, spinLoftDeg: 38, ...iron, kPath: 0.25, pathErrMaxDeg: 2.0, faceMaxDeg: 2.5, faceUpCm: 2.6, faceDownCm: 1.5, kVertRpmPerCm: 100, zoneCoef: 1.20, sweepMs: 950, carryPgaM: 97 },
    PT: { id: "PT", ballSpeed: 6.0, launchDeg: 0, spinRpm: 0, spinLoftDeg: 4, kPath: 0, kGearDegPerCm: 0, gearLaunchDegPerCm: 0, gearSpeedK: 0, faceMaxDeg: 1.2, pathErrMaxDeg: 0, faceUpCm: 1.5, faceDownCm: 1.5, kVertRpmPerCm: 0, kVertLaunchPerCm: 0, kVertSpeed: 0, zoneCoef: 1.50, sweepMs: 1100, iron: false, carryPgaM: 0 },
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

/** 프리셋 = 발사 조건 표(있으면) 또는 프로 표에 대한 배율 */
export interface PresetLaunch { readonly ballSpeed: number; readonly launchDeg: number; readonly spinRpm: number; readonly carryM?: number }
export interface PresetDef {
    readonly label: string;
    readonly speed: number;        // 표에 없는 클럽: 볼스피드 배율
    readonly launchAdd: number;    // 표에 없는 클럽: 발사각 +
    readonly spinMul: number;      // 표에 없는 클럽: 스핀 배율
    readonly table?: Partial<Record<ClubId, PresetLaunch>>;
}
export const PRESETS: Readonly<Record<Preset, PresetDef>> = {
    pro: { label: "프로(PGA)", speed: 1, launchAdd: 0, spinMul: 1 },
    // 오너 확정(2026-09-15): 볼스피드만 0.88× ≈ 5 핸디(트랙맨 핸디 5 = 65 m/s)
    amateur: { label: "아마(0.88)", speed: 0.88, launchAdd: 0, spinMul: 1 },
    // 트랙맨 LPGA 투어 평균 — 볼스피드·캐리는 표 그대로, 발사각·스핀은 통상값(추정)
    lpga: {
        label: "여자 프로(LPGA)", speed: 0.82, launchAdd: 1.5, spinMul: 1.0,
        table: {
            D: { ballSpeed: 139 * MPH, launchDeg: 13.2, spinRpm: 2611, carryM: 220 * YD },
            "3W": { ballSpeed: 132 * MPH, launchDeg: 11.2, spinRpm: 3400, carryM: 195 * YD },
            "5W": { ballSpeed: 128 * MPH, launchDeg: 12.1, spinRpm: 4501, carryM: 185 * YD },
            HY: { ballSpeed: 123 * MPH, launchDeg: 12.7, spinRpm: 4693, carryM: 180 * YD },
            "4I": { ballSpeed: 116 * MPH, launchDeg: 14.3, spinRpm: 4801, carryM: 170 * YD },
            "5I": { ballSpeed: 111 * MPH, launchDeg: 14.8, spinRpm: 5081, carryM: 161 * YD },
            "6I": { ballSpeed: 106 * MPH, launchDeg: 17.1, spinRpm: 5943, carryM: 152 * YD },
            "7I": { ballSpeed: 100 * MPH, launchDeg: 19.0, spinRpm: 6699, carryM: 141 * YD },
            "8I": { ballSpeed: 94 * MPH, launchDeg: 20.8, spinRpm: 7494, carryM: 130 * YD },
            "9I": { ballSpeed: 88 * MPH, launchDeg: 23.9, spinRpm: 7589, carryM: 119 * YD },
            PW: { ballSpeed: 80 * MPH, launchDeg: 25.6, spinRpm: 8403, carryM: 107 * YD },
        },
    },
    // 트랙맨 '평균 남성 아마'(14~15 핸디): 드라이버 132.6 mph·12.6°·3275 rpm·204 yd(실측). 나머지 클럽은 배율(추정)
    ama15: {
        label: "아마 15핸디", speed: 0.78, launchAdd: 1.0, spinMul: 1.05,
        table: { D: { ballSpeed: 132.6 * MPH, launchDeg: 12.6, spinRpm: 3275, carryM: 204 * YD } },
    },
};
/** 하위호환: 볼스피드 배율만 쓰는 곳 */
export const PRESET_SPEED: Readonly<Record<Preset, number>> = { pro: 1, amateur: 0.88, lpga: 0.82, ama15: 0.78 };

/** 프리셋 적용 발사 조건(100 % 파워·정타 기준) */
export function presetLaunch(club: Club, preset: Preset): PresetLaunch {
    const p = PRESETS[preset];
    const row = p.table?.[club.id];
    if (row) return row;
    return { ballSpeed: club.ballSpeed * p.speed, launchDeg: club.launchDeg + (club.id === "PT" ? 0 : p.launchAdd), spinRpm: club.spinRpm * p.spinMul };
}

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

/** 미리보기·클럽 휠용 캐리 근사(무풍·평지). 실제 값은 simulateStroke 가 낸다 */
export function nominalCarryM(id: ClubId, preset: Preset): number {
    const pro: Record<ClubId, number> = { D: 250, "3W": 229, "5W": 214, HY: 208, "3I": 196, "4I": 188, "5I": 179, "6I": 167, "7I": 154, "8I": 143, "9I": 132, PW: 119, SW: 97, PT: 0 };
    const row = PRESETS[preset].table?.[id];
    if (row?.carryM) return Math.round(row.carryM);
    const f = PRESET_SPEED[preset];
    // 캐리 ≈ 볼스피드^1.4 비례(모델 회귀). pow 대신 f^1.4 ≈ f·√f·f^(−0.1) ≈ f·√f·(1 + 0.1·(1−f))
    const f14 = f === 1 ? 1 : f * Math.sqrt(f) * (1 + 0.1 * (1 - f));
    return Math.round(pro[id] * f14);
}
