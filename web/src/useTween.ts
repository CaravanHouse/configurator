import { useEffect, useRef, useState } from "react";

/** Плавно «докручивает» число до нового значения (для суммы сметы) */
export function useTween(target: number, ms = 450) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setValue(target); from.current = target; return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const cur = a + (target - a) * (1 - Math.pow(1 - k, 3));
      setValue(cur); from.current = cur;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
