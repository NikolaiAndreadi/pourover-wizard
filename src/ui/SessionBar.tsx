import type { BrewModel } from "@/app/useBrew";
import { HoldToCancel } from "./HoldToCancel";

const SCALE_STATUS = {
  connected: "Scale connected",
  connecting: "Connecting to scale",
  disconnected: "Scale disconnected",
} as const;

/** Session controls in the header: scale status and connection, and hold to cancel. */
export function SessionBar({ model }: { model: BrewModel }) {
  const session = model.session;
  if (
    session?.phase !== "preparation" &&
    session?.phase !== "armed" &&
    session?.phase !== "brewing"
  )
    return null;
  return (
    <div className={`session-bar${session.mode === "live" ? " is-live" : ""}`}>
      {session.mode === "live" && (
        <div className="session-scale">
          <p role="status">
            {SCALE_STATUS[model.liveState.status]} ·{" "}
            {session.lastSample
              ? `${model.liveWeight?.toFixed(1) ?? "—"} g`
              : "Waiting for the scale…"}
          </p>
          {model.liveState.status === "disconnected" ? (
            <button
              type="button"
              disabled={!model.liveSupported}
              onClick={model.connectLive}
            >
              Connect scale
            </button>
          ) : (
            <button type="button" onClick={model.disconnectLive}>
              Disconnect scale
            </button>
          )}
        </div>
      )}
      <HoldToCancel model={model} />
    </div>
  );
}
