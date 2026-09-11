"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

/** Swipe left/right over the transaction list to move between months. */
export function SwipeMonth({
  prevMonth,
  nextMonth,
  children,
}: {
  prevMonth?: string;
  nextMonth?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!start.current) return;
    const dx = e.changedTouches[0].clientX - start.current.x;
    const dy = e.changedTouches[0].clientY - start.current.y;
    start.current = null;

    // Require a clearly horizontal, deliberate swipe — not a vertical scroll.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx > 0 && prevMonth) router.push(`/transactions?month=${prevMonth}`);
    if (dx < 0 && nextMonth) router.push(`/transactions?month=${nextMonth}`);
  }

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {children}
    </div>
  );
}
