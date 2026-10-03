import type { BrewModel } from "@/app/useBrew";
import { BrewChart, BrewSteps } from "./BrewChart";

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function Source() {
  return (
    <p className="source">
      By James Hoffmann ·{" "}
      <a
        href="https://www.youtube.com/watch?v=1oB1oDrDkHM"
        target="_blank"
        rel="noreferrer"
      >
        Original technique
      </a>
      .{" "}
      <a
        href="https://www.hario-usa.com/blogs/recipes-and-more-from-friends/james-hoffmann-1-cup-v60-technique"
        target="_blank"
        rel="noreferrer"
      >
        Hario’s timing guide
      </a>
      . Linear pour curves are guidance. Drawdown varies; finish when drained.
    </p>
  );
}
function LiveControls({ model }: { model: BrewModel }) {
  return (
    <aside aria-label="Live scale connection">
      <p role="status">
        Scale: {model.liveState.status}.{" "}
        {model.session?.lastSample
          ? `${model.liveWeight?.toFixed(1) ?? "—"} g`
          : "Waiting for fresh readings."}
      </p>
      {model.liveState.error && <p role="alert">{model.liveState.error}</p>}
      {model.liveState.status === "disconnected" ? (
        <button
          type="button"
          disabled={!model.liveSupported}
          onClick={model.connectLive}
        >
          Connect BOOKOO scale
        </button>
      ) : (
        <button type="button" onClick={model.disconnectLive}>
          Disconnect scale
        </button>
      )}
      {!model.liveSupported && (
        <p>Live connection requires a browser with Web Bluetooth support.</p>
      )}
      {model.session?.phase === "preparation" && (
        <button
          type="button"
          disabled={
            model.liveState.status !== "connected" ||
            model.liveState.pendingTare
          }
          onClick={model.tareLive}
        >
          {model.liveState.pendingTare ? "Taring scale…" : "Tare live scale"}
        </button>
      )}
      <p>A scale disconnect stops the brew. Tare before arming auto-start.</p>
    </aside>
  );
}
export function Brew({ model }: { model: BrewModel }) {
  const { session, dispatch } = model;
  if (!session)
    return (
      <>
        <h1>
          Your daily pour-over,
          <br />
          with room to focus.
        </h1>
        <p className="intro">A simple guide for one cup of V60 coffee.</p>
        <section className="brew-panel">
          <h2>Prepare your cup</h2>
          <p>Better 1 Cup V60 · 15 g coffee / 250 g water</p>
          <label>
            Coffee dose (g)
            <input
              type="number"
              min="10"
              max="25"
              step="0.1"
              value={model.dose}
              onChange={(event) => model.setDose(event.target.value)}
              aria-invalid={!model.doseValid}
            />
          </label>
          {!model.doseValid && (
            <p role="alert">Choose a coffee dose from 10 to 25 g.</p>
          )}
          <p>
            Target:{" "}
            {model.doseValid
              ? Math.round((Number(model.dose) * 250) / 15)
              : "—"}{" "}
            g water · 1:16.67. Scaling changes water amounts; timings stay
            fixed. The original recipe uses 15 g.
          </p>
          <label>
            Guide mode
            <select
              value={model.mode}
              onChange={(event) =>
                model.setMode(event.target.value as BrewModel["mode"])
              }
            >
              <option value="timer">Timer only</option>
              <option value="live">BOOKOO live scale</option>
            </select>
          </label>
          <ol>
            <li>Rinse the paper and preheat the V60.</li>
            <li>Add medium-fine coffee; make a small well.</li>
            <li>
              Use soft, filtered water, freshly boiled for lighter roasts.
            </li>
          </ol>
          <button
            type="button"
            className="button"
            disabled={!model.doseValid}
            onClick={model.prepare}
          >
            Prepare brew
          </button>
          <Source />
        </section>
      </>
    );
  if (session.phase === "cancelled")
    return (
      <section className="brew-panel">
        <h1>Brew cancelled</h1>
        <p>The session has been cleared. Prepare again for a fresh start.</p>
        <button type="button" className="button" onClick={model.restart}>
          Prepare another brew
        </button>
      </section>
    );
  if (session.phase === "interrupted")
    return (
      <section className="brew-panel">
        <h1>Brew stopped</h1>
        <p>The scales disconnected. Start a fresh brew when connected again.</p>
        <p className="timer" role="timer" aria-label="Elapsed brew time">
          {formatTime(session.elapsedMs)}
        </p>
        <BrewChart model={model} />
        <button type="button" className="button" onClick={model.restart}>
          Prepare another brew
        </button>
      </section>
    );
  if (session.phase === "completed")
    return (
      <section className="brew-panel">
        <p className="eyebrow">Your brew</p>
        <h1>Brew summary</h1>
        <dl className="metrics">
          <div>
            <dt>Coffee</dt>
            <dd>{session.recipe.doseGrams} g</dd>
          </div>
          <div>
            <dt>Target water</dt>
            <dd>{Math.round(session.recipe.waterGrams)} g</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{formatTime(session.elapsedMs)}</dd>
          </div>
        </dl>
        {session.mode === "timer" ? (
          <p>
            No scale measurements were recorded. Actual poured water and ratio
            are unavailable.
          </p>
        ) : (
          <>
            <p>
              Measured settled water estimate:{" "}
              {session.pouredGrams === null
                ? "unavailable"
                : `${session.pouredGrams.toFixed(1)} g`}
              .{" "}
              {session.pouredGrams !== null &&
                `Estimated ratio: 1:${(session.pouredGrams / session.recipe.doseGrams).toFixed(2)}.`}
            </p>
            <p>
              Highest settled reading; sustained load disturbances can inflate
              this estimate.
            </p>
            {session.mode === "live" && !session.baselineVerified && (
              <p>
                No verified zero baseline was available at the start. Net poured
                water and ratio are unavailable.
              </p>
            )}
            {session.mode === "live" && session.missingData && (
              <p>
                Readings are missing from part of this brew. The estimate may
                omit poured water.
              </p>
            )}
          </>
        )}
        <BrewChart model={model} />
        <button type="button" className="button" onClick={model.restart}>
          Prepare another brew
        </button>
        <Source />
      </section>
    );
  const brewing = session.phase === "brewing";
  return (
    <section className="brew-panel">
      <p className="eyebrow">
        {session.mode === "timer" ? "Timer only" : "BOOKOO live scale"}
      </p>
      <h1>
        {brewing || model.isPreviewing
          ? model.step?.label
          : session.phase === "armed"
            ? "Waiting for a pour"
            : "Ready when you are"}
      </h1>
      <p className="timer" role="timer" aria-label="Elapsed brew time">
        {formatTime(session.elapsedMs)}
      </p>
      {session.mode === "live" && <LiveControls model={model} />}
      {!brewing ? (
        <>
          <p>
            Place the V60 and server on your scale and tare after preparation.
            Pour now starts at your tap.
          </p>
          <div className="controls">
            {model.isPreviewing ? (
              <button
                type="button"
                className="button"
                onClick={model.goToStart}
              >
                Go to start
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="button"
                  disabled={
                    session.mode === "live" && model.liveState.pendingTare
                  }
                  onClick={() => dispatch("start")}
                >
                  Pour now
                </button>
                {session.mode !== "timer" && (
                  <button
                    type="button"
                    disabled={
                      !session.tared ||
                      session.phase === "armed" ||
                      (session.mode === "live" && !model.liveCanArm)
                    }
                    onClick={() => dispatch("arm")}
                  >
                    Arm auto-start
                  </button>
                )}
              </>
            )}
          </div>
          {session.phase === "armed" && (
            <p>
              Armed explicitly. The timer stays at zero until a sustained weight
              rise. You can still use Pour now.
            </p>
          )}
        </>
      ) : null}
      {(brewing || model.canPreview) && (
        <>
          {model.canPreview && (
            <p>
              Step {model.previewIndex + 1} of {session.recipe.steps.length} ·
              At {formatTime(model.displayElapsedMs)} · Preview, timer stays at
              zero.
            </p>
          )}
          <div
            className={`action-art ${model.step?.action}`}
            aria-hidden="true"
          >
            <span>◡</span>
            <span>
              {model.step?.action === "pour"
                ? "⋮"
                : model.step?.action === "swirl"
                  ? "↻"
                  : "·"}
            </span>
          </div>
          <dl className="metrics">
            <div>
              <dt>Pour to total</dt>
              <dd>
                {Math.round(
                  (model.step?.targetFraction ?? 0) * session.recipe.waterGrams,
                )}{" "}
                g
              </dd>
            </div>
            <div>
              <dt>Expected now</dt>
              <dd>{Math.round(model.expected)} g</dd>
            </div>
            {session.mode !== "timer" && (
              <div>
                <dt>Measured weight</dt>
                <dd>{model.liveWeight?.toFixed(1) ?? "—"} g</dd>
              </div>
            )}
          </dl>
          {model.step?.action === "drawdown" && (
            <p>
              About 3:00 is a guide.{" "}
              {brewing
                ? "Tap Done when the coffee has drained."
                : "Finish when the coffee has drained."}{" "}
              A scale cannot detect drawdown.
            </p>
          )}
          {brewing && (
            <button
              type="button"
              className="button"
              disabled={!model.canFinish}
              onClick={() => dispatch("done")}
            >
              Done
            </button>
          )}
        </>
      )}
      {model.canPreview && (
        <nav className="controls" aria-label="Preview brew steps">
          <button
            type="button"
            disabled={model.previewIndex === 0}
            onClick={() => model.browseStep(-1)}
          >
            ← Previous step
          </button>
          <button
            type="button"
            disabled={model.previewIndex === session.recipe.steps.length - 1}
            onClick={() => model.browseStep(1)}
          >
            Next step →
          </button>
        </nav>
      )}
      <BrewSteps model={model} />
      <BrewChart model={model} />
      <div className="cancel-control">
        <button
          type="button"
          className="cancel"
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
          Hold 1 second to cancel
        </button>
        <progress
          aria-label="Cancel hold progress"
          max="1"
          value={model.holdProgress}
        />
        <p>Release early to keep brewing. Keyboard: hold Space or Enter.</p>
      </div>
      <Source />
    </section>
  );
}
