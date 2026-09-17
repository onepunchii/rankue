import type { GolfTerrain, Vec3 } from "./types";

const GRAVITY = 9.81;
const AIR_DRAG = 0.18;
const MAGNUS = 0.06;
const RESTITUTION_GRASS = 0.32;
const RESTITUTION_GREEN = 0.28;
const ROLL_FRICTION = 2.6;
const GREEN_ROLL_FRICTION = 1.1;
const BUNKER_FRICTION = 9.0;
const STOP_SPEED = 0.12;
const BALL_RADIUS = 0.02135 * 10;

export interface StepResult {
  enteredHole: boolean;
  inWater: boolean;
  outOfBounds: boolean;
  surface: string;
}

export class BallPhysics {
  readonly radius = BALL_RADIUS;

  step(
    pos: Vec3,
    vel: Vec3,
    dt: number,
    terrain: GolfTerrain,
    holePosition: Vec3,
    wind: Vec3,
  ): StepResult {
    const result: StepResult = {
      enteredHole: false,
      inWater: false,
      outOfBounds: false,
      surface: terrain.surfaceAt(pos.x, pos.z),
    };

    if (!pos || !vel) return result;

    const sub = 4;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      integrate(pos, vel, h, terrain, holePosition, wind, result);
      if (result.enteredHole) break;
    }
    return result;
  }
}

function integrate(
  pos: Vec3,
  vel: Vec3,
  dt: number,
  terrain: GolfTerrain,
  hole: Vec3,
  wind: Vec3,
  result: StepResult,
): void {
  const groundY = terrain.heightAt(pos.x, pos.z);
  const airborne = pos.y > groundY + BALL_RADIUS * 1.2;

  if (airborne) {
    vel.x += (wind.x - vel.x * 0.02) * dt;
    vel.z += (wind.z - vel.z * 0.02) * dt;
    vel.y -= GRAVITY * dt;

    const speed = Math.hypot(vel.x, vel.z);
    if (speed > 0.001) {
      const magnus = MAGNUS * speed;
      vel.x += -vel.z * magnus * dt;
      vel.z += vel.x * magnus * dt;
    }
  } else {
    pos.y = groundY + BALL_RADIUS;
    const n = terrain.normalAt(pos.x, pos.z);
    const slopeAccel = 9.81 * n.x;
    vel.x += slopeAccel * dt * 8;
    vel.z += (9.81 * n.z) * dt * 8;

    const surface = terrain.surfaceAt(pos.x, pos.z);
    const friction =
      surface === "green" ? GREEN_ROLL_FRICTION :
      surface === "bunker" ? BUNKER_FRICTION :
      ROLL_FRICTION;

    const horizSpeed = Math.hypot(vel.x, vel.z);
    if (horizSpeed > 0.0001) {
      const decel = friction * dt;
      const factor = Math.max(0, 1 - decel / horizSpeed);
      vel.x *= factor;
      vel.z *= factor;
    }

    if (horizSpeed < STOP_SPEED && Math.abs(n.x) < 0.04 && Math.abs(n.z) < 0.04) {
      vel.x = 0;
      vel.z = 0;
    }
  }

  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
  pos.z += vel.z * dt;

  const newGroundY = terrain.heightAt(pos.x, pos.z);
  if (pos.y < newGroundY + BALL_RADIUS) {
    pos.y = newGroundY + BALL_RADIUS;
    if (vel.y < -0.5) {
      const surface = terrain.surfaceAt(pos.x, pos.z);
      const rest = surface === "green" ? RESTITUTION_GREEN : RESTITUTION_GRASS;
      vel.y = -vel.y * rest;
      vel.x *= 0.75;
      vel.z *= 0.75;
    } else {
      vel.y = 0;
    }
  }

  const dx = pos.x - hole.x;
  const dz = pos.z - hole.z;
  const dy = pos.y - hole.y;
  const distSq = dx * dx + dz * dz;
  if (distSq < 0.108 * 0.108 && Math.abs(dy) < 0.2 && Math.hypot(vel.x, vel.z) < 3.2) {
    result.enteredHole = true;
    vel.x = 0;
    vel.y = 0;
    vel.z = 0;
  }
}

export function launchVelocity(
  dirX: number,
  dirZ: number,
  power: number,
  loftDegrees: number,
): Vec3 {
  const loft = (loftDegrees * Math.PI) / 180;
  const horiz = Math.cos(loft);
  const vx = dirX * horiz;
  const vz = dirZ * horiz;
  const vy = Math.sin(loft);
  const scale = power;
  return { x: vx * scale, y: vy * scale, z: vz * scale };
}
