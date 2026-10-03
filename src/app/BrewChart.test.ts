import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { BrewModel } from "@/app/useBrew";
import { createSession } from "@/core/engine";
import { expectedPoints, expectedWeight, stepAt } from "@/core/recipe";
import { BrewChart } from "@/ui/BrewChart";

function render(samples: { atMs: number; grams: number }[], elapsedMs: number) {
  const session = {
    ...createSession(15, "live"),
    phase: "brewing" as const,
    elapsedMs,
    samples,
    lastSample: samples.at(-1) ?? null,
  };
  const original = structuredClone(session);
  const model: Pick<
    BrewModel,
    "session" | "curve" | "step" | "nextStep" | "expected" | "displayElapsedMs"
  > = {
    session,
    displayElapsedMs: elapsedMs,
    step: stepAt(session.recipe, elapsedMs),
    nextStep:
      session.recipe.steps.find((step) => step.atMs > elapsedMs) ?? null,
    expected: expectedWeight(session.recipe, elapsedMs),
    curve: expectedPoints(session.recipe, elapsedMs),
  };
  const markup = renderToStaticMarkup(createElement(BrewChart, { model }));
  expect(session).toEqual(original);
  return markup;
}

function traces(markup: string) {
  return Array.from(
    markup.matchAll(/<polyline[^>]*data-testid="actual-series"[^>]*>/g),
    (match) => match[0],
  );
}

test("swirl movement is hidden from actual curves and scale without changing raw measurements", () => {
  const samples = [
    { atMs: 9000, grams: 45 },
    { atMs: 11000, grams: 9000 },
    { atMs: 16000, grams: 50 },
    { atMs: 119000, grams: 245 },
    { atMs: 121000, grams: -9000 },
    { atMs: 126000, grams: 250 },
  ];
  const markup = render(samples, 126000);
  expect(traces(markup)).toHaveLength(3);
  expect(markup.match(/data-testid="swirl-band"/g)).toHaveLength(2);
  expect(markup).toContain('class="chart-key swirl-key">Swirl</span>');
  expect(markup).not.toContain(">9000<");
  expect(markup).not.toContain(">-9000<");
  expect(markup).toContain('data-testid="actual-marker"');
  for (const elapsedMs of [11000, 121000]) {
    expect(
      render(
        samples.filter((sample) => sample.atMs <= elapsedMs),
        elapsedMs,
      ),
    ).not.toContain('data-testid="actual-marker"');
  }
});

test("traces do not bridge swirl intervals even without samples during movement", () => {
  expect(
    traces(
      render(
        [
          { atMs: 9900, grams: 50 },
          { atMs: 15100, grams: 50 },
          { atMs: 119900, grams: 250 },
          { atMs: 125100, grams: 250 },
        ],
        126000,
      ),
    ),
  ).toHaveLength(3);
});

test("negative readings stay at zero while positive readings may extend the chart", () => {
  const markup = render(
    [
      { atMs: 6000, grams: -12.2 },
      { atMs: 8000, grams: 400 },
    ],
    8000,
  );
  expect(markup).not.toContain(">-100</text>");
  expect(traces(markup)[0]).toContain("65.33333333333333,246");
  expect(markup).toContain(">500</text>");
  expect(traces(markup)).toHaveLength(1);
});

test("negative readings do not change chart scale or mutate raw samples", () => {
  const negative = render([{ atMs: 6000, grams: -9000 }], 6000);
  const zero = render([{ atMs: 6000, grams: 0 }], 6000);
  expect(negative).toEqual(zero);
});

test("actual point is small and painted above recommendation, with each stage separated", () => {
  const markup = render([{ atMs: 6000, grams: 30 }], 6000);
  const marker = markup.match(
    /<circle[^>]*data-testid="actual-marker"[^>]*>/,
  )?.[0];
  expect(marker).toContain('r="0.875"');
  expect(marker).toContain('stroke-width="0"');
  expect(markup.indexOf('data-testid="actual-marker"')).toBeGreaterThan(
    markup.indexOf('data-testid="recommendation-marker"'),
  );
  expect(markup.match(/data-testid="stage-boundary"/g)).toHaveLength(12);
  expect(markup).toContain('class="chart-stage-swirl"');
});
