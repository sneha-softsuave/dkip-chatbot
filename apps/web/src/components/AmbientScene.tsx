import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function Globe() {
  const meshRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef<THREE.Points>(null);

  const ringGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const count = 120;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 2.4 + Math.random() * 0.4;
      const y = (Math.random() - 0.5) * 0.6;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.05;
    if (pointsRef.current) pointsRef.current.rotation.y -= delta * 0.02;
  });

  return (
    <>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.6, 1]} />
        <meshBasicMaterial wireframe color="#FCD535" transparent opacity={0.18} />
      </mesh>
      <mesh ref={meshRef} scale={1.02}>
        <icosahedronGeometry args={[1.6, 1]} />
        <meshBasicMaterial wireframe color="#f0b90b" transparent opacity={0.08} />
      </mesh>
      <points ref={pointsRef} geometry={ringGeo}>
        <pointsMaterial size={0.035} color="#FCD535" transparent opacity={0.7} sizeAttenuation />
      </points>
      <points geometry={ringGeo} rotation={[Math.PI / 2, 0, 0]}>
        <pointsMaterial size={0.025} color="#0ecb81" transparent opacity={0.5} sizeAttenuation />
      </points>
    </>
  );
}

export function AmbientScene() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ antialias: false, alpha: true }}
      >
        <color attach="background" args={["transparent"]} />
        <ambientLight intensity={0.5} />
        <Globe />
        <EffectComposer>
          <Bloom intensity={0.6} luminanceThreshold={0.1} luminanceSmoothing={0.9} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
