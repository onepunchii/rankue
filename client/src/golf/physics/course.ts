import { FieldTerrain } from "./terrain";
import type { CourseHole, Vec3 } from "./types";

export const FIELD_HOLE: CourseHole = {
  number: 1,
  par: 4,
  teePosition: { x: 0, y: 0, z: -80 },
  holePosition: { x: 4, y: 0, z: 70 },
  length: 150,
  obstacles: [],
};

export const FIELD_TERRAIN_CONFIG = {
  length: 180,
  width: 120,
  fairwayWidth: 24,
  greenRadius: 10,
  greenCenter: { x: 4, y: 0, z: 70 },
  teePosition: { x: 0, y: 0, z: -80 },
  bunkers: [
    { center: { x: -12, y: 0, z: 45 }, radius: 5 },
    { center: { x: 14, y: 0, z: 58 }, radius: 4 },
  ],
  water: [
    { center: { x: 18, y: 0, z: 20 }, radius: 8 },
  ],
  hillAmplitude: 0.8,
  hillWavelength: 30,
};

export function createFieldTerrain(): FieldTerrain {
  return new FieldTerrain(FIELD_TERRAIN_CONFIG);
}

export function holeAim(from: Vec3, to: Vec3): Vec3 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, y: 0, z: dz / len };
}
