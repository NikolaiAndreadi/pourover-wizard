import { useEffect, useRef } from "react";
import { createWakeLock, type WakeLock } from "@/platform/wakeLock";

export function useWakeLock(wanted: boolean) {
  const lock = useRef<WakeLock | null>(null);
  useEffect(() => {
    if (!wanted) return;
    lock.current ??= createWakeLock();
    const current = lock.current;
    void current.hold();
    return () => {
      void current.release();
    };
  }, [wanted]);
}
