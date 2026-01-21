/**
 * HiQ Physics Engine (Transplanted from tailuge/billiards)
 * Based on "The Han 2005" Model for cushion reflections and 
 * Sliding/Rolling friction models with spin.
 */

export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

export interface BallState {
    pos: Vector3;
    vel: Vector3;
    omega: Vector3; // Angular velocity
}

export class PhysicsEngine {
    // Basic Constants
    public static readonly g = 9.8 * 100; // Scaled gravity for units
    public static readonly e = 0.86; // Restitution
    public static readonly mu_s = 0.2; // Sliding friction
    public static readonly mu_r = 0.01; // Rolling friction
    public static readonly R = 5.2; // Ball Radius in 500-unit coordinate system
    public static readonly m = 0.21; // kg
    public static readonly I = (2 / 5) * 0.21 * Math.pow(5.2, 2);

    // Cushion Parameters (Han 2005)
    public static readonly mu_w = 0.14; // Cushion Friction
    public static readonly epsilon = 0.03125 * 0.1; // Contact point offset

    /**
     * Update ball state over time dt
     */
    public static update(ball: BallState, dt: number): BallState {
        const v = ball.vel;
        const w = ball.omega;
        const R = this.R;
        const g = this.g;

        // Velocity at contact point with table
        const va = {
            x: v.x + R * w.y,
            y: v.y - R * w.x,
            z: 0
        };

        const va_speed = Math.hypot(va.x, va.y);

        if (va_speed > 0.01) {
            // SLIDING PHASE
            const mu = this.mu_s;
            const dv = -(mu * g * dt);
            const dw = (5 / 2) * mu * g * dt / R;

            const ux = va.x / va_speed;
            const uy = va.y / va_speed;

            return {
                pos: {
                    x: ball.pos.x + v.x * dt,
                    y: ball.pos.y + v.y * dt,
                    z: 0
                },
                vel: {
                    x: v.x + dv * ux,
                    y: v.y + dv * uy,
                    z: 0
                },
                omega: {
                    x: w.x + dw * uy,
                    y: w.y - dw * ux,
                    z: w.z * Math.exp(-0.5 * dt) // Simple spin decay
                }
            };
        } else {
            // ROLLING PHASE
            const v_speed = Math.hypot(v.x, v.y);
            if (v_speed < 0.005) return { ...ball, vel: { x: 0, y: 0, z: 0 }, omega: { x: 0, y: 0, z: 0 } };

            const mu = this.mu_r;
            const dv = -(mu * g * dt);
            const ux = v.x / v_speed;
            const uy = v.y / v_speed;

            return {
                pos: {
                    x: ball.pos.x + v.x * dt,
                    y: ball.pos.y + v.y * dt,
                    z: 0
                },
                vel: {
                    x: v.x + dv * ux,
                    y: v.y + dv * uy,
                    z: 0
                },
                omega: {
                    x: (v.y + dv * uy) / R,
                    y: -(v.x + dv * ux) / R,
                    z: w.z * Math.exp(-0.1 * dt)
                }
            };
        }
    }

    /**
     * Cushion Reflection (The Han 2005 Model)
     * @param v Velocity vector
     * @param w Angular velocity vector
     * @param normal Cushion normal (unit vector)
     */
    public static resolveCushion(v: Vector3, w: Vector3, normal: Vector3): { v: Vector3, w: Vector3 } {
        const e = this.e;
        const mu = this.mu_w;
        const R = this.R;
        const m = this.m;

        // Velocity components relative to cushion normal (v_n) and tangent (v_t)
        const v_n = v.x * normal.x + v.y * normal.y;
        const v_t = v.x * (-normal.y) + v.y * normal.x;

        // Normal Impulse
        const P_n = m * (1 + e) * Math.abs(v_n);

        // Relative velocity at contact point (Han Model)
        // Side spin wz creates tangential velocity at contact
        const s_t_0 = v_t - R * w.z;

        // Tangential Impulse (Simplified Slip Model)
        // If sliding: P_t = mu * P_n
        const P_t = Math.min(mu * P_n, m * Math.abs(s_t_0) * 0.4);
        const v_t_prime = v_t - (Math.sign(s_t_0) * P_t / m);
        const v_n_prime = -e * v_n;

        // Angular velocity update (Spin change due to cushion friction)
        const w_z_prime = w.z + (5 / (2 * m * R)) * (Math.sign(s_t_0) * P_t);

        return {
            v: {
                x: v_n_prime * normal.x + v_t_prime * (-normal.y),
                y: v_n_prime * normal.y + v_t_prime * normal.x,
                z: 0
            },
            w: {
                x: w.x * 0.7,
                y: w.y * 0.7,
                z: w_z_prime * 0.9
            }
        };
    }

    /**
     * Generate path for a ball given initial state
     */
    public static projectTrajectory(start: BallState, tableSize: { w: number, h: number }, maxTime = 10): any[] {
        const frames: any[] = [];
        let current = JSON.parse(JSON.stringify(start));
        const dt = 1 / 60;

        for (let t = 0; t < maxTime; t += dt) {
            frames.push({ t: Math.round(t * 1000), x: current.pos.x, y: current.pos.y });

            // Check Walls (0~500, 0~250)
            if (current.pos.x <= 0) {
                const res = this.resolveCushion(current.vel, current.omega, { x: 1, y: 0, z: 0 });
                current.vel = res.v; current.omega = res.w;
                current.pos.x = 0.01;
            } else if (current.pos.x >= tableSize.w) {
                const res = this.resolveCushion(current.vel, current.omega, { x: -1, y: 0, z: 0 });
                current.vel = res.v; current.omega = res.w;
                current.pos.x = tableSize.w - 0.01;
            }

            if (current.pos.y <= 0) {
                const res = this.resolveCushion(current.vel, current.omega, { x: 0, y: 1, z: 0 });
                current.vel = res.v; current.omega = res.w;
                current.pos.y = 0.01;
            } else if (current.pos.y >= tableSize.h) {
                const res = this.resolveCushion(current.vel, current.omega, { x: 0, y: -1, z: 0 });
                current.vel = res.v; current.omega = res.w;
                current.pos.y = tableSize.h - 0.01;
            }

            current = this.update(current, dt);
            if (Math.hypot(current.vel.x, current.vel.y) < 0.001) break;
        }

        return frames;
    }
}
