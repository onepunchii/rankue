
/**
 * PhysicsEngine2D.ts
 * 
 * Wrapper around 'physics-core' (The tailored billiards engine).
 * 
 * - Coordinates: Meters (Internally)
 * - Time: Seconds
 * - Output: Scaled to Screen
 */

import { Vector3, Quaternion } from "three";
import * as Core from "./physics-core";

interface Ball {
    id: string;
    pos: Vector3; // Position (m)
    vel: Vector3; // Velocity (m/s)
    spin: Vector3; // Angular Vel (rad/s)
    orientation: Quaternion; // 3D Orientation
    state: 'sliding' | 'rolling' | 'spinning' | 'stationary';
    color: string;
}

// Output format
interface VisualBall {
    id: string;
    pos: { x: number, y: number };
    vel: { x: number, y: number };
    orientation: { x: number, y: number, z: number, w: number };
    radius: number;
    color: string;
}

export class PhysicsEngine2D {
    // Current Table Specification
    private spec: Core.TableSpec;

    // Dynamic Dimensions (Meters)
    private TABLE_W: number;
    private TABLE_H: number;
    private BALL_RADIUS: number;

    public balls: Map<string, Ball> = new Map();

    constructor(
        initialSetup: { id: string, color: string, xRatio: number, yRatio: number }[],
        spec: Core.TableSpec = Core.PRESETS.LARGE
    ) {
        this.spec = spec;
        this.TABLE_W = spec.width;
        this.TABLE_H = spec.height;
        this.BALL_RADIUS = spec.ballRadius;

        // Sync the core physics constants with this spec
        Core.setTableSpec(spec);

        this.init(initialSetup);
    }

    public getSpec(): Core.TableSpec {
        return this.spec;
    }

    public init(initialSetup: { id: string, color: string, xRatio: number, yRatio: number }[]) {
        this.balls.clear();
        initialSetup.forEach(b => {
            this.balls.set(b.id, {
                id: b.id,
                pos: new Vector3(b.xRatio * this.TABLE_W, b.yRatio * this.TABLE_H, 0),
                vel: new Vector3(0, 0, 0),
                spin: new Vector3(0, 0, 0),
                orientation: new Quaternion(),
                state: 'stationary',
                color: b.color
            });
        });
    }

    public initFromPositions(posMap: Record<string, { x: number, y: number }>, colors?: Record<string, string>) {
        this.balls.clear();
        Object.entries(posMap).forEach(([id, pos]) => {
            this.balls.set(id, {
                id: id,
                pos: new Vector3(pos.x, pos.y, 0),
                vel: new Vector3(0, 0, 0),
                spin: new Vector3(0, 0, 0),
                orientation: new Quaternion(),
                state: 'stationary',
                color: colors?.[id] || (id === 'white' ? '#ffffff' : id === 'yellow' ? '#ffd700' : '#ff4d4d')
            });
        });
    }

    /**
     * Shoot
     * @param speed Speed (m/s). Break speed ~ 8-10 m/s.
     * @param angleRad Direction
     * @param spinX Side (-1..1)
     * @param spinY Top/Bottom (-1..1)
     */
    public shoot(ballId: string, speed: number, angleRad: number, spinX: number, spinY: number) {
        const ball = this.balls.get(ballId);
        if (!ball) return;

        // Linear Velocity
        ball.vel.set(
            Math.cos(angleRad) * speed,
            Math.sin(angleRad) * speed,
            0
        );

        // Spin Mapping
        // Inputs are normalized -1 to 1.
        // Max theoretical spin ~ horizontal speed / R? 
        // A harsh draw shot can have w * R > v.
        // Max spin roughly 220 rad/s (increased for better feel)
        const BASE_MAX_SPIN = 220;

        // Power-Spin Coupling: Scale spin capacity by shot speed.
        // This prevents "magic spins" at near-zero power.
        // Full spin potential is reached at speed 8.0 m/s (~80% power).
        const speedFactor = Math.min(1.0, speed / 8.0);
        const MAX_SPIN = BASE_MAX_SPIN * speedFactor;

        // Spin Y (Top/Bottom) -> Rotation around local X axis (Perp to cue)
        // Spin X (Side) -> Rotation around Z axis (English)

        // Cue direction vector D = (cos, sin, 0)
        // Top Spin Axis = Cross(Z, D) = (-sin, cos, 0)
        const dx = Math.cos(angleRad);
        const dy = Math.sin(angleRad);

        // Spin calculation relative to the shot direction
        ball.spin.set(
            -dy * spinY * MAX_SPIN,
            dx * spinY * MAX_SPIN,
            -spinX * MAX_SPIN
        );

        ball.state = 'sliding';
    }

    public update(dt: number) {
        // Core physics expects small time steps or handles analytical update?
        // The ported code calculates derivatives (Forces/Torques).
        // So we need clear Eureka-integration steps.

        const STEPS = 10;
        const subDt = dt / STEPS;

        for (let s = 0; s < STEPS; s++) {
            this.balls.forEach(ball => {
                if (ball.state === 'stationary') return;
                this.evolveBall(ball, subDt);
            });
            this.solveCollisions(); // Naive collision
        }
    }

    private evolveBall(b: Ball, dt: number) {
        // 1. Update State Classification
        // Relative vel at contact point
        // v_cp = v + w x r.   r = (0,0,-R)
        // w x r = (-wy*R, wx*R, 0).
        // v_cp = (vx - wy*R, vy + wx*R, 0)

        const v_cp = Core.surfaceVelocity(b.vel, b.spin); // Actually calculates slip velocity
        const slipSpeed = v_cp.length();

        if (b.state === 'sliding') {
            if (slipSpeed < 0.04) { // Fine-tuned threshold for optimal spin behavior
                b.state = 'rolling';
            } else {
                // Apply Sliding Friction
                const delta = Core.sliding(b.vel, b.spin);
                b.vel.addScaledVector(delta.v, dt);
                b.spin.addScaledVector(delta.w, dt);
            }
        }

        if (b.state === 'rolling') {
            // Simplify rolling: drag opposing velocity
            if (b.vel.length() > 0) {
                const muRoll = 0.015;
                const decel = b.vel.clone().normalize().multiplyScalar(-muRoll * Core.g);
                b.vel.addScaledVector(decel, dt);

                // Natural Roll Constraint: w = 1/R * (up x v)
                // We preserve the Z-axis spin (English) while forcing X/Y to match the roll
                const v_dir = b.vel.clone();
                const rollSpin = Core.upCross(v_dir).multiplyScalar(1 / Core.R);
                b.spin.x = rollSpin.x;
                b.spin.y = rollSpin.y;
                // b.spin.z stays as it is (subject to its own decay below)
            }

            // Should verify stop
            if (b.vel.length() < 0.01) {
                b.state = 'stationary';
                b.vel.set(0, 0, 0);
                b.spin.set(0, 0, 0);
            }
        }

        // Z-spin decay independent of state
        if (Math.abs(b.spin.z) > 0.01) {
            // Drastically reduced decay for longer-lasting English
            b.spin.z *= (1 - 0.15 * dt);
        }

        // Position Integration
        b.pos.addScaledVector(b.vel, dt);

        // Orientation Integration (3D Rotation)
        if (b.spin.length() > 0.01) {
            const axis = b.spin.clone().normalize();
            const angle = b.spin.length() * dt;
            const q = new Quaternion().setFromAxisAngle(axis, angle);
            b.orientation.premultiply(q);
        }

        // Cushion Check
        this.checkCushion(b);
    }

    private checkCushion(b: Ball) {
        let normal: Vector3 | null = null;
        const r = this.BALL_RADIUS;
        let cushionHit = false;

        // Boundaries (0 to W, 0 to H)
        if (b.pos.x < r) {
            b.pos.x = r; normal = new Vector3(1, 0, 0); cushionHit = true;
        } else if (b.pos.x > this.TABLE_W - r) {
            b.pos.x = this.TABLE_W - r; normal = new Vector3(-1, 0, 0); cushionHit = true;
        }

        if (b.pos.y < r) {
            b.pos.y = r; normal = new Vector3(0, 1, 0); cushionHit = true;
        } else if (b.pos.y > this.TABLE_H - r) {
            b.pos.y = this.TABLE_H - r; normal = new Vector3(0, -1, 0); cushionHit = true;
        }

        const cId = b.id + '_cushion';
        if (cushionHit) {
            if (!this.activeCushions.has(cId)) {
                this.activeCushions.add(cId);
                this.events.push({ type: 'cushion', subject: b.id });
                // console.log(`Cushion Hit: ${b.id}`);
            }
            if (normal) {
                Core.resolveCushion(b.vel, b.spin, normal);
                b.state = 'sliding';
            }
        } else {
            this.activeCushions.delete(cId);
        }
    }

    private solveCollisions() {
        const balls = Array.from(this.balls.values());
        for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
                const b1 = balls[i];
                const b2 = balls[j];
                const distV = new Vector3().subVectors(b2.pos, b1.pos);
                const dist = distV.length();
                const minDesc = 2 * this.BALL_RADIUS;

                // Event Logic: Pair ID based on string sort to be unique order invariant
                const pairId = [b1.id, b2.id].sort().join('-');

                if (dist < minDesc) {
                    // Record Event if new
                    if (!this.activeCollisions.has(pairId)) {
                        this.activeCollisions.add(pairId);
                        this.events.push({ type: 'collision', subject: b1.id, object: b2.id });
                        // console.log(`Collision: ${b1.id} & ${b2.id}`);
                    }

                    // Overlap fix
                    const overlap = minDesc - dist;
                    const n = distV.normalize();

                    b1.pos.addScaledVector(n, -overlap * 0.5);
                    b2.pos.addScaledVector(n, overlap * 0.5);

                    // --- Advanced Collision Resolution (Option 1: Separation & Throw) ---
                    const relVel = new Vector3().subVectors(b1.vel, b2.vel);
                    const vInNorm = relVel.dot(n);

                    if (vInNorm >= 0) {
                        // 1. Normal Impulse (High Elasticity for Ball-Ball)
                        const restitution = Core.RESTITUTION_BALL_TO_BALL;
                        const J = -(1 + restitution) * vInNorm / (2 / Core.m);
                        const impulseN = n.clone().multiplyScalar(J);

                        // 2. Throw Effect (Tangential Friction / Ball-Ball Friction)
                        // Contact point relative to b1: r1 = R * n
                        // Contact point relative to b2: r2 = -R * n
                        const r1 = n.clone().multiplyScalar(Core.R);
                        const r2 = n.clone().multiplyScalar(-Core.R);

                        // Relative velocity at contact point
                        const v_c1 = b1.vel.clone().add(b1.spin.clone().cross(r1));
                        const v_c2 = b2.vel.clone().add(b2.spin.clone().cross(r2));
                        const v_rel_c = v_c1.sub(v_c2);

                        // Tangential component of relative velocity
                        const v_tan = v_rel_c.clone().sub(n.clone().multiplyScalar(v_rel_c.dot(n)));

                        if (v_tan.length() > 0.01) {
                            const t = v_tan.clone().normalize();
                            // Friction impulse is proportional to normal impulse
                            const frictionJ = Math.abs(J) * Core.FRICTION_BALL_TO_BALL;
                            const impulseT = t.multiplyScalar(-frictionJ);

                            // IMPORTANT: For 2D Billiards, we clamp momentum exchange to XY plane
                            // and apply torque to the balls' rotation.
                            impulseN.add(impulseT).setZ(0);

                            // Apply Torque to both balls (Spin Transfer)
                            // dW = (r x Impulse) / I
                            const torque1 = r1.clone().cross(impulseT).multiplyScalar(1 / Core.I);
                            const torque2 = r2.clone().cross(impulseT.clone().negate()).multiplyScalar(1 / Core.I);
                            b1.spin.add(torque1);
                            b2.spin.add(torque2);
                        }

                        // Apply impulses
                        b1.vel.addScaledVector(impulseN, 1 / Core.m);
                        b2.vel.addScaledVector(impulseN, -1 / Core.m);

                        b1.state = 'sliding';
                        b2.state = 'sliding';
                    }
                } else {
                    // Reset event tracker when separated
                    if (this.activeCollisions.has(pairId)) {
                        this.activeCollisions.delete(pairId);
                    }
                }
            }
        }
    }

    // --- Accessors ---

    public getBalls(): VisualBall[] {
        return Array.from(this.balls.values()).map(b => ({
            id: b.id,
            pos: { x: b.pos.x, y: b.pos.y }, // Return raw meters. UI maps this.
            vel: { x: b.vel.x, y: b.vel.y },
            orientation: { x: b.orientation.x, y: b.orientation.y, z: b.orientation.z, w: b.orientation.w },
            radius: this.BALL_RADIUS,
            color: b.color
        }));
    }

    // --- Event System ---
    public events: { type: 'collision' | 'cushion', subject: string, object?: string }[] = [];
    private activeCollisions: Set<string> = new Set(); // Tracks active pairs "id1-id2"
    private activeCushions: Set<string> = new Set(); // Tracks active cushion contacts "id+wall"

    public getAndClearEvents() {
        const evts = [...this.events];
        this.events = [];
        return evts;
    }

    public clearEvents() {
        this.events = [];
        this.activeCollisions.clear();
        this.activeCushions.clear();
    }


    public isAllStationary() {
        return Array.from(this.balls.values()).every(b => b.state === 'stationary');
    }

    /**
     * Project Trajectory (Dry Run)
     * Useful for AI Path Visualization
     */
    public projectTrajectory(ballId: string, speed: number, angleRad: number, spinX: number, spinY: number, maxSeconds = 10): Record<string, { x: number, y: number }[]> {
        // Save current world state
        const saved = Array.from(this.balls.values()).map(b => ({
            id: b.id,
            pos: b.pos.clone(),
            vel: b.vel.clone(),
            spin: b.spin.clone(),
            orientation: b.orientation.clone(),
            state: b.state
        }));

        this.shoot(ballId, speed, angleRad, spinX, spinY);

        const paths: Record<string, { x: number, y: number }[]> = {};
        this.balls.forEach(b => paths[b.id] = []);

        const dt = 1 / 60;
        const totalSteps = maxSeconds / dt;

        for (let i = 0; i < totalSteps; i++) {
            this.update(dt);
            this.balls.forEach(b => {
                // Record roughly every 2nd frame to save memory
                if (i % 2 === 0) {
                    paths[b.id].push({ x: b.pos.x, y: b.pos.y });
                }
            });
            if (this.isAllStationary()) break;
        }

        // Restore state
        saved.forEach(s => {
            const b = this.balls.get(s.id);
            if (b) {
                b.pos.copy(s.pos);
                b.vel.copy(s.vel);
                b.spin.copy(s.spin);
                b.orientation.copy(s.orientation);
                b.state = s.state;
            }
        });

        return paths;
    }
}
