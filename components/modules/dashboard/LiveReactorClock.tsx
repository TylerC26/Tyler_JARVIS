"use client";

import { useEffect, useState } from "react";
import { ReactorClock } from "./ReactorClock";

// Self-ticking wrapper so server-rendered panels can embed the reactor clock.
export function LiveReactorClock({ size = 150 }: { size?: number }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return <ReactorClock now={now} size={size} />;
}
