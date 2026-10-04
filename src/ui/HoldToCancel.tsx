import type { CSSProperties } from "react";
import type { BrewModel } from "@/app/useBrew";

/** Cancels the session after a one-second hold of pointer, Space or Enter. */
export function HoldToCancel({
  model,
}: {
  model: Pick<BrewModel, "dispatch" | "holdProgress">;
}) {
  const { dispatch } = model;
  return (
    <>
      <button
        type="button"
        className="cancel"
        aria-describedby="cancel-hint"
        style={{ "--hold": model.holdProgress } as CSSProperties}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dispatch("hold");
        }}
        onPointerUp={() => dispatch("release")}
        onPointerCancel={() => dispatch("release")}
        onLostPointerCapture={() => dispatch("release")}
        onBlur={() => dispatch("release")}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            if (!event.repeat) dispatch("hold");
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            dispatch("release");
          }
        }}
      >
        Hold to cancel
      </button>
      <span id="cancel-hint" className="visually-hidden">
        Hold for one second. With a keyboard, hold Space or Enter.
      </span>
    </>
  );
}
