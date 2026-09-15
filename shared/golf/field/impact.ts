/**
 * 임팩트 모델 v0.2(A안) — 정수 입력(StrokeInput) + 라이 → 발사 조건(속도 벡터·스핀 벡터) + 진단.
 * 세 축이 세 물리량을 하나씩 맡는다: 스탠스 → 패스, 회전 타이밍 → 페이스, 컨택 높이 → 저점(잔디·리딩엣지·크라운·모래).
 * 확률 없음: 같은 입력이면 같은 발사. 초월함수는 여기서만(dmath).
 *
 * 수직 컨택(tapY)의 근거 — 공개 피팅 자료의 통상 범위(TrackMan·Ping 아이언/드라이버 타점 실험):
 *  · 드라이버 티샷: 스위트스팟보다 1 cm 위에 맞으면 발사각 +1°, 스핀 −600 rpm, 볼스피드 −0.6 %(수직 기어효과). 아래는 반대(낮게·많이 돌며 짧다).
 *    크라운 위(윗변 밖) = 스카이(뜬 공), 리딩엣지가 적도 위 = 탑(땅볼).
 *  · 아이언(잔디): 페이스가 얕아 기어효과는 작고(1 cm 에 ±150 rpm) 대신 리딩엣지·잔디가 지배한다.
 *    조금 낮게 맞으면(리딩엣지 쪽 ~1 cm) 발사각이 내려가고 스핀은 조금 늘다가, 리딩엣지가 공 적도에 가까워지면 급히 죽는다(얇게 → 낮게 날아 런이 길다).
 *    클럽이 낮으면 솔이 잔디를 파고든다: 0.4 cm 까지는 바운스가 봐주고, 그 뒤 잔디가 끼어 볼스피드·스핀이 준다(뒷땅, 1 cm ≈ −10 %, 3 cm ≈ −45 %).
 *  · 벙커 익스플로전: 이상적인 것은 공 1.5 cm 아래 모래(tapY −47). 얕게 들어갈수록 세지고(홈런), 깊으면 모래에 파묻힌다.
 */
import { atan, cos, sin } from "../../sim/dmath.js";
import { BALL_R_CM, CLUBS, EXPLOSION_IDEAL_TAPY, LIE, PERFECT_BAND, PRESET_SPEED, TAPY_RANGE_R, TURF_FREE_CM, ZONE_BASE_MS, type Club } from "./clubs.js";
import { DEG, RPM_TO_RAD } from "./params.js";
import type { ClubId, Contact, ImpactDiag, LaunchState, Preset, StrokeInput, Surface } from "./types.js";

export interface LieInfo {
    readonly surface: Surface;
    /** 조준 방향 오르막 +(°) */
    readonly slopeAlongDeg: number;
    /** 공이 발보다 위면 +(°) — 우타 드로우 */
    readonly slopeSideDeg: number;
    /** 깊은 러프 방향 편차용 결정론 시드 */
    readonly seed: number;
}

export interface LaunchCtx { readonly preset: Preset; readonly lie: LieInfo; readonly aimDeg: number }

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const deadzone = (x: number, dz: number) => (Math.abs(x) <= dz ? 0 : ((Math.abs(x) - dz) / (1 - dz)) * (x < 0 ? -1 : 1));

/** 창 폭(ms) — 클럽·라이·파워·셰이핑(스탠스를 크게 열수록, 볼포지션을 극단으로 둘수록 어렵다). 화면도 같은 값으로 바늘을 그린다 */
export function zoneMsFor(club: ClubId, surface: Surface, powerPct: number, stanceDeg10: number, ballPos: number): number {
    const P = clamp(powerPct / 100, 0.2, 1.15);
    const powerCoef = P > 1 ? Math.max(0.5, 1 - 2.67 * (P - 1)) : P <= 0.6 ? 1.15 : 1;
    const shapeCoef = (1 - 0.15 * Math.min(1, Math.abs(stanceDeg10) / 150)) * (1 - 0.15 * Math.abs(ballPos / 100));
    return Math.max(15, ZONE_BASE_MS * CLUBS[club].zoneCoef * LIE[surface].zone * powerCoef * shapeCoef);
}

export function validateInput(i: StrokeInput): void {
    const int = (v: number) => Number.isInteger(v);
    if (!CLUBS[i.club]) throw new RangeError("club");
    if (!int(i.aimDeg10) || Math.abs(i.aimDeg10) > 1800) throw new RangeError("aimDeg10");
    if (!int(i.stanceDeg10) || Math.abs(i.stanceDeg10) > 150) throw new RangeError("stanceDeg10");
    if (!int(i.powerPct) || i.powerPct < 20 || i.powerPct > 115) throw new RangeError("powerPct");
    for (const k of ["ballPos", "padX", "tapX", "tapY"] as const) if (!int(i[k]) || Math.abs(i[k]) > 100) throw new RangeError(k);
    if (!int(i.impactMs) || Math.abs(i.impactMs) > 400) throw new RangeError("impactMs");
    if (![0, 1, 2, 3].includes(i.mode)) throw new RangeError("mode");
}

function shapeName(launchH: number, tilt: number): ImpactDiag["shape"] {
    // 축 기울기 15°(드라이버 약 30 m 휨) 부터 훅·슬라이스, 3° 부터 드로우·페이드
    const big = Math.abs(tilt) >= 15, small = Math.abs(tilt) >= 3;
    const dir = launchH > 4 ? "push" : launchH < -4 ? "pull" : "";
    if (big && tilt > 0) return dir === "pull" ? "pullhook" : "hook";
    if (big && tilt < 0) return dir === "push" ? "pushslice" : "slice";
    if (dir === "pull") return "pull";
    if (dir === "push") return "push";
    if (small) return tilt > 0 ? "draw" : "fade";
    return "straight";
}

/** 수직 컨택의 효과. launchSet 이 있으면 발사각을 그 값으로 덮어쓴다(탑·스카이·홈런) */
interface VertFx {
    speedMul: number; spinMul: number; spinAdd: number; launchAdd: number; launchSet?: number; launchHAdd: number;
    contact: Contact; strikeHighCm: number;
}
const NO_FX: VertFx = { speedMul: 1, spinMul: 1, spinAdd: 0, launchAdd: 0, launchHAdd: 0, contact: "pure", strikeHighCm: 0 };

function topFx(k: number, sv: number): VertFx {
    // 리딩엣지가 적도 위: 땅볼. k 0..1 = 얼마나 더 위인가
    return { ...NO_FX, speedMul: 0.6 - 0.15 * k, launchSet: 3 - 2 * k, spinMul: 0.15, contact: "top", strikeHighCm: sv };
}

export function verticalContact(club: Club, tapY: number, teedWood: boolean, explosion: boolean, putt: boolean): VertFx {
    const yb = (tapY / 100) * TAPY_RANGE_R;   // 공 반지름 단위, + 위
    const sv = -yb * BALL_R_CM;                // 페이스 위 타점(스위트스팟 기준 cm, + 위) = 클럽이 이상보다 낮은 만큼
    if (putt) return { ...NO_FX, strikeHighCm: sv };

    if (explosion) {
        const ideal = (EXPLOSION_IDEAL_TAPY / 100) * TAPY_RANGE_R;   // −0.705 R
        if (yb > 0.15) return { ...NO_FX, speedMul: 1.8, launchSet: 12, spinMul: 0.3, contact: "thin", strikeHighCm: sv };   // 홈런(공을 직접 침)
        if (yb >= ideal) {
            const f = (yb - ideal) / (0.15 - ideal);                 // 0 이상적 … 1 홈런 직전
            return { ...NO_FX, speedMul: 1 + 0.6 * f, launchAdd: -15 * f, spinMul: 1 + 0.3 * f, contact: f > 0.6 ? "thin" : "pure", strikeHighCm: sv };
        }
        const g = clamp((ideal - yb) / 0.8, 0, 1);                    // 너무 깊이
        return { ...NO_FX, speedMul: 1 - 0.65 * g, launchAdd: 8 * g, spinMul: 1 - 0.5 * g, contact: g > 0.25 ? "fat" : "pure", strikeHighCm: sv };
    }

    if (sv < -club.faceDownCm) return topFx(clamp((-club.faceDownCm - sv) / 1.0, 0, 1), sv);

    if (teedWood) {
        // 티 위 우드: 잔디가 없다. 페이스 어디에 맞았느냐(수직 기어효과)만
        if (sv > club.faceUpCm) return { ...NO_FX, speedMul: 0.55, launchSet: 38, spinMul: 2.5, contact: "sky", strikeHighCm: sv };
        const a = -sv;                                               // 아래로 맞은 양
        const nearLE = clamp((a - (club.faceDownCm - 0.8)) / 0.8, 0, 1);   // 리딩엣지 0.8 cm 안: 얇은 드라이브
        return {
            ...NO_FX,
            spinAdd: -club.kVertRpmPerCm * sv, spinMul: 1 - 0.5 * nearLE,
            launchAdd: club.kVertLaunchPerCm * sv - 6 * nearLE,
            speedMul: (1 - club.kVertSpeed * sv * sv) * (1 - 0.12 * nearLE),
            contact: a > 0.55 * club.faceDownCm ? "thin" : "pure", strikeHighCm: sv,
        };
    }

    if (sv >= 0) {
        // 클럽이 낮다 → 공은 페이스 위쪽에, 솔은 잔디 속에. 바운스가 0.4 cm 까지 봐준다
        const h = Math.min(sv, 1.2);
        const dd = Math.max(0, sv - TURF_FREE_CM);
        const s = clamp(dd / 2.4, 0, 1);                             // 3.2 cm(공 밖) 에서 45 % 손실
        return {
            ...NO_FX,
            speedMul: (1 - club.kVertSpeed * h * h) * (1 - 0.45 * s),
            spinAdd: -club.kVertRpmPerCm * h, spinMul: 1 - 0.5 * s,
            launchAdd: club.kVertLaunchPerCm * h + 5 * s, launchHAdd: -1 * s,
            contact: s > 0.1 ? "fat" : "pure", strikeHighCm: sv,
        };
    }
    // 클럽이 높다 → 페이스 아래쪽(리딩엣지 쪽)에 맞는다
    const a = -sv;
    const aa = Math.max(0, a - TURF_FREE_CM);
    const u = clamp(aa / Math.max(0.5, club.faceDownCm - TURF_FREE_CM), 0, 1);   // 1 = 리딩엣지가 적도
    const le = Math.max(0, u - 0.5) / 0.5;                                        // 리딩엣지 구간
    return {
        ...NO_FX,
        spinMul: u <= 0.5 ? 1 + 0.08 * (u / 0.5) : 1.08 - 0.72 * le,
        launchAdd: -1.2 * aa - 8 * le,
        speedMul: 1 - 0.010 * aa * aa - 0.15 * le,
        contact: u > 0.45 ? "thin" : "pure", strikeHighCm: sv,
    };
}

export function launchFrom(input: StrokeInput, ctx: LaunchCtx): LaunchState {
    validateInput(input);
    const club = CLUBS[input.club];
    const lie = LIE[ctx.lie.surface];
    const presetF = PRESET_SPEED[ctx.preset];
    const P = clamp(input.powerPct / 100, 0.2, 1.15);
    const bp = input.ballPos / 100;
    const stanceDeg = input.stanceDeg10 / 10;
    const isPutt = input.mode === 3 || input.club === "PT";
    const isExplosion = input.mode === 2 || (ctx.lie.surface === "bunker" && (input.club === "SW" || input.club === "PW") && input.mode !== 1);
    const isChip = input.mode === 1;
    const teedWood = ctx.lie.surface === "tee" && !club.iron && !isPutt;

    // ── 회전 타이밍 → 페이스 ──
    const zoneMs = isPutt ? zoneMsFor("PT", ctx.lie.surface, input.powerPct, 0, 0) : zoneMsFor(input.club, ctx.lie.surface, input.powerPct, input.stanceDeg10, input.ballPos);
    const t = input.impactMs / zoneMs;
    const at = Math.abs(t);
    const sign = t < 0 ? -1 : 1;
    // 창 안: 퍼펙트 대역 ±0.33 은 0, 창 끝에서 1. 창 밖: 계속 열리거나 닫힌다(최대 2.5배) — 컨택은 건드리지 않는다
    const tp = at <= 1 ? sign * Math.max(0, at - PERFECT_BAND) / (1 - PERFECT_BAND) : sign * Math.min(2.5, 1 + (at - 1));
    const s = clamp((at - 1) / 1.2, 0, 1);
    const padXn = deadzone(input.padX / 100, 0.15);
    const tapXn = deadzone(input.tapX / 100, 0.10);

    // ── 퍼트: 속도만, 페이스 오차 작게, 바로 구름 ──
    if (isPutt) {
        const speed = 6.0 * P;
        const launchH = tp * CLUBS.PT.faceMaxDeg;
        const phi = (ctx.aimDeg + launchH) * DEG;
        const v = { x: sin(phi) * speed, y: cos(phi) * speed, z: 0 };
        const diag: ImpactDiag = { club: "PT", zoneMs, tNorm: t, severity: 0, contact: "pure", faceDeg: launchH, pathDeg: 0, launchHDeg: launchH, launchVDeg: 0, tiltDeg: 0, ballSpeed: speed, spinRpm: 0, toeHeelCm: 0, strikeHighCm: 0, stanceDeg: 0, shape: "straight" };
        return { v, w: { x: 0, y: 0, z: 0 }, diag, startPhase: "roll" };
    }

    // ── 페이스·패스·타점(가로) ──
    const pathH = stanceDeg + padXn * club.pathErrMaxDeg;   // 스탠스가 곧 패스. 패드 흘림은 의도치 않은 오차
    const faceH = tp * club.faceMaxDeg;                      // 타깃 라인 기준. 퍼펙트 = 스퀘어
    const dx = tapXn * 1.0;                                  // cm, + 토
    const shank = club.iron && tapXn <= -0.85;               // 호젤

    // ── 수직 컨택 ──
    const vf = verticalContact(club, input.tapY, teedWood, isExplosion, false);
    let contact: Contact = shank ? "shank" : vf.contact;

    // ── 발사 조건(스핀 로프트 식) + 페이스가 만드는 다이내믹 로프트(열리면 로프트 ↑·스핀 ↑, 닫히면 반대) ──
    let L = Math.max(4, club.spinLoftDeg + 2 * bp + 0.35 * faceH);
    let launchV = club.launchDeg + 3.7 * bp + 0.25 * faceH;
    let spin = club.spinRpm * (sin(L * DEG) / sin(club.spinLoftDeg * DEG));
    const powerSpeed = P <= 1 ? P : 1 + 0.27 * (P - 1);
    let speed = club.ballSpeed * presetF * powerSpeed * lie.speed * (1 - club.gearSpeedK * dx * dx);
    launchV += lie.launchAdd + ctx.lie.slopeAlongDeg;
    speed *= 1 - 0.01 * Math.max(0, ctx.lie.slopeAlongDeg);
    spin *= lie.spin;

    if (isExplosion) {
        speed = 12 + 10 * P;
        launchV = 45;
        spin = 3000 + 2000 * P;
        L = 50;
    } else if (isChip) {
        speed = club.ballSpeed * presetF * P * 0.85 * lie.speed;
        launchV = 8 + lie.launchAdd;
        spin *= 0.5;
    }

    // ── 수직 컨택 적용 ──
    speed *= vf.speedMul;
    spin = spin * vf.spinMul + vf.spinAdd;
    launchV = vf.launchSet !== undefined ? vf.launchSet : launchV + vf.launchAdd;
    spin = Math.max(200, spin);

    // ── 출발 방향·생크 ──
    let launchH = faceH + club.kPath * (pathH - faceH) + club.gearLaunchDegPerCm * dx + vf.launchHAdd;
    if (shank) { speed *= 0.6; launchH += 30; spin *= 0.5; }
    // 깊은 러프: 결정론 방향 편차
    if (lie.dirDeg > 0) launchH += (((ctx.lie.seed >>> 0) % 2001) / 1000 - 1) * lie.dirDeg;

    // ── 스핀축(D-plane) + 기어효과 + 옆경사 ──
    const delta = faceH - pathH;
    let tilt = shank ? 0 : -atan((sin(delta * DEG) * cos(L * DEG)) / Math.max(1e-6, sin(L * DEG))) / DEG;
    if (!shank) tilt += club.kGearDegPerCm * dx + 2 * ctx.lie.slopeSideDeg;
    tilt = clamp(tilt, -45, 45);

    // ── 벡터 ──
    const phi = (ctx.aimDeg + launchH) * DEG, theta = launchV * DEG;
    const cphi = cos(phi), sphi = sin(phi), cth = cos(theta), sth = sin(theta);
    const v = { x: sphi * cth * speed, y: cphi * cth * speed, z: sth * speed };
    const ct = cos(tilt * DEG), st = sin(tilt * DEG);
    // 오른쪽 = (cosφ, −sinφ); 축 = 오른쪽·cosτ + ẑ·sinτ
    const omega = spin * RPM_TO_RAD;
    const w = { x: cphi * ct * omega, y: -sphi * ct * omega, z: st * omega };
    const diag: ImpactDiag = {
        club: club.id, zoneMs, tNorm: t, severity: s, contact, faceDeg: faceH, pathDeg: pathH, launchHDeg: launchH, launchVDeg: launchV,
        tiltDeg: tilt, ballSpeed: speed, spinRpm: spin, toeHeelCm: dx, strikeHighCm: vf.strikeHighCm, stanceDeg, shape: shapeName(launchH, tilt),
    };
    return { v, w, diag, startPhase: launchV < 0.8 || speed < 2 ? "roll" : "air" };
}
