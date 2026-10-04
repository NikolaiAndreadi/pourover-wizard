import { paceLabels } from "@/app/pace";
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
import { BrewChart } from "./BrewChart";
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
      <nav className="controls preview-nav" aria-label="Preview brew steps">
        <button
          type="button"
          disabled={!model.isPreviewing}
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
      {model.isPreviewing && (
        <button
          type="button"
          className="button go-to-start"
          onClick={model.goToStart}
        >
          Go to start
        </button>
      )}
    </div>
  );
}
/** Now on the left with the number to watch; the next step, stilled and muted, on the right. */
function StepPanes({ model, brewing }: { model: BrewModel; brewing: boolean }) {
  const { session, step, nextStep } = model;
  if (!session || !step) return null;
  const pour = step.action === "pour";
  const remaining = nextStep
    ? formatTime(nextStep.atMs - model.displayElapsedMs)
    : null;
  return (
    <ol className="step-panes" aria-label="Brew steps" key={step.atMs}>
      <li className={`step-now step-${step.action}`} aria-current="step">
        <span className="pane-label">Now</span>
        <h1 className="step-title">{stepTitle(step, session.recipe)}</h1>
        <ActionScene
          action={step.action}
          durationMs={step.action === "wait" ? 2000 : 1600}
        />
        {step.action === "drawdown" ? (
          <p className="drawdown-note">
            Done around {formatTime(session.recipe.finishGuideMs)}.{" "}
            {brewing
              ? "Tap Done when it stops dripping."
              : "Finish when it stops dripping."}
          </p>
        ) : (
          remaining && (
            <>
              <dl className="hero-stats">
                <div>
                  <dt>
                    {pour ? "Pour for" : brewing ? "Next step in" : "Lasts"}
                  </dt>
                  <dd className="hero-number">{remaining}</dd>
                </div>
              </dl>
              {pour && (
                <dl className="pour-stats" aria-label="Pour guidance">
                  <div className="aim">
                    <dt>Aim for</dt>
                    <dd>{Math.round(model.expected)} g</dd>
                  </div>
                  {brewing && session.mode === "live" && (
                    <div className="actual">
                      <dt>Actual</dt>
                      <dd>
                        {model.liveWeight === null ||
                        model.liveWeight === undefined
                          ? "—"
                          : `${model.liveWeight.toFixed(1)} g`}
                      </dd>
                    </div>
                  )}
                  {model.pace && (
                    <div className={`pace pace-${model.pace}`}>
                      <dt>Pace</dt>
                      <dd>{paceLabels[model.pace]}</dd>
                    </div>
                  )}
                </dl>
              )}
            </>
          )
        )}
        {!brewing && step.hint && <p className="step-hint">{step.hint}</p>}
      </li>
      <li className="step-next">
        <span className="pane-label">
          {remaining ? `Next · in ${remaining}` : "Next"}
        </span>
        {nextStep ? (
          <>
            <h2 className="next-title">
              {stepTitle(nextStep, session.recipe)}
            </h2>
            <ActionScene action={nextStep.action} still />
          </>
        ) : (
          <p className="next-note">Finish when it stops dripping</p>
        )}
      </li>
    </ol>
  );
}
function Home({ model }: { model: BrewModel }) {
  const { recipe } = model;
  const dose = Number(model.dose);
  return (
    <>
      <section className="brew-panel">
        <div className="home-head">
          <h1>Prepare your brew</h1>
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
        <button
          type="button"
          className="button get-ready"
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
    <section className="brew-panel brew-summary">
      <h1 className="eyebrow summary-title">Your brew</h1>
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
        {poured !== null && (
          <>
            <div>
              <dt>Water poured</dt>
              <dd>{poured.toFixed(1)} g</dd>
            </div>
            <div>
              <dt>Ratio</dt>
              <dd>1:{(poured / session.recipe.doseGrams).toFixed(2)}</dd>
            </div>
          </>
        )}
      </dl>
      <BrewChart model={model} />
      <button type="button" className="button restart" onClick={model.restart}>
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
        <button
          type="button"
          className="button restart"
          onClick={model.restart}
        >
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
        <button
          type="button"
          className="button restart"
          onClick={model.restart}
        >
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
          <p className="eyebrow">{live ? "Scale assist" : "Timer only"}</p>
          {timer}
        </div>
        <h1>{armed ? "Waiting for a pour" : "Ready when you are"}</h1>
        <ScaleSetup model={model} />
        <div className="ready-hint">
          <ActionScene action="prepare" />
          <div>
            <ol>
              <li>Rinse the paper and preheat the V60.</li>
              <li>Grind the coffee for the recipe; make a small well.</li>
              <li>Use soft, filtered water, heated for your roast.</li>
            </ol>
            <p>
              <strong>
                {armed
                  ? "Waiting for your pour. Tap Start now anytime."
                  : model.liveState.status === "connecting"
                    ? "Connecting to the scale; Start now unlocks once it’s done."
                    : "Kettle ready? Tap Start now as the water lands."}
              </strong>
            </p>
          </div>
        </div>
        <div className={`start-row${live ? " is-live" : ""}`}>
          <button
            type="button"
            className="button start-now"
            disabled={
              model.liveState.status === "connecting" ||
              (live && model.liveState.pendingTare)
            }
            onClick={() => dispatch("start")}
          >
            Start now
          </button>
          {live && (
            <button
              type="button"
              className="button auto-start"
              disabled={!session.tared || armed || !model.liveCanArm}
              onClick={() => dispatch("arm")}
            >
              {armed ? "Waiting for weight…" : "Auto start on weight change"}
            </button>
          )}
        </div>
        {live &&
          model.liveState.status === "connected" &&
          !armed &&
          !model.liveCanArm && (
            <p className="note arm-hint">
              {session.tared
                ? "Waiting for a steady zero on the scale…"
                : "Auto start needs a tared scale: tap the weight in the header to tare."}
            </p>
          )}
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
      <StepPanes model={model} brewing={brewing} />
      {brewing ? (
        <>
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
        <Preview model={model} />
      )}
    </section>
  );
}
