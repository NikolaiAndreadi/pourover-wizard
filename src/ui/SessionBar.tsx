import { type LiveSnapshot, modelName } from "@/app/liveScale";
import type { BrewModel } from "@/app/useBrew";
import { HoldToCancel } from "./HoldToCancel";

function connectingLabel({ progress }: LiveSnapshot): string {
  if (!progress) return "Connecting…";
  return progress.kind === "chooser"
    ? "Choose your scale"
    : `Connecting to ${progress.name ?? "your scale"}…`;
}
function ScaleControls({ model }: { model: BrewModel }) {
  const live = model.liveState;
  if (live.status === "disconnected")
    return (
      <button
        type="button"
        disabled={!model.liveSupported}
        onClick={model.connectLive}
      >
        Connect scale
      </button>
    );
  if (live.status === "connecting")
    return (
      <button type="button" disabled>
        {connectingLabel(live)}
      </button>
    );
  const name = live.model ? modelName(live.model) : "Scale";
  const weight =
    model.liveWeight === null || model.liveWeight === undefined
      ? "—"
      : model.liveWeight.toFixed(1);
  return (
    <>
      <button type="button" onClick={model.disconnectLive}>
        Disconnect
      </button>
      <div className="weight-control">
        <button
          type="button"
          className="weight"
          aria-describedby="tare-hint"
          disabled={live.pendingTare}
          onClick={model.tareLive}
        >
          {name} · {weight} g
        </button>
        <span id="tare-hint" className="weight-caption">
          {live.pendingTare ? "Taring…" : "Press to tare"}
        </span>
      </div>
    </>
  );
}
export function SessionBar({ model }: { model: BrewModel }) {
  const session = model.session;
  if (
    session?.phase !== "preparation" &&
    session?.phase !== "armed" &&
    session?.phase !== "brewing"
  )
    return null;
  const scale =
    model.liveSupported &&
    (session.mode === "live" || session.phase === "preparation");
  if (!scale && session.phase === "preparation") return null;
  return (
    <div className="session-bar">
      {scale && <ScaleControls model={model} />}
      {session.phase !== "preparation" && <HoldToCancel model={model} />}
    </div>
  );
}
