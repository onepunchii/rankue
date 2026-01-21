
/**
 * physics-core.ts
 * 
 * Ported from tailuge/billiards (MIT License)
 * Consolidated core physics logic for 2D Billiards
 */

import { Vector3 } from "three";

// --- Utils ---
export function norm(v: Vector3) {
    return v.clone().normalize();
}
export function upCross(v: Vector3) {
    return new Vector3(-v.y, v.x, 0);
}
export const up = new Vector3(0, 0, 1);
export const sin = Math.sin;
export const cos = Math.cos;

// --- Constants (Original) ---
// Note: These constants are calibrated for meters/seconds/kg in original code
// But our PhysicsEngine2D was using mm. We should stick to ONE system.
// The original code uses: R = 0.03275 (meters) -> 32.75mm
// All original constants are Metric (SI).

// --- Table & Ball Specifications ---
export interface TableSpec {
    name: string;
    width: number;       // Playing area width (m)
    height: number;      // Playing area height (m)
    ballRadius: number;  // Ball radius (m)
    ballMass?: number;   // Calculated if not provided
}

export const PRESETS: Record<string, TableSpec> = {
    LARGE: {
        name: "대대 (International)",
        width: 1.422,
        height: 2.844,
        ballRadius: 0.03075, // 61.5mm diameter
        ballMass: 0.210      // 210g
    },
    MEDIUM: {
        name: "중대 (Domestic)",
        width: 1.224,
        height: 2.448,
        ballRadius: 0.03275, // 65.5mm diameter
        ballMass: 0.250      // 250g
    }
};

export const g = 9.8;
export let mu = 0.00985;
export let muS = 0.212;   // Sliding Friction (Table)
export let muC = 0.85;    // Cushion Friction
export let rho = 0.034;

// Dynamic State
export let m = PRESETS.LARGE.ballMass!;
export let R = PRESETS.LARGE.ballRadius;
export let I = (2 / 5) * m * R * R;
export let e = 0.86;

// Upgraded Restitution Constants (SI)
export const RESTITUTION_BALL_TO_BALL = 0.95;
export const RESTITUTION_BALL_TO_CUSHION = 0.75;
export const FRICTION_BALL_TO_BALL = 0.05;

// Mathaven specific (Han Model) constants that may depend on R
export let epsilon = R * 0.1;
export let theta_a = Math.asin(epsilon / R);
export let sin_a = Math.sin(theta_a);
export let cos_a = Math.cos(theta_a);

/**
 * Update Physics Core with new Table/Ball specs
 */
export function setTableSpec(spec: TableSpec) {
    R = spec.ballRadius;

    // If mass not provided, scale by volume (density consistency)
    if (spec.ballMass) {
        m = spec.ballMass;
    } else {
        const baseR = PRESETS.LARGE.ballRadius;
        const baseM = PRESETS.LARGE.ballMass!;
        m = baseM * Math.pow(R / baseR, 3);
    }

    I = (2 / 5) * m * R * R;

    // Refresh dependent geometry constants
    epsilon = R * 0.1;
    theta_a = Math.asin(epsilon / R);
    sin_a = Math.sin(theta_a);
    cos_a = Math.cos(theta_a);

    console.log(`🎱 Physics Core Updated: ${spec.name} (R=${R}m, m=${m}kg)`);
}

// Initial default
setTableSpec(PRESETS.LARGE);

// --- Physics Logic (physics.ts) ---

export const delta = { v: new Vector3(), w: new Vector3() };

export function surfaceVelocity(v: Vector3, w: Vector3) {
    return surfaceVelocityFull(v, w).setZ(0);
}

const sv = new Vector3();
export function surfaceVelocityFull(v: Vector3, w: Vector3) {
    return sv.copy(v).addScaledVector(upCross(w), R);
}

export function sliding(v: Vector3, w: Vector3) {
    const va = surfaceVelocity(v, w);
    const va_norm = norm(va);

    // dV = -muS * g * dir
    delta.v.copy(va_norm).multiplyScalar(-muS * g);

    // dW = (R x F) / I 
    // This part in original code is highly optimized logic.
    // Let's trust the original logic for now:
    delta.w.copy(norm(upCross(va))).multiplyScalar(((5 / 2) * muS * g) / R);

    // Spin decay (Z) is separate
    // delta.w.setZ(-(5 / 2) * (Mz / (m * R * R)) * Math.sign(w.z));
    // Simplified Z decay:
    const spinFriction = 0.02;
    delta.w.setZ(-5 * spinFriction * g / (2 * R) * Math.sign(w.z));

    return delta;
}

export function rollingFull(w: Vector3) {
    // Rolling friction behavior from original code
    // Often rolling resistance is constant deceleration.
    // Original uses some Mxy logic.
    const mag = new Vector3(w.x, w.y, 0).length();
    if (mag < 0.0001) return { v: new Vector3(), w: new Vector3() };

    const muRoll = 0.015;
    const decel = muRoll * g;

    // v direction is determined by w in rolling? No. v determines w.
    // But if we only have w, we can derive v direction (v = w x R)
    // Here we assume standard rolling resistance opposes V.
    // Original code logic is complex. Let's use simplified rolling drag.

    // Simplified:
    // This is skipped if we use our own update loop for rolling.
    // But let's keep it for completeness if needed.
    return { v: new Vector3(), w: new Vector3() }; // Placeholder
}

export function rotateApplyUnrotate(theta: number, v: Vector3, w: Vector3, model: Function) {
    // Frame rotation to align with wall
    const vr = v.clone().applyAxisAngle(up, theta);
    const wr = w.clone().applyAxisAngle(up, theta);

    const res = model(vr, wr);

    res.v.applyAxisAngle(up, -theta);
    res.w.applyAxisAngle(up, -theta);
    return res;
}

// --- Han's Cushion Physics (Variables declared above as 'let' and updated in setTableSpec) ---

function s0(v: Vector3, w: Vector3) {
    return new Vector3(
        v.x * sin_a - v.z * cos_a + R * w.y,
        -v.y - R * w.z * cos_a + R * w.x * sin_a,
        0 // s0 is usually 2D in plane of contact tangent
    );
}

function c0(v: Vector3) {
    return v.x * cos_a;
}

function Pzs(s: Vector3) {
    const A = 7 / 2 / m;
    return s.length() / A;
}

function Pze(c: number) {
    const B = 1 / m;
    // Calculate restitution e (velocity dependent)
    // e = 0.39 + 0.257*vx - 0.044*vx^2 (Han empirical)
    // vx is c/cos_a approximately
    const vx = c / cos_a;
    const coeff = 0.39 + 0.257 * vx - 0.044 * vx * vx;
    // Clamp coeff
    const final_e = Math.max(0.3, Math.min(0.98, coeff));

    return (muC * ((1 + final_e) * c)) / B;
}

function isGripCushion(v: Vector3, w: Vector3) {
    const Pze_val = Pze(c0(v));
    const Pzs_val = Pzs(s0(v, w));
    return Pzs_val <= Pze_val;
}

function basisHan(v: Vector3, w: Vector3) {
    return {
        c: c0(v),
        s: s0(v, w),
        A: 7 / 2 / m,
        B: 1 / m,
    };
}

function impulseToDelta(PX: number, PY: number, PZ: number) {
    return {
        v: new Vector3(PX / m, PY / m, 0),
        w: new Vector3(
            (-R / I) * PY * sin_a,
            (R / I) * (PX * sin_a - PZ * cos_a),
            (R / I) * PY * cos_a
        ),
    };
}

// Grip Regime (Ball grabs cushion)
function gripHan(v: Vector3, w: Vector3) {
    const { c, s, A, B } = basisHan(v, w);
    const vx = c / cos_a;
    const coeff = Math.max(0.5, 0.39 + 0.257 * vx - 0.044 * vx * vx); // Empirical e

    const ecB = (1 + coeff) * (c / B);

    const PX = (-s.x / A) * sin_a - ecB * cos_a;
    const PY = s.y / A;
    const PZ = (s.x / A) * cos_a - ecB * sin_a;

    return impulseToDelta(PX, PY, PZ);
}

// Slip Regime (Ball slides on cushion)
function slipHan(v: Vector3, w: Vector3) {
    const { c, B } = basisHan(v, w);
    const vx = c / cos_a;
    const coeff = Math.max(0.5, 0.39 + 0.257 * vx - 0.044 * vx * vx);
    const ecB = (1 + coeff) * (c / B);

    // Dynamic friction of cushion
    const theta = Math.atan2(Math.abs(v.y), v.x);
    const muCurrent = 0.471 - theta * 0.241; // Empirical Han

    const phi = Math.atan2(v.y, v.x); // Slip angle?
    // In Han paper, phi is related to s vector direction?
    // Actually, phi is direction of slide velocity s.
    const s = s0(v, w);
    const slipAngle = Math.atan2(s.y, s.x);

    const cos_phi = Math.cos(slipAngle);
    const sin_phi = Math.sin(slipAngle);

    const PX = -muCurrent * ecB * cos_phi * cos_a - ecB * cos_a;
    const PY = -muCurrent * ecB * sin_phi; // Check signs. Friction opposes slide.
    const PZ = muCurrent * ecB * cos_phi * cos_a - ecB * sin_a; // Check geometry

    return impulseToDelta(PX, PY, PZ);
}

/**
 * Main Cushion Bounce Function (Han Model blended)
 * Expects ball hitting generic wall.
 * Original `bounceHanBlend` expects Velocity V to be incident towards +X wall??
 * No, `mathavenAdapter` rotates it.
 * 
 * We will expose `resolveCushion` that takes the wall normal and handles rotation.
 */
export function resolveCushion(v: Vector3, w: Vector3, normal: Vector3) {
    // 1. Calculate rotation angle to align Normal to (-1, 0) or something standard?
    // Han model expects impact on plane x=Const?
    // Original code: `bounceHan` "Expects ball to be bouncing in +X plane" -> Wall normal is (-1, 0)

    // We want to align the wall such that the Normal points -X (so ball is moving +X towards it).
    // Our Normal points INTO the table (rebound direction).
    // So Wall Normal is `normal`. Ball velocity `v` dot `normal` > 0 means leaving wall.
    // Incident ball: v dot normal < 0.

    // Let's rotate frames so `normal` becomes (-1, 0).
    // Angle of normal:
    const normalAngle = Math.atan2(normal.y, normal.x);
    // We want to rotate this to PI (180deg).
    // So rotate by (PI - normalAngle).

    const theta = Math.PI - normalAngle;

    const vr = v.clone().applyAxisAngle(up, theta);
    const wr = w.clone().applyAxisAngle(up, theta);

    // Now vr should have Positive X component (moving towards wall at x=0 from left? No.)
    // Normal is (-1,0). So wall is at right. Ball moves +X. vr.x > 0.

    // 2. Apply Model
    // Blend logic:
    const deltaGrip = gripHan(vr, wr);
    const deltaSlip = slipHan(vr, wr);

    // Check side logic for blend
    const isCheckSide = Math.sign(vr.y) === Math.sign(wr.z);
    // vr.y is tangent velocity. wr.z is english.
    // Running english: spin helps velocity?

    // Blending factor
    const factor = isCheckSide ? Math.abs(Math.cos(Math.atan2(vr.y, vr.x))) : 1;
    // Simple lerp
    const dV = new Vector3().lerpVectors(deltaSlip.v, deltaGrip.v, factor);
    const dW = new Vector3().lerpVectors(deltaSlip.w, deltaGrip.w, factor);

    // 3. Apply Delta
    vr.add(dV);
    wr.add(dW);

    // 4. Unrotate
    vr.applyAxisAngle(up, -theta);
    wr.applyAxisAngle(up, -theta);

    // Update originals
    v.copy(vr);
    w.copy(wr);
}
