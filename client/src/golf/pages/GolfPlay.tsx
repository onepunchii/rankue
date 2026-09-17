import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState, useCallback } from "react";
import type { Mesh } from "three";
import { BallPhysics, launchVelocity } from "../physics/engine";
import { createFieldTerrain, FIELD_HOLE } from "../physics/course";
import type { Vec3 } from "../physics/types";

const CLUBS = [
  { name: "드라이버", loft: 12, power: 45 },
  { name: "아이언 7", loft: 34, power: 30 },
  { name: "웨지", loft: 56, power: 18 },
  { name: "퍼터", loft: 2, power: 8 },
] as const;

function BallController({
  velRef,
  terrain,
  onHole,
  onMove,
}: {
  velRef: React.MutableRefObject<Vec3>;
  terrain: ReturnType<typeof createFieldTerrain>;
  onHole: () => void;
  onMove: (p: Vec3) => void;
}) {
  const meshRef = useRef<Mesh>(null);
  const physicsRef = useRef(new BallPhysics());
  const strokesRef = useRef(0);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const v = velRef.current;
    if (Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) < 0.0001) return;

    const pos: Vec3 = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
    const result = physicsRef.current.step(
      pos, v, 1 / 60, terrain, FIELD_HOLE.holePosition, { x: 0, y: 0, z: 0 },
    );
    mesh.position.set(pos.x, pos.y, pos.z);
    onMove(pos);
    if (result.enteredHole) {
      velRef.current = { x: 0, y: 0, z: 0 };
      onHole();
    }
  });

  return (
    <mesh ref={meshRef} position={[FIELD_HOLE.teePosition.x, 0.5, FIELD_HOLE.teePosition.z]} castShadow>
      <sphereGeometry args={[0.5, 24, 16]} />
      <meshStandardMaterial color="white" />
    </mesh>
  );
}

export default function GolfPlay() {
  const terrain = createFieldTerrain();
  const velRef = useRef<Vec3>({ x: 0, y: 0, z: 0 });
  const [clubIndex, setClubIndex] = useState(0);
  const [power, setPower] = useState(50);
  const [strokes, setStrokes] = useState(0);
  const [holed, setHoled] = useState(false);
  const [message, setMessage] = useState("방향·파워를 정하고 스윙하세요");
  const [ballPos, setBallPos] = useState<Vec3>(FIELD_HOLE.teePosition);

  const swing = useCallback(() => {
    if (holed) return;
    const club = CLUBS[clubIndex];
    const dx = FIELD_HOLE.holePosition.x - ballPos.x;
    const dz = FIELD_HOLE.holePosition.z - ballPos.z;
    const len = Math.hypot(dx, dz) || 1;
    const scale = (power / 100) * club.power * 2.2;
    velRef.current = launchVelocity(dx / len, dz / len, scale, club.loft);
    setStrokes(s => s + 1);
    setMessage(`${club.name} 샷 · 파워 ${power}%`);
  }, [clubIndex, power, ballPos, holed]);

  const handleMove = useCallback((p: Vec3) => setBallPos(p), []);
  const handleHole = useCallback(() => {
    setHoled(true);
    setStrokes(s => {
      setMessage(`홀인! 총 ${s + 1}타`);
      return s + 1;
    });
  }, []);

  const dist = Math.hypot(FIELD_HOLE.holePosition.x - ballPos.x, FIELD_HOLE.holePosition.z - ballPos.z);

  return (
    <main style={{ height: "100dvh", background: "#0A0A0A", color: "white", position: "relative", fontFamily: "system-ui" }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Canvas shadows camera={{ position: [ballPos.x, 14, ballPos.z - 18], fov: 55 }} fallback={<p style={{ padding: 24 }}>WebGL을 지원하는 브라우저가 필요합니다.</p>}>
          <color attach="background" args={["#abcbd0"]} />
          <ambientLight intensity={1.2} />
          <directionalLight position={[50, 90, -30]} intensity={2} castShadow />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[120, 200]} />
            <meshStandardMaterial color="#3f7d44" />
          </mesh>
          <mesh position={[FIELD_HOLE.holePosition.x, 0.06, FIELD_HOLE.holePosition.z]}>
            <cylinderGeometry args={[0.7, 0.7, 0.15, 24]} />
            <meshStandardMaterial color="#111" />
          </mesh>
          <mesh position={[FIELD_HOLE.holePosition.x, 2, FIELD_HOLE.holePosition.z]}>
            <cylinderGeometry args={[0.05, 0.05, 4, 8]} />
            <meshStandardMaterial color="#ddd" />
          </mesh>
          <mesh position={[FIELD_HOLE.holePosition.x + 0.4, 3.6, FIELD_HOLE.holePosition.z]}>
            <boxGeometry args={[0.7, 0.45, 0.03]} />
            <meshStandardMaterial color="#FF4081" />
          </mesh>
          <BallController velRef={velRef} terrain={terrain} onHole={handleHole} onMove={handleMove} />
        </Canvas>
      </div>
      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10, background: "rgba(0,0,0,0.55)", padding: 16, borderRadius: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>HOLE {FIELD_HOLE.number} · PAR {FIELD_HOLE.par} · 남은 거리 {dist.toFixed(0)}m</div>
        <div style={{ marginTop: 4, fontSize: 14, color: "#64DD17" }}>{message}</div>
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          {CLUBS.map((c, i) => (
            <button key={c.name} onClick={() => setClubIndex(i)}
              style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #333", background: i === clubIndex ? "#64DD17" : "#1a1a1a", color: i === clubIndex ? "#051907" : "#fff", fontWeight: 700 }}>
              {c.name}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <input type="range" min={0} max={100} value={power} onChange={e => setPower(Number(e.target.value))} style={{ width: 180 }} />
          <span style={{ fontWeight: 700, width: 48 }}>{power}%</span>
          <button onClick={swing} disabled={holed}
            style={{ padding: "8px 20px", borderRadius: 12, border: "none", background: holed ? "#333" : "#64DD17", color: "#051907", fontWeight: 800, fontSize: 16 }}>
            {holed ? "홀인 완료" : "스윙"}
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "#aaa" }}>타수 {strokes} · 홀까지 직선 조준 방식</div>
      </div>
    </main>
  );
}
