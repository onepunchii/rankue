import type { GolfTerrain, SurfaceKind, Vec3 } from "./types";

export interface TerrainConfig {
  length: number;
  width: number;
  fairwayWidth: number;
  greenRadius: number;
  greenCenter: Vec3;
  teePosition: Vec3;
  bunkers: Array<{ center: Vec3; radius: number }>;
  water: Array<{ center: Vec3; radius: number }>;
  hillAmplitude: number;
  hillWavelength: number;
}

export class FieldTerrain implements GolfTerrain {
  readonly config: TerrainConfig;

  constructor(config: TerrainConfig) {
    this.config = config;
  }

  heightAt(x: number, z: number): number {
    const { hillAmplitude, hillWavelength } = this.config;
    return (
      hillAmplitude * Math.sin((x / hillWavelength) * Math.PI * 2) +
      hillAmplitude * 0.5 * Math.cos((z / hillWavelength) * Math.PI * 2)
    );
  }

  normalAt(x: number, z: number): Vec3 {
    const eps = 0.5;
    const hL = this.heightAt(x - eps, z);
    const hR = this.heightAt(x + eps, z);
    const hD = this.heightAt(x, z - eps);
    const hU = this.heightAt(x, z + eps);
    const nx = hL - hR;
    const nz = hD - hU;
    const ny = 2 * eps;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  surfaceAt(x: number, z: number): SurfaceKind {
    const { greenCenter, greenRadius, bunkers, water, fairwayWidth, teePosition } = this.config;
    for (const b of bunkers) {
      if (dist2(x, z, b.center) < b.radius * b.radius) return "bunker";
    }
    for (const w of water) {
      if (dist2(x, z, w.center) < w.radius * w.radius) return "water";
    }
    if (dist2(x, z, greenCenter) < greenRadius * greenRadius) return "green";
    if (dist2(x, z, teePosition) < 9) return "tee";
    if (Math.abs(x - (teePosition.x + greenCenter.x) / 2) < fairwayWidth / 2) return "fairway";
    return "rough";
  }
}

function dist2(x: number, z: number, c: Vec3): number {
  const dx = x - c.x;
  const dz = z - c.z;
  return dx * dx + dz * dz;
}
