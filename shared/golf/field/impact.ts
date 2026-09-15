/**
 * 임팩트 모델 — 정수 입력(StrokeInput) + 라이 → 발사 조건(속도 벡터·스핀 벡터) + 진단.
 * 제안서 §2·§4, 조사 §2·§4·§5. 확률 없음: 같은 입력이면 같은 발사. 초월함수는 여기서만(dmath).
 */
import { atan, cos, sin } from "../../sim/dmath.js";
import { CLUBS, LIE, PERFECT_BAND, PRESET_SPEED, ZONE_BASE_MS } from "./clubs.js";
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

/** 창 폭(ms) — 클럽·라이·파워·셰이핑. 화면도 같은 값을 써서 바늘을 그린다 */
export function zoneMsFor(club: ClubId, surface: Surface, powerPct: number, spinX: number, spinY: number): number {
    const P = clamp(powerPct / 100, 0.2, 1.15);
    const powerCoef = P > 1 ? Math.max(0.5, 1 - 2.67 * (P - 1)) : P <= 0.6 ? 1.15 : 1;
    const shapeCoef = (1 - 0.15 * Math.abs(spinX / 100)) * (1 - 0.15 * Math.abs(spinY / 100));
    return Math.max(15, ZONE_BASE_MS * CLUBS[club].zoneCoef * LIE[surface].zone * powerCoef * shapeCoef);
}

export function validateInput(i: StrokeInput): void {
    const int = (v: number) => Number.isInteger(v);
    if (!CLUBS[i.club]) throw new RangeError("club");
    if (!int(i.aimDeg10) || Math.abs(i.aimDeg10) > 1800) throw new RangeError("aimDeg10");
    if (!int(i.powerPct) || i.powerPct < 20 || i.powerPct > 115) throw new RangeError("powerPct");
    for (const k of ["spinX", "spinY", "padX", "tapX"] as const) if (!int(i[k]) || Math.abs(i[k]) > 100) throw new RangeError(k);
    if (!int(i.impactMs) || Math.abs(i.impactMs) > 400) throw new RangeError("impactMs");
    if (![0, 1, 2, 3].includes(i.mode)) throw new RangeError("mode");
}

function shapeName(launchH: number, tilt: number): ImpactDiag["shape"] {
    const big = Math.abs(tilt) >= 10, small = Math.abs(tilt) >= 2;
    const dir = launchH > 4 ? "push" : launchH < -4 ? "pull" : "";
    if (big && tilt > 0) return dir === "pull" ? "pullhook" : "hook";
    if (big && tilt < 0) return dir === "push" ? "pushslice" : "slice";
    if (dir === "pull") return "pull";
    if (dir === "push") return "push";
    if (small) return tilt > 0 ? "draw" : "fade";
    return "straight";
}

export function launchFrom(input: StrokeInput, ctx: LaunchCtx): LaunchState {
    validateInput(input);
    const club = CLUBS[input.club];
    const lie = LIE[ctx.lie.surface];
    const presetF = PRESET_SPEED[ctx.preset];
    const P = clamp(input.powerPct / 100, 0.2, 1.15);
    const sx = input.spinX / 100, sy = input.spinY / 100;
    const isPutt = input.mode === 3 || input.club === "PT";
    const isExplosion = input.mode === 2 || (ctx.lie.surface === "bunker" && (input.club === "SW" || input.club === "PW") && input.mode !== 1);
    const isChip = input.mode === 1;

    // ── 타이밍 창 ──
    const zoneMs = isPutt ? zoneMsFor("PT", ctx.lie.surface, input.powerPct, 0, 0) : zoneMsFor(input.club, ctx.lie.surface, input.powerPct, input.spinX, input.spinY);
    const t = input.impactMs / zoneMs;
    const at = Math.abs(t);
    const sign = t < 0 ? -1 : 1;
    let tp: number, s: number;
    if (at <= 1) { tp = sign * Math.max(0, at - PERFECT_BAND) / (1 - PERFECT_BAND); s = 0; }
    else { tp = sign; s = clamp((at - 1) / 1.2, 0, 1); }
    let contact: Contact = "pure";
    if (!isPutt) {
        if (t < -1) contact = "fat";
        else if (t > 1) contact = club.iron && t >= 2.2 ? "shank" : t >= 1.6 ? "top" : "thin";
    }
    const padXn = deadzone(input.padX / 100, 0.15);
    const tapXn = deadzone(input.tapX / 100, 0.10);

    // ── 퍼트: 속도만, 페이스 오차 작게, 바로 구름 ──
    if (isPutt) {
        const speed = 6.0 * P;
        const launchH = tp * CLUBS.PT.faceMaxDeg;
        const phi = (ctx.aimDeg + launchH) * DEG;
        const v = { x: sin(phi) * speed, y: cos(phi) * speed, z: 0 };
        const diag: ImpactDiag = { club: "PT", zoneMs, tNorm: t, severity: 0, contact: "pure", faceDeg: launchH, pathDeg: 0, launchHDeg: launchH, launchVDeg: 0, tiltDeg: 0, ballSpeed: speed, spinRpm: 0, toeHeelCm: 0, shape: "straight" };
        return { v, w: { x: 0, y: 0, z: 0 }, diag, startPhase: "roll" };
    }

    // ── 페이스·패스·타점 ──
    const pathInt = -sx * club.pathMaxDeg;
    // 패드를 왼쪽으로 흘리면(padX<0) 아웃투인(패스 −) = 오버더톱. 제안서 표기와 부호를 맞춘 정본은 여기다
    const pathH = pathInt + padXn * club.pathErrMaxDeg;
    const faceH = 0.4 * pathInt + tp * club.faceMaxDeg;
    const dx = -tp * 0.5 + tapXn * 1.0;   // cm, + 토

    // ── 발사 조건(스핀 로프트 식) ──
    let L = club.spinLoftDeg + 2 * sy;
    let launchV = club.launchDeg + 3.7 * sy;
    let spin = club.spinRpm * (sin(L * DEG) / sin(club.spinLoftDeg * DEG));
    const powerSpeed = P <= 1 ? P : 1 + 0.27 * (P - 1);
    let speed = club.ballSpeed * presetF * powerSpeed * lie.speed * (1 - club.gearSpeedK * dx * dx);
    launchV += lie.launchAdd + ctx.lie.slopeAlongDeg;
    speed *= 1 - 0.01 * Math.max(0, ctx.lie.slopeAlongDeg);
    spin *= lie.spin;

    if (isExplosion) {
        speed = (12 + 10 * P) * (1 - 0.3 * s);
        launchV = 45;
        spin = 3000 + 2000 * P;
        L = 50;
    } else if (isChip) {
        speed = club.ballSpeed * presetF * P * 0.85 * lie.speed;
        launchV = 8 + lie.launchAdd;
        spin *= 0.5;
    }

    // ── 미스샷 ──
    let launchH = faceH + club.kPath * (pathH - faceH) + club.gearLaunchDegPerCm * dx;
    if (contact === "fat") {
        speed *= 1 - 0.40 * s; launchV += 5 * s; spin *= 1 - 0.5 * s; launchH -= 1 * s;
    } else if (contact === "thin") {
        speed *= 1 - 0.15 * s; launchV = Math.max(3, launchV - 20 * s); spin *= Math.max(0.35, 1 - 1.5 * s);
    } else if (contact === "top") {
        const k = clamp((s - 0.5) / 0.5, 0, 1);
        speed *= 0.6 - 0.15 * k; launchV = 3 - 2 * k; spin *= 0.15;
    } else if (contact === "shank") {
        speed *= 0.6; launchH += 30; spin *= 0.5;
    }
    // 깊은 러프: 결정론 방향 편차
    if (lie.dirDeg > 0) launchH += (((ctx.lie.seed >>> 0) % 2001) / 1000 - 1) * lie.dirDeg;

    // ── 스핀축(D-plane) + 기어효과 + 옆경사 ──
    const delta = faceH - pathH;
    let tilt = contact === "shank" ? 0 : -atan((sin(delta * DEG) * cos(L * DEG)) / Math.max(1e-6, sin(L * DEG))) / DEG;
    if (contact !== "shank") tilt += club.kGearDegPerCm * dx + 2 * ctx.lie.slopeSideDeg;
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
        tiltDeg: tilt, ballSpeed: speed, spinRpm: spin, toeHeelCm: dx, shape: shapeName(launchH - 0, tilt),
    };
    return { v, w, diag, startPhase: launchV < 0.8 || speed < 2 ? "roll" : "air" };
}
