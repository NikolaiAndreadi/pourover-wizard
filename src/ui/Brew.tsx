import { paceLabels } from "@/app/pace";
import {
  formatRatio,
  formatTime,
  stepEyebrow,
  stepTitle,
  waterForDose,
} from "@/app/stepText";
import type { BrewModel } from "@/app/useBrew";
import type { Recipe, RecipeStep } from "@/core/recipe";
import { ActionScene } from "./ActionScene";
import { BrewChart } from "./BrewChart";
import { HoldButton } from "./HoldButton";
import { PourZoom, ProgressStrip, showsPourZoom } from "./ProgressStrip";

/** Saved brews complete in UTC and are shown in the viewer's local time. */
const localTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

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
function ScaleSetup({ model }: { model: BrewModel }) {
  return (
    <aside className="scale-setup" aria-label="Live scale setup">
      {!model.liveSupported && (
        <p className="note">
          This browser can’t reach the scale. Use Chrome on a Mac or the iOS
          app.
        </p>
      )}
      <ScanResults model={model} />
    </aside>
  );
}
const hasScanResults = ({ liveState: live }: BrewModel) =>
  Boolean(live.error) || live.scanning || live.candidates.length > 0;
function ScanResults({ model }: { model: BrewModel }) {
  const live = model.liveState;
  return (
    <>
      {live.error && <p role="alert">{live.error}</p>}
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
    </>
  );
}
/** Previous/next through the shown session's steps; back from the first step leaves browsing. */
function StepNav({ model, label }: { model: BrewModel; label: string }) {
  const session = model.session;
  if (!session) return null;
  return (
    <nav className="controls preview-nav" aria-label={label}>
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
  );
}
function Preview({ model }: { model: BrewModel }) {
  const session = model.session;
  if (!session) return null;
  return (
    <div className="recipe-preview">
      <p className="preview-caption">
        Step {model.previewIndex + 1} of {session.recipe.steps.length} ·{" "}
        {formatTime(model.displayElapsedMs)}
      </p>
      <StepNav model={model} label="Preview brew steps" />
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
function stepCue(model: BrewModel, step: RecipeStep): string | null {
  const count = model.nextPour ? Math.ceil(model.nextPour.inMs / 1000) : 0;
  if (count >= 1 && count <= 3) return String(count);
  if (model.displayElapsedMs - step.atMs >= 1000) return null;
  if (step.action === "pour") return "go";
  const steps = model.session?.recipe.steps ?? [];
  return steps[steps.indexOf(step) - 1]?.action === "pour" ? "done" : null;
}
function StepPanes({ model, brewing }: { model: BrewModel; brewing: boolean }) {
  const { session, step, nextStep } = model;
  if (!session || !step) return null;
  const pour = step.action === "pour";
  const remaining = nextStep
    ? formatTime(nextStep.atMs - model.displayElapsedMs)
    : null;
  const cue = brewing ? stepCue(model, step) : null;
  return (
    <ol className="step-panes" aria-label="Brew steps" key={step.atMs}>
      <li
        className={`step-now step-${step.action}`}
        aria-current="step"
        data-pace={pour && brewing ? (model.pace ?? undefined) : undefined}
        data-cue={cue ?? undefined}
      >
        {cue && (
          <span
            className={`cue cue-${cue === "go" || cue === "done" ? cue : "count"}`}
            key={cue}
            aria-hidden="true"
          />
        )}
        <span className="pane-label">Now</span>
        <h1 className="step-title">{stepTitle(step, session.recipe)}</h1>
        <ActionScene
          action={step.action}
          durationMs={step.action === "wait" ? 2000 : 1600}
        />
        {step.action === "drawdown" ? (
          <dl className="hero-stats">
            <div>
              <dt>Done around</dt>
              <dd className="hero-number">
                {formatTime(session.recipe.finishGuideMs)}
              </dd>
            </div>
          </dl>
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
              {pour && brewing && (
                <dl className="pour-stats" aria-label="Pour guidance">
                  <div className="aim">
                    <dt>Aim for</dt>
                    <dd>{Math.round(model.expected)} g</dd>
                  </div>
                  {session.mode === "live" && (
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
        {step.hint && <p className="step-hint">{step.hint}</p>}
      </li>
      <li className="step-next">
        <span className="pane-label">
          {remaining ? `Next · in ${remaining}` : "Next"}
        </span>
        <h2 className="next-title">
          {nextStep ? stepTitle(nextStep, session.recipe) : "Finish"}
        </h2>
        {nextStep && <ActionScene action={nextStep.action} still />}
      </li>
    </ol>
  );
}
function Home({ model }: { model: BrewModel }) {
  const { recipe } = model;
  const dose = Number(model.dose);
  return (
    <section className="brew-panel">
      <div className="home-head">
        <h1>Prepare your brew</h1>
        <ActionScene action="prepare" durationMs={2400} />
      </div>
      {hasScanResults(model) && (
        <aside className="scale-setup" aria-label="Live scale setup">
          <ScanResults model={model} />
        </aside>
      )}
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
      <p className="dose-note">
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
      <button
        type="button"
        className="brew-history-link"
        onClick={model.showHistory}
      >
        Brew history
      </button>
      <Source recipe={recipe} />
    </section>
  );
}
function History({ model }: { model: BrewModel }) {
  return (
    <section className="brew-panel brew-history">
      <h1>Brew history</h1>
      {model.history.length === 0 ? (
        <p>No brews yet.</p>
      ) : (
        <ul className="history-list">
          {model.history.map((brew) => {
            const when = localTime(brew.completedAt);
            return (
              <li key={brew.id}>
                <button
                  type="button"
                  className="history-row"
                  onClick={() => model.openBrew(brew.id)}
                >
                  <span className="history-name">{brew.recipe.name}</span>
                  <span className="history-when">{when}</span>
                  <span className="history-meta">
                    {brew.recipe.doseGrams} g coffee ·{" "}
                    {formatTime(brew.elapsedMs)} ·{" "}
                    {brew.pouredGrams === null
                      ? `${Math.round(brew.recipe.waterGrams)} g water`
                      : `${brew.pouredGrams.toFixed(1)} g poured`}
                  </span>
                </button>
                <button
                  type="button"
                  className="history-delete"
                  aria-label={`Delete brew from ${when}`}
                  onClick={() => model.deleteBrew(brew.id)}
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="controls history-actions">
        {model.history.length > 0 && (
          <HoldButton className="clear-history" onHold={model.clearHistory}>
            Hold to clear history
          </HoldButton>
        )}
        <button
          type="button"
          className="button restart"
          onClick={model.closeHistory}
        >
          Back
        </button>
      </div>
    </section>
  );
}
function Summary({ model }: { model: BrewModel }) {
  const { session, step } = model;
  if (!session || !step) return null;
  const poured = session.pouredGrams;
  return (
    <section
      className={`brew-panel brew-summary${model.isPreviewing ? " is-preview" : ""}`}
    >
      {model.isPreviewing ? (
        <>
          <p className="eyebrow step-caption">
            Step {model.previewIndex + 1} of {session.recipe.steps.length} ·{" "}
            {formatTime(model.displayElapsedMs)}
          </p>
          <StepPanes model={model} brewing={false} />
        </>
      ) : (
        <>
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
        </>
      )}
      <StepNav model={model} label="Browse brew steps" />
      <BrewChart model={model} />
      {model.isPreviewing && showsPourZoom(model) && <PourZoom model={model} />}
      {model.isPreviewing && (
        <button
          type="button"
          className="button go-to-start"
          onClick={model.goToStart}
        >
          Go to start
        </button>
      )}
      {model.reviewing ? (
        <button
          type="button"
          className="button restart"
          onClick={model.closeBrew}
        >
          Back
        </button>
      ) : (
        <button
          type="button"
          className="button restart"
          onClick={model.restart}
        >
          Prepare another brew
        </button>
      )}
      <Source recipe={session.recipe} />
    </section>
  );
}
export function Brew({ model }: { model: BrewModel }) {
  const { session, dispatch } = model;
  if (!session)
    return model.historyOpen ? (
      <History model={model} />
    ) : (
      <Home model={model} />
    );
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
          <ActionScene action="prepare" durationMs={2400} />
          <div>
            <ol>
              <li>Rinse the paper and preheat the V60.</li>
              <li>Grind the coffee for the recipe; make a small well.</li>
              <li>Use soft, filtered water, heated for your roast.</li>
              <li>
                Preview the recipe with the step arrows or your arrow keys.
              </li>
              <li>Kettle ready? Let’s brew some coffee.</li>
            </ol>
            {model.liveState.status === "connecting" && (
              <p>
                <strong>
                  Connecting to the scale; Start now unlocks once it’s done.
                </strong>
              </p>
            )}
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
              aria-pressed={armed || model.armPending}
              disabled={model.liveState.status !== "connected"}
              onClick={model.toggleArm}
            >
              {armed ? (
                <>
                  Auto start on weight change armed <br />
                  Press to unarm
                </>
              ) : model.armPending ? (
                model.liveState.pendingTare ? (
                  "Taring…"
                ) : (
                  "Waiting for a steady zero…"
                )
              ) : (
                <>
                  Tare and auto start <br />
                  on weight change
                </>
              )}
            </button>
          )}
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
