export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type SurfaceKind =
  | "tee"
  | "fairway"
  | "rough"
  | "green"
  | "bunker"
  | "water"
  | "outOfBounds";

export interface BallState {
  position: Vec3;
  velocity: Vec3;
  isMoving: boolean;
}

export interface CourseHole {
  number: number;
  par: number;
  teePosition: Vec3;
  holePosition: Vec3;
  length: number;
  obstacles: Array<{
    kind: SurfaceKind;
    center: Vec3;
    radius: number;
  }>;
}

export interface GolfTerrain {
  heightAt(x: number, z: number): number;
  normalAt(x: number, z: number): Vec3;
  surfaceAt(x: number, z: number): SurfaceKind;
}
