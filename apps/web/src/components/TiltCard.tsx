import { motion, useReducedMotion, useSpring } from "framer-motion";
import type { ReactNode } from "react";

/**
 * A card that tips slightly toward the pointer. The one deliberate bit of depth
 * on the interior surfaces — the sign-in's atmosphere brought to the cards you
 * actually work with, kept to a few degrees so it reads as "lit and physical"
 * rather than as a toy. Rotation only, no translate: a 3D tilt never shifts
 * layout, so neighbouring tiles don't jitter as the pointer crosses them (the
 * reason `.card-hover` stays flat). Under reduced motion it is an inert wrapper.
 */
const SPRING = { stiffness: 220, damping: 20, mass: 0.4 };

/**
 * Pointer position within a box → tilt in degrees. Pure so the mapping is
 * checkable: centre is flat, the right edge tips to +max on Y, the top edge to
 * +max on X (toward the viewer). Kept out of the component for the self-check
 * below.
 */
export function tiltAngles(
  size: { width: number; height: number },
  offsetX: number,
  offsetY: number,
  max: number,
): { rotateX: number; rotateY: number } {
  const px = size.width ? offsetX / size.width - 0.5 : 0; // -0.5 … 0.5
  const py = size.height ? offsetY / size.height - 0.5 : 0;
  return { rotateX: -py * 2 * max, rotateY: px * 2 * max };
}

if (import.meta.env?.DEV) {
  const flat = tiltAngles({ width: 100, height: 100 }, 50, 50, 6);
  console.assert(flat.rotateX === 0 && flat.rotateY === 0, "tiltAngles: centre must be flat");
  const right = tiltAngles({ width: 100, height: 100 }, 100, 50, 6);
  console.assert(Math.abs(right.rotateY - 6) < 1e-9, "tiltAngles: right edge → +max on Y");
}

export function TiltCard({
  children,
  className,
  max = 5,
}: {
  children: ReactNode;
  className?: string;
  /** Peak tilt in degrees at the card's edges. */
  max?: number;
}) {
  const still = useReducedMotion();
  const rotateX = useSpring(0, SPRING);
  const rotateY = useSpring(0, SPRING);

  if (still) return <div className={className}>{children}</div>;

  return (
    <motion.div
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const { rotateX: rx, rotateY: ry } = tiltAngles(rect, e.clientX - rect.left, e.clientY - rect.top, max);
        rotateX.set(rx);
        rotateY.set(ry);
      }}
      onPointerLeave={() => {
        rotateX.set(0);
        rotateY.set(0);
      }}
      style={{ rotateX, rotateY, transformPerspective: 900, transformStyle: "preserve-3d" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
