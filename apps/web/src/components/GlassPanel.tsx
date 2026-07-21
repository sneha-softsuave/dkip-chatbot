import { motion, useMotionTemplate, useMotionValue, useTransform } from "framer-motion";
import type { ReactNode, DragEvent } from "react";
import { cx } from "./ui";

interface SurfaceCardProps {
  children: ReactNode;
  className?: string;
  tilt?: boolean;
  glow?: boolean;
  elevated?: boolean;
  hover?: boolean;
  onClick?: (e?: React.MouseEvent) => void;
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
}

export function GlassPanel({
  children,
  className,
  tilt = false,
  glow = false,
  elevated = false,
  hover = true,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop,
}: SurfaceCardProps) {
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);

  const rotateX = useTransform(y, [0, 1], [6, -6]);
  const rotateY = useTransform(x, [0, 1], [-6, 6]);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!tilt) return;
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width);
    y.set((e.clientY - rect.top) / rect.height);
  }

  function handleMouseLeave() {
    if (!tilt) return;
    x.set(0.5);
    y.set(0.5);
  }

  const gradient = useMotionTemplate`
    radial-gradient(
      280px circle at ${x}% ${y}%,
      rgba(252, 213, 53, 0.10),
      transparent 70%
    )
  `;

  return (
    <motion.div
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{ rotateX: tilt ? rotateX : 0, rotateY: tilt ? rotateY : 0, transformStyle: "preserve-3d" }}
      whileHover={hover && !tilt ? { y: -2, transition: { duration: 0.2 } } : undefined}
      className={cx(
        elevated ? "surface-elevated" : "surface-card",
        "relative overflow-hidden",
        glow && "shadow-glow",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {tilt && (
        <motion.div
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100"
          style={{ background: gradient }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
