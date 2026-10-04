import { modelName } from "@/app/liveScale";
import {
  formatRatio,
  formatTime,
  stepEyebrow,
  stepTitle,
  waterForDose,
} from "@/app/stepText";
import type { BrewModel } from "@/app/useBrew";
import type { Recipe } from "@/core/recipe";
import { ActionScene } from "./ActionScene";
import { BrewChart, BrewSteps } from "./BrewChart";
import { ProgressStrip } from "./ProgressStrip";

/** Credits the recipe's author and links to the originals. */
function Source({ recipe }: { recipe: Recipe }) {
  return (
    <p className="source">
      Recipe by {recipe.author}
      {recipe.sources.map((source) => (
        <span key={source.url}>
          {" "}
          ·{" "}
          <a href={source.url} target="_blank" rel="noreferrer">
            {source.label}
          </a>
        </span>
      ))}
    </p>
  );
}
/** Recipe choice; picking one resets the dose to that recipe's own. */
function RecipePicker({ model }: { model: BrewModel }) {
  return (
    <fieldset className="recipes">
      <legend>Recipe</legend>
      {model.recipes.map((recipe) => (
        <label
          key={recipe.id}
          className={
            recipe.id === model.recipe.id
              ? "recipe-card is-selected"
              : "recipe-card"
          }
        >
          <input
            type="radio"
            name="recipe"
            value={recipe.id}
            checked={recipe.id === model.recipe.id}
            onChange={() => model.setRecipe(recipe.id)}
          />
          <span className="recipe-name">{recipe.name}</span>
          <span className="recipe-author">by {recipe.author}</span>
          <span className="recipe-meta">
            {recipe.doseGrams} g coffee / {recipe.waterGrams} g water · Done
            around {formatTime(recipe.finishGuideMs)}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
/** Supported-scale registry, the all-devices fallback and the iOS scan list. */
function ScaleSetup({ model }: { model: BrewModel }) {
  const live = model.liveState;
  const idle = live.status === "disconnected" && !live.scanning;
  return (
    <aside className="scale-setup" aria-label="Live scale setup">
      {live.error && <p role="alert">{live.error}</p>}
      {!model.liveSupported && (
        <p className="note">
          This browser can’t reach the scale. Use Chrome on a Mac or the iOS
          app.
        </p>
      )}
      <p className="note supported-scales">
        Supported scales:{" "}
        {model.supportedScales.map((scale, index) => (
          <span key={scale.id}>
            {index > 0 && ", "}
            {modelName(scale)} · {scale.verified ? "verified" : "untested"}
          </span>
        ))}
      </p>
      {model.rememberedScale && (
        <p className="note remembered-scale">
          Remembers {model.rememberedScale.name ?? "your scale"}.{" "}
          <button type="button" onClick={model.forgetScale}>
            Forget scale
          </button>
        </p>
      )}
      {model.liveSupported && live.offerAllDevices && idle && (
        <p className="note all-devices">
          Scale not listed?{" "}
          <button type="button" onClick={model.connectAllLive}>
            Show all devices
          </button>
        </p>
      )}
      {live.scanning && (
        <p className="note scan-status" aria-live="polite">
          Scanning…{" "}
          <button type="button" onClick={model.stopScanLive}>
            Stop
          </button>
        </p>
      )}
      {live.candidates.length > 0 && (
        <ul className="candidates" aria-label="Devices in range">
          {live.candidates.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                disabled={live.status === "connecting"}
                onClick={() => model.pickCandidate(candidate.id)}
              >
                {candidate.name ?? candidate.id}
                {candidate.rssi !== undefined && ` — ${candidate.rssi} dBm`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
/** Recipe preview shown before brewing: step position, neighbours and the shape. */
function Preview({ model }: { model: BrewModel }) {
  const session = model.session;
  if (!session) return null;
  return (
    <div className="recipe-preview">
      <p className="preview-caption">
        Step {model.previewIndex + 1} of {session.recipe.steps.length} ·{" "}
        {formatTime(model.displayElapsedMs)}
      </p>
      <BrewSteps model={model} />
      <nav className="controls preview-nav" aria-label="Preview brew steps">
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
      <ProgressStrip model={model} />
    </div>
  );
}
/** Scene plus the number to watch: time left in this step. */
function StepHero({ model, brewing }: { model: BrewModel; brewing: boolean }) {
  const { step, nextStep } = model;
  if (!step) return null;
  const pour = step.action === "pour";
  return (
    <div className={`step-hero step-${step.action}`}>
      <ActionScene
        action={step.action}
        durationMs={step.action === "wait" ? 2000 : 1600}
      />
      {step.action === "drawdown" ? (
        <p className="drawdown-note">
          Done around {formatTime(model.session?.recipe.finishGuideMs ?? 0)}.{" "}
          {brewing
            ? "Tap Done when it stops dripping."
            : "Finish when it stops dripping."}
        </p>
      ) : (
        nextStep && (
          <dl className="hero-stats">
            <div>
              <dt>{pour ? "Pour for" : brewing ? "Next step in" : "Lasts"}</dt>
              <dd className="hero-number">
                {formatTime(nextStep.atMs - model.displayElapsedMs)}
              </dd>
            </div>
            {pour && (
              <div>
                <dt>Aim for now</dt>
                <dd>{Math.round(model.expected)} g</dd>
              </div>
            )}
          </dl>
        )
      )}
    </div>
  );
}
function Home({ model }: { model: BrewModel }) {
  const { recipe } = model;
  const dose = Number(model.dose);
  return (
    <>
      <h1>
        Your daily pour-over,
        <br />
        with room to focus.
      </h1>
      <section className="brew-panel">
        <div className="home-head">
          <h2>Prepare your brew</h2>
          <ActionScene action="prepare" />
        </div>
        <RecipePicker model={model} />
        <label>
          Coffee dose (g)
          <input
            type="number"
            min={recipe.minDoseGrams}
            max={recipe.maxDoseGrams}
            step="0.1"
            value={model.dose}
            onChange={(event) => model.setDose(event.target.value)}
            aria-invalid={!model.doseValid}
          />
        </label>
        {!model.doseValid && (
          <p role="alert">
            Choose a coffee dose from {recipe.minDoseGrams} to{" "}
            {recipe.maxDoseGrams} g.
          </p>
        )}
        <p>
          {model.doseValid ? waterForDose(recipe, dose) : "—"} g water ·{" "}
          {formatRatio(recipe)}. Timings stay the same at any dose; the original
          uses {recipe.doseGrams} g.
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
          <li>Grind the coffee for the recipe; make a small well.</li>
          <li>Use soft, filtered water, heated for your roast.</li>
        </ol>
        <button
          type="button"
          className="button"
          disabled={!model.doseValid}
          onClick={model.prepare}
        >
          Get ready
        </button>
        <Source recipe={recipe} />
      </section>
    </>
  );
}
function Summary({ model }: { model: BrewModel }) {
  const session = model.session;
  if (!session) return null;
  const poured = session.pouredGrams;
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
        {session.mode === "live" && (
          <div>
            <dt>Water poured</dt>
            <dd>
              {poured === null ? "Not measured" : `${poured.toFixed(1)} g`}
            </dd>
          </div>
        )}
        {session.mode === "live" && poured !== null && (
          <div>
            <dt>Ratio</dt>
            <dd>1:{(poured / session.recipe.doseGrams).toFixed(2)}</dd>
          </div>
        )}
      </dl>
      {session.mode === "timer" ? (
        <p>Timer only, so water poured wasn’t measured.</p>
      ) : (
        <>
          {!session.baselineVerified && (
            <p>
              The scale wasn’t zeroed at the start, so water poured is unknown.
            </p>
          )}
          {session.missingData && (
            <p>
              Some scale readings are missing, so water poured may read low.
            </p>
          )}
        </>
      )}
      <BrewChart model={model} />
      <button type="button" className="button" onClick={model.restart}>
        Prepare another brew
      </button>
      <Source recipe={session.recipe} />
    </section>
  );
}
export function Brew({ model }: { model: BrewModel }) {
  const { session, dispatch } = model;
  if (!session) return <Home model={model} />;
  if (session.phase === "cancelled")
    return (
      <section className="brew-panel">
        <h1>Brew cancelled</h1>
        <p>Nothing was saved. Start again whenever you’re ready.</p>
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
  if (session.phase === "completed") return <Summary model={model} />;
  const live = session.mode === "live";
  const brewing = session.phase === "brewing";
  const armed = session.phase === "armed";
  const step = model.step;
  const timer = (
    <p className="timer" role="timer" aria-label="Elapsed brew time">
      {formatTime(session.elapsedMs)}
    </p>
  );
  if (!brewing && !model.isPreviewing)
    return (
      <section className="brew-panel brew-ready">
        <div className="brew-top">
          <p className="eyebrow">{live ? "BOOKOO live scale" : "Timer only"}</p>
          {timer}
        </div>
        <h1>{armed ? "Waiting for a pour" : "Ready when you are"}</h1>
        {live && <ScaleSetup model={model} />}
        <button
          type="button"
          className="button pour-now"
          disabled={live && model.liveState.pendingTare}
          onClick={() => dispatch("start")}
        >
          Pour now
        </button>
        <div className="ready-hint">
          <ActionScene action="prepare" />
          <div>
            <p>
              {armed
                ? "Waiting for your pour. Tap Pour now anytime."
                : live
                  ? "Kettle ready? Tap Pour now as the water lands. Connect your scale and tare it first."
                  : "Kettle ready? Tap Pour now as the water lands."}
            </p>
            {live && (
              <div className="controls">
                <button
                  type="button"
                  disabled={
                    model.liveState.status !== "connected" ||
                    model.liveState.pendingTare
                  }
                  onClick={model.tareLive}
                >
                  {model.liveState.pendingTare ? "Taring…" : "Tare"}
                </button>
                <button
                  type="button"
                  disabled={!session.tared || armed || !model.liveCanArm}
                  onClick={() => dispatch("arm")}
                >
                  Start when I pour
                </button>
              </div>
            )}
          </div>
        </div>
        <Preview model={model} />
      </section>
    );
  return (
    <section
      className={`brew-panel brew-live-step${brewing ? "" : " is-preview"}`}
    >
      <div className="brew-top">
        <p className="eyebrow">
          {brewing && step ? stepEyebrow(step, session.recipe) : "Preview"}
        </p>
        {timer}
      </div>
      {live && brewing && model.liveState.error && (
        <p role="alert">{model.liveState.error}</p>
      )}
      <h1 className="step-title">
        {step ? stepTitle(step, session.recipe) : ""}
      </h1>
      <StepHero model={model} brewing={brewing} />
      {brewing ? (
        <>
          <BrewSteps model={model} />
          <ProgressStrip model={model} />
          {model.canFinish && (
            <button
              type="button"
              className="button done"
              onClick={() => dispatch("done")}
            >
              Done
            </button>
          )}
        </>
      ) : (
        <>
          <div className="controls">
            <button type="button" className="button" onClick={model.goToStart}>
              Go to start
            </button>
          </div>
          <Preview model={model} />
        </>
      )}
    </section>
  );
}
