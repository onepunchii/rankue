import type { GolfTerrain, SurfaceKind, Vec3 } from "./types";

export interface Wall {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export interface MiniGolfHole {
  number: number;
  par: number;
  tee: Vec3;
  cup: Vec3;
  walls: Wall[];
}

export const MINI_HOLES: MiniGolfHole[] = [
  {
    number: 1,
    par: 2,
    tee: { x: -8, y: 0, z: -14 },
    cup: { x: 8, y: 0, z: 14 },
    walls: [
      { x1: -12, z1: -18, x2: 12, z2: -18 },
      { x1: -12, z1: 18, x2: 12, z2: 18 },
      { x1: -12, z1: -18, x2: -12, z2: 18 },
      { x1: 12, z1: -18, x2: 12, z2: 18 },
      { x1: 0, z1: -6, x2: 0, z2: 6 },
    ],
  },
  {
    number: 2,
    par: 3,
    tee: { x: -10, y: 0, z: -16 },
    cup: { x: 10, y: 0, z: 16 },
    walls: [
      { x1: -14, z1: -20, x2: 14, z2: -18 },
      { x1: -14, z1: 18, x2: 14, z2: 18 },
      { x1: -14, z1: -18, x2: -14, z2: 18 },
      { x1: 14, z1: -18, x2: 14, z2: 18 },
      { x1: -4, z1: -2, x2: 4, z2: -2 },
      { x1: -4, z1: 2, x2: 4, z2: 2 },
      { x1: 0, z1: -12, x2: 0, z2: -2 },
    ],
  },
];

export class FlatTerrain implements GolfTerrain {
  constructor(private h = 0) {}
  heightAt(): number {
    return this.h;
  }
  normalAt(): Vec3 {
    return { x: 0, y: 1, z: 0 };
  }
  surfaceAt(): SurfaceKind {
    return "green";
  }
}

export function collideWalls(pos: Vec3, vel: Vec3, walls: Wall[], radius: number): void {
  for (const w of walls) {
    const dx = w.x2 - w.x1;
    const dz = w.z2 - w.z1;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((pos.x - w.x1) * dx + (pos.z - w.z1) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = w.x1 + dx * t;
    const cz = w.z1 + dz * t;
    const ex = pos.x - cx;
    const ez = pos.z - cz;
    const dist = Math.hypot(ex, ez);
    if (dist < radius && dist > 0.0001) {
      const nx = ex / dist;
      const nz = ez / dist;
      pos.x = cx + nx * radius;
      pos.z = cz + nz * radius;
      const dot = vel.x * nx + vel.z * nz;
      if (dot < 0) {
        vel.x -= 2 * dot * nx;
        vel.z -= 2 * dot * nz;
        vel.x *= 0.82;
        vel.z *= 0.82;
      }
    }
  }
}
