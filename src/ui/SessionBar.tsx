import { type LiveSnapshot, modelName } from "@/app/liveScale";
import type { BrewModel } from "@/app/useBrew";
import { HoldButton } from "./HoldButton";
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
      <HoldButton className="disconnect" onHold={model.disconnectLive}>
        Hold to disconnect
      </HoldButton>
    </>
  );
}
/** Scale controls on every screen, since the connection outlives a brew; cancel while armed or brewing. */
export function SessionBar({ model }: { model: BrewModel }) {
  const phase = model.session?.phase;
  const cancellable = phase === "armed" || phase === "brewing";
  if (!model.liveSupported && !cancellable) return null;
  return (
    <div className="session-bar">
      {model.liveSupported && <ScaleControls model={model} />}
      {cancellable && <HoldToCancel model={model} />}
    </div>
  );
}
