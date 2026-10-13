import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";

const HOLD_MS = 1000;

export function isHoldPress(event: PointerEvent<HTMLElement>): boolean {
  return event.isPrimary && event.button === 0 && !event.ctrlKey;
}

/**
 * Fires after a one-second hold of pointer, Space or Enter, with the fill
 * following the physical clock. Focus loss and page hiding release the hold.
 */
export function HoldButton({
  className,
  onHold,
  children,
}: {
  className: string;
  onHold: () => void;
  children: ReactNode;
}) {
  const hint = useId();
  const [progress, setProgress] = useState(0);
  const startedAt = useRef<number | null>(null);
  const timer = useRef(0);
  const release = () => {
    startedAt.current = null;
    window.clearInterval(timer.current);
    setProgress(0);
  };
  const begin = () => {
    if (startedAt.current !== null) return;
    startedAt.current = performance.now();
    timer.current = window.setInterval(() => {
      if (startedAt.current === null) return;
      const held = Math.min(
        1,
        (performance.now() - startedAt.current) / HOLD_MS,
      );
      setProgress(held);
      if (held >= 1) {
        release();
        onHold();
      }
    }, 50);
  };
  const onLeave = useEffectEvent(release);
  useEffect(() => {
    const leave = () => onLeave();
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", leave);
    return () => {
      window.removeEventListener("blur", leave);
      document.removeEventListener("visibilitychange", leave);
      window.clearInterval(timer.current);
    };
  }, []);
  return (
    <>
      <button
        type="button"
        className={`hold ${className}`}
        aria-describedby={hint}
        style={{ "--hold": progress } as CSSProperties}
        onPointerDown={(event) => {
          if (!isHoldPress(event)) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          begin();
        }}
        onPointerUp={(event) => event.isPrimary && release()}
        onPointerCancel={(event) => event.isPrimary && release()}
        onLostPointerCapture={release}
        onBlur={release}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            if (!event.repeat) begin();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            release();
          }
        }}
      >
        {children}
      </button>
      <span id={hint} className="visually-hidden">
        Hold for one second. With a keyboard, hold Space or Enter.
      </span>
    </>
  );
}
