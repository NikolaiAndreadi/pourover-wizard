import { type CSSProperties, useId } from "react";
import { formatTime, movesDripper, stepTitle } from "@/app/stepText";
import type { BrewModel } from "@/app/useBrew";
import type { ScaleSample } from "@/core/scale";

const WIDTH = 400;
const HEIGHT = 56;
const TOP = 9;
/** Inner margins keep the marker dot clear of the plot edges and axis labels. */
const SIDE = 7;
const BOTTOM = 10;

type StripModel = Pick<
  BrewModel,
  "session" | "curve" | "step" | "nextStep" | "expected" | "displayElapsedMs"
>;
const ZOOM_HEIGHT = 160;

export function showsPourZoom({ session, step, nextStep }: StripModel) {
  return (
    session?.mode === "live" &&
    (session.phase === "brewing" || session.phase === "completed") &&
    step?.action === "pour" &&
    nextStep !== null
  );
}

/**
 * Live pours only: zooms into the current pour's time and gram range, with the
 * ideal ramp dashed and measured weight solid. Readings during swirls and
 * stirs are hidden.
 */
export function PourZoom({ model }: { model: StripModel }) {
  const { session, step, nextStep } = model;
  if (!session || !step || !nextStep) return null;
  const { recipe } = session;
  const index = recipe.steps.indexOf(step);
  const start = step.atMs;
  const end = nextStep.atMs;
  const from =
    (recipe.steps[index - 1]?.targetFraction ?? 0) * recipe.waterGrams;
  const to = step.targetFraction * recipe.waterGrams;
  const swirling = (atMs: number) =>
    recipe.steps.some(
      (item, position) =>
        movesDripper(item) &&
        atMs >= item.atMs &&
        atMs < (recipe.steps[position + 1]?.atMs ?? Infinity),
    );
  const shown = session.samples.filter(
    (sample) =>
      sample.atMs >= start && sample.atMs <= end && !swirling(sample.atMs),
  );
  const traces: ScaleSample[][] = [];
  shown.forEach((sample, position) => {
    if (position === 0 || shown[position - 1]?.segment !== sample.segment)
      traces.push([]);
    traces.at(-1)?.push(sample);
  });
  const headroom = Math.max(5, (to - from) * 0.15);
  const low = from - headroom;
  const high = to + headroom;
  const x = (atMs: number) =>
    SIDE + ((atMs - start) / (end - start)) * (WIDTH - 2 * SIDE);
  const outside = (grams: number) => grams < low || grams > high;
  const y = (grams: number) =>
    ZOOM_HEIGHT -
    ((Math.min(high, Math.max(low, grams)) - low) / (high - low)) * ZOOM_HEIGHT;
  const latest = shown.at(-1);
  // Like the full chart, mark the newest recorded reading while readings are fresh.
  const fresh =
    session.phase === "brewing" &&
    latest !== undefined &&
    session.lastSample !== null &&
    latest === session.samples.at(-1);
  return (
    <div className="pour-zoom" data-testid="pour-zoom">
      <div className="pour-zoom-plot">
        <svg
          viewBox={`0 0 ${WIDTH} ${ZOOM_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`This pour: ideal ramp to ${Math.round(to)} g and your measured weight`}
        >
          <line
            className="zoom-target"
            x1="0"
            x2={WIDTH}
            y1={y(to)}
            y2={y(to)}
            vectorEffect="non-scaling-stroke"
          />
          <line
            className="zoom-now"
            x1={x(model.displayElapsedMs)}
            x2={x(model.displayElapsedMs)}
            y1="0"
            y2={ZOOM_HEIGHT}
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            data-testid="pour-zoom-expected"
            className="zoom-expected"
            points={`${x(start)},${y(from)} ${x(end)},${y(to)}`}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
          {traces.map((trace) => (
            <polyline
              key={trace[0]?.atMs}
              data-testid="pour-zoom-actual"
              className="zoom-actual"
              points={trace
                .map((sample) => `${x(sample.atMs)},${y(sample.grams)}`)
                .join(" ")}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {fresh && (
          <span
            className={
              outside(latest.grams) ? "zoom-dot is-clipped" : "zoom-dot"
            }
            data-testid="pour-zoom-latest"
            style={
              {
                left: `${(x(latest.atMs) / WIDTH) * 100}%`,
                top: `${(y(latest.grams) / ZOOM_HEIGHT) * 100}%`,
              } as CSSProperties
            }
          />
        )}
      </div>
      <div className="pour-zoom-key">
        <span>
          {formatTime(start)} · {Math.round(from)} g
        </span>
        <span className="zoom-key-expected">Ideal</span>
        <span className="zoom-key-actual">Scale</span>
        <span>
          {formatTime(end)} · {Math.round(to)} g
        </span>
      </div>
    </div>
  );
}

/** Compact recipe shape with step boundaries and the current position. */
export function ProgressStrip({ model }: { model: StripModel }) {
  const clip = useId();
  const session = model.session;
  if (!session) return null;
  const { recipe } = session;
  const duration = Math.max(
    recipe.finishGuideMs,
    Math.ceil(session.elapsedMs / 60000) * 60000,
  );
  const x = (atMs: number) =>
    SIDE + (Math.min(atMs, duration) / duration) * (WIDTH - 2 * SIDE);
  const y = (grams: number) =>
    HEIGHT -
    BOTTOM -
    ((HEIGHT - TOP - BOTTOM) * Math.max(0, grams)) / recipe.waterGrams;
  const shape = [
    ...model.curve,
    { atMs: duration, grams: recipe.waterGrams },
  ].filter((point) => point.atMs <= duration);
  const area = `M${SIDE},${HEIGHT} ${shape
    .map((point) => `L${x(point.atMs)},${y(point.grams)}`)
    .join(" ")} L${WIDTH - SIDE},${HEIGHT} Z`;
  const now = x(model.displayElapsedMs);
  const step = model.step;
  const stepEnd = model.nextStep?.atMs ?? duration;
  const zoomed = showsPourZoom(model);
  const marker = {
    left: `${(now / WIDTH) * 100}%`,
    top: `${(y(model.expected) / HEIGHT) * 100}%`,
  } as CSSProperties;
  return (
    <figure className="progress-strip" data-testid="progress-strip">
      <div className="progress-plot">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Recipe progress"
        >
          <title>Water over time · the dot is where you should be now</title>
          <clipPath id={clip}>
            <rect x="0" y="0" width={now} height={HEIGHT} />
          </clipPath>
          {step && (
            <rect
              className={zoomed ? "strip-step is-zoomed" : "strip-step"}
              x={x(step.atMs)}
              y="0"
              width={x(stepEnd) - x(step.atMs)}
              height={HEIGHT}
            />
          )}
          {recipe.steps.map((item, index) =>
            movesDripper(item) ? (
              <rect
                key={item.atMs}
                className="strip-swirl"
                x={x(item.atMs)}
                y="0"
                width={
                  x(recipe.steps[index + 1]?.atMs ?? duration) - x(item.atMs)
                }
                height={HEIGHT}
              />
            ) : null,
          )}
          <path className="strip-shape" d={area} />
          <path className="strip-done" d={area} clipPath={`url(#${clip})`} />
          {recipe.steps.map((item) => (
            <line
              key={item.atMs}
              data-testid="progress-boundary"
              className="strip-boundary"
              x1={x(item.atMs)}
              x2={x(item.atMs)}
              y1="0"
              y2={HEIGHT}
              vectorEffect="non-scaling-stroke"
            >
              <title>{`${formatTime(item.atMs)} · ${stepTitle(item, recipe)}`}</title>
            </line>
          ))}
          <line
            className="strip-now"
            x1={now}
            x2={now}
            y1="0"
            y2={HEIGHT}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          className="strip-marker"
          data-testid="progress-marker"
          style={marker}
        />
      </div>
      <figcaption>
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </figcaption>
      {zoomed && <PourZoom model={model} />}
    </figure>
  );
}
