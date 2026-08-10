import { Canvas, useFrame } from "@react-three/fiber";
import { useReducedMotion } from "framer-motion";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/** Per-theme material set. Additive blending adds light, so on a white canvas
 *  it draws nothing — light therefore switches to normal blending with dark
 *  blueprint-blue lines at lower opacity, while dark keeps the additive glow. */
interface Palette {
  edge: string;
  node: string;
  blending: THREE.Blending;
  edgeLit: number;
  edgeDim: number;
  fillLit: number;
  fillDim: number;
  thread: number;
  nodeOpacity: number;
}

const DARK_PALETTE: Palette = {
  edge: "#6E8BFF",
  node: "#B9C4FF",
  blending: THREE.AdditiveBlending,
  edgeLit: 0.6,
  edgeDim: 0.3,
  fillLit: 0.04,
  fillDim: 0.02,
  thread: 0.1,
  nodeOpacity: 0.9,
};

const LIGHT_PALETTE: Palette = {
  edge: "#3B57CC",
  node: "#2A3F94",
  blending: THREE.NormalBlending,
  edgeLit: 0.42,
  edgeDim: 0.22,
  fillLit: 0.05,
  fillDim: 0.03,
  thread: 0.12,
  nodeOpacity: 0.6,
};

/**
 * The travel run. Panes advance down the corridor toward the viewer; when one
 * passes Z_NEAR it returns to Z_FAR and floats the run again, fading in at the
 * far end and out at the near end so the recycle is never a visible pop.
 *
 * Travel is in depth rather than across, because the scene lives in a tall
 * narrow column — panes sliding sideways would spend most of the run off-screen.
 * The column itself begins at the sign-in card's right edge (it is a grid track,
 * not an overlay), so a pane physically cannot reach the card at any viewport
 * width; this run is what stops them piling up against that edge.
 */
const Z_FAR = -13;
const Z_NEAR = 2.6;
const Z_SPAN = Z_NEAR - Z_FAR;
const SPEED = 0.62;
/** Fraction of the run spent fading in at the far end / out at the near end. */
const FADE_IN = 0.16;
const FADE_OUT = 0.26;

/**
 * Deterministic PRNG. The scene must compose identically on every mount — a
 * hero that reshuffles itself on each load reads as noise rather than design.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

interface Pane {
  x: number;
  y: number;
  z: number;
  rotation: [number, number, number];
  size: [number, number];
  phase: number;
  lit: boolean;
}

const PANES: Pane[] = (() => {
  const r = rng(20260723);
  return Array.from({ length: 10 }, (_, i) => {
    const t = i / 9;
    return {
      x: (r() - 0.5) * 2.3,
      y: (r() - 0.5) * 2.6,
      z: Z_FAR + t * Z_SPAN,
      rotation: [(r() - 0.5) * 0.3, (r() - 0.5) * 0.5, (r() - 0.5) * 0.22] as [number, number, number],
      size: [1.3 + r() * 1.0, 1.8 + r() * 1.4] as [number, number],
      phase: r() * Math.PI * 2,
      lit: i % 3 === 1,
    };
  });
})();

/**
 * One pane: the frame, a faint glass fill, a node at its centre and one at each
 * corner, and threads joining them. The centre-to-corner threads are the point —
 * they keep "a claim, anchored to the places it came from" in the object, so it
 * isn't just architecture.
 */
function PaneMesh({ pane, drift, still, intensity, palette }:
                  { pane: Pane; drift: boolean; still: boolean; intensity: number; palette: Palette }) {
  const group = useRef<THREE.Group>(null);
  const edgeMat = useRef<THREE.LineBasicMaterial>(null);
  const fillMat = useRef<THREE.MeshBasicMaterial>(null);
  const threadMat = useRef<THREE.LineBasicMaterial>(null);
  const nodeMat = useRef<THREE.PointsMaterial>(null);

  const geo = useMemo(() => {
    const [w, h] = pane.size;
    const hw = w / 2;
    const hh = h / 2;
    const corners: [number, number][] = [
      [-hw, -hh],
      [hw, -hh],
      [-hw, hh],
      [hw, hh],
    ];
    const edges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h));

    const nodes = new THREE.BufferGeometry();
    nodes.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, ...corners.flatMap(([x, y]) => [x, y, 0])], 3),
    );

    const threads = new THREE.BufferGeometry();
    threads.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        corners.flatMap(([x, y]) => [0, 0, 0, x, y, 0]),
        3,
      ),
    );
    return { edges, nodes, threads };
  }, [pane]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;

    if (drift && !still) {
      g.position.z += delta * SPEED;
      // Reached the end of the run: back to the far end, and float it again.
      if (g.position.z > Z_NEAR) g.position.z -= Z_SPAN;
      g.position.y = pane.y + Math.sin(state.clock.elapsedTime * 0.4 + pane.phase) * 0.12;
      g.rotation.z = pane.rotation[2] + Math.sin(state.clock.elapsedTime * 0.25 + pane.phase) * 0.05;
    }

    // Fade in at the far end and out as a pane reaches the viewer, so the
    // recycle is never a visible pop.
    const t = drift ? THREE.MathUtils.clamp((g.position.z - Z_FAR) / Z_SPAN, 0, 1) : 1;
    const k = drift ? THREE.MathUtils.clamp(Math.min(t / FADE_IN, (1 - t) / FADE_OUT), 0, 1) : 1;

    if (edgeMat.current) edgeMat.current.opacity = (pane.lit ? palette.edgeLit : palette.edgeDim) * k * intensity;
    if (fillMat.current) fillMat.current.opacity = (pane.lit ? palette.fillLit : palette.fillDim) * k * intensity;
    if (threadMat.current) threadMat.current.opacity = palette.thread * k * intensity;
    if (nodeMat.current) nodeMat.current.opacity = palette.nodeOpacity * k * intensity;
  });

  return (
    <group ref={group} position={[pane.x, pane.y, pane.z]} rotation={pane.rotation}>
      <mesh>
        <planeGeometry args={pane.size} />
        <meshBasicMaterial
          ref={fillMat}
          color={palette.edge}
          transparent
          opacity={pane.lit ? palette.fillLit : palette.fillDim}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <lineSegments geometry={geo.edges}>
        <lineBasicMaterial
          ref={edgeMat}
          color={palette.edge}
          transparent
          opacity={pane.lit ? palette.edgeLit : palette.edgeDim}
          blending={palette.blending}
          depthWrite={false}
        />
      </lineSegments>

      <lineSegments geometry={geo.threads}>
        <lineBasicMaterial
          ref={threadMat}
          color={palette.edge}
          transparent
          opacity={palette.thread}
          blending={palette.blending}
          depthWrite={false}
        />
      </lineSegments>

      <points geometry={geo.nodes}>
        <pointsMaterial
          ref={nodeMat}
          color={palette.node}
          size={0.09}
          sizeAttenuation
          transparent
          opacity={palette.nodeOpacity}
          blending={palette.blending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

function Structure({ still, compact, spread, intensity, palette }:
                   { still: boolean; compact: boolean; spread: number; intensity: number; palette: Palette }) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    const g = group.current;
    if (!g || still) return;
    // Parallax only. The forward travel lives on the panes themselves, so the
    // group must not also rotate — that would carry panes across the card no
    // matter where their own travel stopped.
    g.rotation.x += (state.pointer.y * 0.05 - g.rotation.x) * 0.02;
    g.rotation.y += (state.pointer.x * 0.05 - g.rotation.y) * 0.02;
  });

  // 13 overlapping panes at thumbnail size is a scribble; the compact framing
  // shows only the nearest few, recentred, and skips the travel entirely —
  // there is no card for them to run into there.
  const panes = compact ? PANES.slice(4, 9) : PANES;

  return (
    <group ref={group} scale={compact ? 0.85 : 1}>
      {/* `spread` pushes panes out toward the frame edges for the ambient use,
          where the middle of the canvas is behind the reading column. */}
      {panes.map((pane, i) => (
        <PaneMesh
          key={i}
          pane={spread === 1 ? pane : { ...pane, x: pane.x * spread, y: pane.y * spread * 0.7 }}
          drift={!compact}
          still={still}
          intensity={intensity}
          palette={palette}
        />
      ))}
    </group>
  );
}

/**
 * Reduced motion holds a single composed frame: the structure is still there,
 * it just doesn't travel. `frameloop="demand"` renders once and stops.
 */
export default function SignatureScene({
  className,
  compact = false,
  spread = 1,
  intensity = 1,
  theme = "dark",
}: {
  className?: string;
  /** Small centred box rather than the tall login band. */
  compact?: boolean;
  /** Push panes outward, for backdrops whose centre is covered by content. */
  spread?: number;
  /** Scales every material alpha. Below 1 the scene reads as atmosphere behind
   *  content rather than as an object in its own right. */
  intensity?: number;
  /** Light swaps to normal blending + dark lines so the wireframe is visible on
   *  a white canvas. Pass `key={theme}` at the call site so materials remount. */
  theme?: "light" | "dark";
}) {
  const still = !!useReducedMotion();
  const palette = theme === "light" ? LIGHT_PALETTE : DARK_PALETTE;
  return (
    <Canvas
      className={className}
      camera={compact ? { position: [0, 0, 9], fov: 40 } : { position: [0, 0, 6.2], fov: 52 }}
      dpr={[1, 1.5]}
      frameloop={still ? "demand" : "always"}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      aria-hidden
    >
      <Structure still={still} compact={compact} spread={spread} intensity={intensity} palette={palette} />
    </Canvas>
  );
}
