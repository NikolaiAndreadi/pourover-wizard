import type { BrewModel } from "@/app/useBrew";

/** Cancels the session after a one-second hold of pointer, Space or Enter. */
export function HoldToCancel({
  model,
}: {
  model: Pick<BrewModel, "dispatch" | "holdProgress">;
}) {
  const { dispatch } = model;
  return (
    <div className="hold-to-cancel">
      <button
        type="button"
        className="cancel"
        aria-describedby="cancel-hint"
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
      <progress
        aria-label="Cancel hold progress"
        max="1"
        value={model.holdProgress}
      />
      <span id="cancel-hint" className="visually-hidden">
        Hold for one second. With a keyboard, hold Space or Enter.
      </span>
    </div>
  );
}
