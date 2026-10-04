import { movesDripper, stepTitle } from "@/app/stepText";
import type { BrewModel } from "@/app/useBrew";

export function chartTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function BrewChart({
  model,
}: {
  model: Pick<
    BrewModel,
    "session" | "curve" | "step" | "nextStep" | "expected" | "displayElapsedMs"
  >;
}) {
  const session = model.session;
  if (!session) return null;
  const duration = Math.max(
    session.recipe.finishGuideMs,
    Math.ceil(session.elapsedMs / 60000) * 60000,
  );
  // Swirls and stirs: readings while the dripper moves are hidden.
  const swirls = session.recipe.steps.flatMap((step, index) =>
    movesDripper(step)
      ? [
          {
            start: step.atMs,
            end: session.recipe.steps[index + 1]?.atMs ?? duration,
            grams: step.targetFraction * session.recipe.waterGrams,
            title: step.action === "stir" ? "Stir" : "Swirl",
          },
        ]
      : [],
  );
  const stirs = swirls.some((swirl) => swirl.title === "Stir");
  const moving = (atMs: number) =>
    swirls.some((swirl) => atMs >= swirl.start && atMs < swirl.end);
  const traces: { atMs: number; grams: number }[][] = [];
  let previous: (typeof session.samples)[number] | undefined;
  for (const sample of session.samples) {
    if (!moving(sample.atMs)) {
      const previousTime = previous?.atMs ?? Infinity;
      const crossesSwirl =
        previous &&
        swirls.some(
          (swirl) => previousTime < swirl.end && sample.atMs >= swirl.start,
        );
      if (
        !previous ||
        moving(previous.atMs) ||
        crossesSwirl ||
        previous.segment !== sample.segment
      )
        traces.push([]);
      traces.at(-1)?.push(sample);
    }
    previous = sample;
  }
  const weights = traces.flatMap((trace) =>
    trace.map((sample) => sample.grams),
  );
  const guidance = [
    ...model.curve,
    { atMs: duration, grams: session.recipe.waterGrams },
  ];
  const low = 0;
  const high = Math.max(session.recipe.waterGrams, ...weights);
  const increment = Math.max(50, Math.ceil((high - low) / 6 / 50) * 50);
  const minimum = Math.floor(low / increment) * increment;
  const maximum = Math.ceil(high / increment) * increment + increment;
  const x = (atMs: number) => 52 + (atMs / duration) * 400;
  const y = (grams: number) =>
    246 - ((Math.max(0, grams) - minimum) / (maximum - minimum)) * 220;
  const point = (atMs: number, grams: number) => `${x(atMs)},${y(grams)}`;
  const timeIncrement =
    duration <= 240000 ? 30000 : Math.ceil(duration / 6 / 60000) * 60000;
  const times = Array.from(
    { length: Math.floor(duration / timeIncrement) + 1 },
    (_, index) => index * timeIncrement,
  );
  const levels = Array.from(
    { length: Math.round((maximum - minimum) / increment) + 1 },
    (_, index) => minimum + index * increment,
  );
  const latest = session.samples.at(-1);
  const currentStep = model.step;
  const stepEnd = model.nextStep?.atMs ?? duration;
  return (
    <figure className="brew-chart">
      <svg
        viewBox="0 0 480 300"
        role="img"
        aria-label={
          session.mode === "timer"
            ? "Expected water guidance curve"
            : "Expected and measured water curves"
        }
      >
        <title>Water over time · recommendation and brew progress</title>
        <rect
          className="chart-surface"
          x="52"
          y="26"
          width="400"
          height="220"
        />
        {currentStep && (
          <rect
            className="chart-step"
            data-testid="current-step-band"
            x={x(currentStep.atMs)}
            y="26"
            width={x(stepEnd) - x(currentStep.atMs)}
            height="220"
          />
        )}
        {swirls.map((swirl) => (
          <g key={swirl.start} className="chart-swirl" data-testid="swirl-band">
            <title>{`${swirl.title} · readings hidden while moving`}</title>
            <rect
              x={x(swirl.start)}
              y="26"
              width={x(swirl.end) - x(swirl.start)}
              height="220"
            />
            <line
              x1={x(swirl.start)}
              x2={x(swirl.end)}
              y1={y(swirl.grams)}
              y2={y(swirl.grams)}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
        <g className="chart-grid">
          {times.map((time) => (
            <line
              key={time}
              x1={x(time)}
              x2={x(time)}
              y1="26"
              y2="250"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {levels.map((grams) => (
            <line
              key={grams}
              x1="48"
              x2="452"
              y1={y(grams)}
              y2={y(grams)}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        <g className="chart-stages">
          {session.recipe.steps.map((step) => (
            <line
              key={step.atMs}
              data-testid="stage-boundary"
              className={movesDripper(step) ? "chart-stage-swirl" : undefined}
              x1={x(step.atMs)}
              x2={x(step.atMs)}
              y1="26"
              y2="246"
              vectorEffect="non-scaling-stroke"
            >
              <title>{`${chartTime(step.atMs)} · ${stepTitle(step, session.recipe)}`}</title>
            </line>
          ))}
        </g>
        <g className="chart-ticks">
          {times.map((time) => (
            <text key={time} x={x(time)} y="268" textAnchor="middle">
              {chartTime(time)}
            </text>
          ))}
          {levels.map((grams) => (
            <text key={grams} x="42" y={y(grams) + 2.5} textAnchor="end">
              {grams}
            </text>
          ))}
          <text x="52" y="17">
            Water (g)
          </text>
          <text x="252" y="292" textAnchor="middle">
            Time (min:sec)
          </text>
        </g>
        <polyline
          className="chart-recommendation"
          points={guidance
            .map((sample) => point(sample.atMs, sample.grams))
            .join(" ")}
          fill="none"
          strokeWidth="0.5"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
        {session.mode !== "timer" && (
          <g>
            {traces.map((trace) => (
              <polyline
                key={trace[0]?.atMs}
                data-testid="actual-series"
                className="chart-actual"
                points={trace
                  .map((sample) => point(sample.atMs, sample.grams))
                  .join(" ")}
                fill="none"
                strokeWidth="0.75"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        )}
        <line
          className="chart-now"
          x1={x(model.displayElapsedMs)}
          x2={x(model.displayElapsedMs)}
          y1="26"
          y2="246"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          data-testid="recommendation-marker"
          className="chart-marker chart-recommendation"
          cx={x(model.displayElapsedMs)}
          cy={y(model.expected)}
          r="3.5"
        />
        {session.mode !== "timer" &&
          session.lastSample &&
          latest &&
          !moving(latest.atMs) &&
          !moving(model.displayElapsedMs) && (
            <circle
              data-testid="actual-marker"
              className="chart-marker chart-actual"
              cx={x(latest.atMs)}
              cy={y(latest.grams)}
              r="0.875"
              strokeWidth="0"
            />
          )}
      </svg>
      <figcaption>
        <span className="chart-key recommendation-key">Guide</span>
        {session.mode !== "timer" && (
          <span className="chart-key actual-key">Scale</span>
        )}
        <span className="chart-key swirl-key">
          {stirs ? "Swirl or stir" : "Swirl"}
        </span>
      </figcaption>
    </figure>
  );
}
