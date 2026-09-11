"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function MonthNav({ months, current }: { months: string[]; current: string }) {
  // getAvailableMonths comes back newest-first; show oldest→newest, left to right.
  const ordered = [...months].reverse();
  const activeRef = useRef<HTMLAnchorElement>(null);
  const router = useRouter();

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [current]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const idx = ordered.indexOf(current);
      if (e.key === "ArrowLeft" && idx > 0) router.push(`/transactions?month=${ordered[idx - 1]}`);
      if (e.key === "ArrowRight" && idx < ordered.length - 1) {
        router.push(`/transactions?month=${ordered[idx + 1]}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, ordered, router]);

  return (
    <div
      className="mb-4 flex gap-1.5 overflow-x-auto scroll-smooth px-1 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Select month"
    >
      {ordered.map((m) => (
        <Link
          key={m}
          ref={m === current ? activeRef : undefined}
          href={`/transactions?month=${m}`}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            m === current ? "bg-ink text-paper" : "bg-white text-muted hover:bg-line"
          }`}
        >
          {m}
        </Link>
      ))}
    </div>
  );
}
