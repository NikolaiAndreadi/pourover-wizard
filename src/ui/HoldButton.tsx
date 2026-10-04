import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

const HOLD_MS = 1000;
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
  useEffect(() => {
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
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
          event.currentTarget.setPointerCapture(event.pointerId);
          begin();
        }}
        onPointerUp={release}
        onPointerCancel={release}
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
