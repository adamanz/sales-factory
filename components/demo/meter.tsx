"use client";

import { Progress } from "radix-ui";

export function Meter({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <Progress.Root className="sf-meter" value={clamped} aria-label={label}>
      <Progress.Indicator className="sf-meter-bar" style={{ transform: `translateX(-${100 - clamped}%)` }} />
    </Progress.Root>
  );
}
