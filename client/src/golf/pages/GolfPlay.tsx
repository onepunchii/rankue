import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Mesh } from "three";

function MovingBall() {
  const ball = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (ball.current) ball.current.position.x = Math.sin(clock.elapsedTime) * 3;
  });
  return <mesh ref={ball} position={[0, 0.3, 0]} castShadow>
    <sphereGeometry args={[0.3, 24, 16]} />
    <meshStandardMaterial color="white" />
  </mesh>;
}

export default function GolfPlay() {
  return <main style={{ height: "100dvh", background: "#abcbd0" }}>
    <Canvas shadows camera={{ position: [8, 9, 12], fov: 45 }} fallback={<p>WebGL을 지원하는 브라우저가 필요합니다.</p>}>
      <color attach="background" args={["#abcbd0"]} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 10, 5]} intensity={2} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#477951" />
      </mesh>
      <MovingBall />
    </Canvas>
  </main>;
}
