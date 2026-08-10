import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Route-level transition. Short and small on purpose: a page that slides a long
 * way on every navigation reads as a slideshow rather than an application.
 * Everything here collapses to a plain fade when the OS asks for less motion.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const still = useReducedMotion();
  return (
    <motion.div
      initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={still ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{ duration: still ? 0.12 : 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}

export function StaggerContainer({
  children,
  className,
  stagger = 0.03,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  const still = useReducedMotion();
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: still ? 0 : stagger } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const still = useReducedMotion();
  return (
    <motion.div
      variants={{
        hidden: still ? { opacity: 0 } : { opacity: 0, y: 6 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
