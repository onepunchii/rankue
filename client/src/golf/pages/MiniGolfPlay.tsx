import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState, useCallback } from "react";
import type { Mesh } from "three";
import { BallPhysics, launchVelocity } from "../physics/engine";
import { FlatTerrain, MINI_HOLES, collideWalls, type MiniGolfHole } from "../physics/minigolf";
import type { Vec3 } from "../physics/types";

const BALL_R = 0.5;

function MiniBall({
  velRef,
  hole,
  onHole,
  onMove,
}: {
  velRef: React.MutableRefObject<Vec3>;
  hole: MiniGolfHole;
  onHole: () => void;
  onMove: (p: Vec3) => void;
}) {
  const meshRef = useRef<Mesh>(null);
  const physicsRef = useRef(new BallPhysics());
  const terrainRef = useRef(new FlatTerrain(0));

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const v = velRef.current;
    if (Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) < 0.0001) return;

    const pos: Vec3 = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
    physicsRef.current.step(pos, v, 1 / 60, terrainRef.current, hole.cup, { x: 0, y: 0, z: 0 });
    collideWalls(pos, v, hole.walls, BALL_R);
    mesh.position.set(pos.x, pos.y, pos.z);
    onMove(pos);

    const d = Math.hypot(pos.x - hole.cup.x, pos.z - hole.cup.z);
    if (d < 0.6 && Math.hypot(v.x, v.z) < 4) {
      velRef.current = { x: 0, y: 0, z: 0 };
      onHole();
    }
  });

  return (
    <mesh ref={meshRef} position={[hole.tee.x, BALL_R * 2, hole.tee.z]} castShadow>
      <sphereGeometry args={[BALL_R * 2, 24, 16]} />
      <meshStandardMaterial color="white" />
    </mesh>
  );
}

export default function MiniGolfPlay() {
  const [holeIndex, setHoleIndex] = useState(0);
  const hole = MINI_HOLES[holeIndex];
  const velRef = useRef<Vec3>({ x: 0, y: 0, z: 0 });
  const [power, setPower] = useState(40);
  const [strokes, setStrokes] = useState(0);
  const [total, setTotal] = useState(0);
  const [holed, setHoled] = useState(false);
  const [message, setMessage] = useState("미니골프 · 장애벽을 피해 홀로");
  const [ballPos, setBallPos] = useState<Vec3>(hole.tee);

  const swing = useCallback(() => {
    if (holed) return;
    const dx = hole.cup.x - ballPos.x;
    const dz = hole.cup.z - ballPos.z;
    const len = Math.hypot(dx, dz) || 1;
    velRef.current = { x: (dx / len) * (power / 100) * 9, y: 0, z: (dz / len) * (power / 100) * 9 };
    setStrokes(s => s + 1);
    setMessage(`퍼팅 · 파워 ${power}%`);
  }, [hole, ballPos, power, holed]);

  const handleHole = useCallback(() => {
    setHoled(true);
    setMessage(`홀인! ${strokes}타`);
  }, [strokes]);

  const nextHole = () => {
    if (!holed) return;
    if (holeIndex + 1 >= MINI_HOLES.length) {
      setMessage(`라운드 완료! 총 ${total + strokes}타`);
      return;
    }
    setTotal(t => t + strokes);
    setHoleIndex(i => i + 1);
    setStrokes(0);
    setHoled(false);
    setBallPos(MINI_HOLES[holeIndex + 1].tee);
    setMessage(`홀 ${MINI_HOLES[holeIndex + 1].number} 시작`);
  };

  const dist = Math.hypot(hole.cup.x - ballPos.x, hole.cup.z - ballPos.z);

  return (
    <main style={{ height: "100dvh", background: "#0A0A0A", color: "white", position: "relative", fontFamily: "system-ui" }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Canvas shadows camera={{ position: [0, 26, -30], fov: 50 }} fallback={<p style={{ padding: 24 }}>WebGL을 지원하는 브라우저가 필요합니다.</p>}>
          <color attach="background" args={["#101418"]} />
          <ambientLight intensity={1.1} />
          <directionalLight position={[20, 40, 10]} intensity={2.2} castShadow />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[60, 80]} />
            <meshStandardMaterial color="#2e6b36" />
          </mesh>
          {hole.walls.map((w, i) => {
            const cx = (w.x1 + w.x2) / 2;
            const cz = (w.z1 + w.z2) / 2;
            const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
            const angle = Math.atan2(w.x2 - w.x1, w.z2 - w.z1);
            return (
              <mesh key={i} position={[cx, 0.5, cz]} rotation={[0, angle, 0]} castShadow>
                <boxGeometry args={[0.6, 1, len]} />
                <meshStandardMaterial color="#c9b28a" />
              </mesh>
            );
          })}
          <mesh position={[hole.cup.x, 0.05, hole.cup.z]}>
            <cylinderGeometry args={[0.55, 0.55, 0.12, 24]} />
            <meshStandardMaterial color="#111" />
          </mesh>
          <mesh position={[hole.cup.x, 1.4, hole.cup.z]}>
            <cylinderGeometry args={[0.04, 0.04, 2.8, 8]} />
            <meshStandardMaterial color="#ddd" />
          </mesh>
          <BallControllerWrap velRef={velRef} hole={hole} onHole={handleHole} onMove={setBallPos} ballPos={ballPos} holeIndex={holeIndex} />
        </Canvas>
      </div>
      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10, background: "rgba(0,0,0,0.55)", padding: 16, borderRadius: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>미니골프 HOLE {hole.number} · PAR {hole.par} · 남은 거리 {dist.toFixed(1)}m</div>
        <div style={{ marginTop: 4, fontSize: 14, color: "#64DD17" }}>{message}</div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <input type="range" min={0} max={100} value={power} onChange={e => setPower(Number(e.target.value))} style={{ width: 180 }} />
          <span style={{ fontWeight: 700, width: 48 }}>{power}%</span>
          <button onClick={swing} disabled={holed}
            style={{ padding: "8px 20px", borderRadius: 12, border: "none", background: holed ? "#333" : "#64DD17", color: "#051907", fontWeight: 800, fontSize: 16 }}>
            {holed ? "홀인!" : "퍼팅"}
          </button>
          {holed && holeIndex + 1 < MINI_HOLES.length && (
            <button onClick={nextHole}
              style={{ padding: "8px 16px", borderRadius: 12, border: "1px solid #64DD17", background: "transparent", color: "#64DD17", fontWeight: 800 }}>
              다음 홀 →
            </button>
          )}
          {holed && holeIndex + 1 >= MINI_HOLES.length && (
            <button onClick={nextHole}
              style={{ padding: "8px 16px", borderRadius: 12, border: "1px solid #64DD17", background: "transparent", color: "#64DD17", fontWeight: 800 }}>
              결과 보기
            </button>
          )}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "#aaa" }}>타수 {strokes} · 누적 {total + strokes}타</div>
      </div>
    </main>
  );
}

function BallControllerWrap({
  velRef,
  hole,
  onHole,
  onMove,
  ballPos,
  holeIndex,
}: {
  velRef: React.MutableRefObject<Vec3>;
  hole: MiniGolfHole;
  onHole: () => void;
  onMove: (p: Vec3) => void;
  ballPos: Vec3;
  holeIndex: number;
}) {
  return (
    <MiniBallInner
      key={holeIndex}
      velRef={velRef}
      hole={hole}
      onHole={onHole}
      onMove={onMove}
      ballPos={ballPos}
    />
  );
}

function MiniBallInner({
  velRef,
  hole,
  onHole,
  onMove,
  ballPos,
}: {
  velRef: React.MutableRefObject<Vec3>;
  hole: MiniGolfHole;
  onHole: () => void;
  onMove: (p: Vec3) => void;
  ballPos: Vec3;
}) {
  const meshRef = useRef<Mesh>(null);
  const physicsRef = useRef(new BallPhysics());
  const terrainRef = useRef(new FlatTerrain(0));
  const wallsRef = useRef(hole.walls);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const v = velRef.current;
    if (Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) < 0.0001) return;

    const pos: Vec3 = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
    physicsRef.current.step(pos, v, 1 / 60, terrainRef.current, hole.cup, { x: 0, y: 0, z: 0 });
    collideWalls(pos, v, wallsRef.current, BALL_R * 2);
    mesh.position.set(pos.x, BALL_R * 2, pos.z);
    onMove(pos);

    const d = Math.hypot(pos.x - hole.cup.x, pos.z - hole.cup.z);
    if (d < 0.6 && Math.hypot(v.x, v.z) < 4) {
      velRef.current = { x: 0, y: 0, z: 0 };
      onHole();
    }
  });

  return (
    <mesh ref={meshRef} position={[ballPos.x, BALL_R * 2, ballPos.z]} castShadow>
      <sphereGeometry args={[BALL_R * 2, 24, 16]} />
      <meshStandardMaterial color="white" />
    </mesh>
  );
}
