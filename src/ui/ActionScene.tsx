import type { CSSProperties } from "react";
import {
  type Frame,
  PALETTE,
  SCENE_SIZE,
  type SceneName,
  scenes,
} from "./sceneFrames";

export type { SceneName } from "./sceneFrames";

interface Run {
  x: number;
  y: number;
  width: number;
  className: string;
}
/** Merges horizontal runs of one colour into a single cell-high rectangle. */
function runs(frame: Frame): Run[] {
  return frame.flatMap((row, y) => {
    const found: Run[] = [];
    let x = 0;
    while (x < row.length) {
      const ink = row[x] ?? ".";
      let end = x + 1;
      while (row[end] === ink) end++;
      if (ink in PALETTE)
        found.push({
          x,
          y,
          width: end - x,
          className: PALETTE[ink as keyof typeof PALETTE],
        });
      x = end;
    }
    return found;
  });
}
const reels = Object.fromEntries(
  Object.entries(scenes).map(([name, frames]) => [name, frames.map(runs)]),
) as Record<SceneName, Run[][]>;
const TITLES: Record<SceneName, string> = {
  prepare: "Get ready: kettle, rinsed cone on the server, scale tared",
  pour: "Pour water in small circles over the coffee",
  swirl: "Swirl the cone gently",
  stir: "Stir the coffee once each way with a spoon",
  wait: "Wait while the coffee steeps",
  drawdown: "Let the coffee drain into the server",
};
/** Loops 32×32 pixel frames as a film strip; reduced motion shows the first frame. */
export function ActionScene({
  action,
  durationMs = 1600,
  still = false,
}: {
  action: SceneName;
  durationMs?: number;
  /** Shows the first frame only, without animation. */
  still?: boolean;
}) {
  const frames = still ? reels[action].slice(0, 1) : reels[action];
  const style = {
    "--frames": frames.length,
    "--scene-duration": `${durationMs}ms`,
  } as CSSProperties;
  return (
    <div
      className={`action-scene${still ? " is-still" : ""}`}
      aria-hidden="true"
      data-scene={action}
    >
      <svg
        key={action}
        viewBox={`0 0 ${SCENE_SIZE} ${SCENE_SIZE}`}
        shapeRendering="crispEdges"
      >
        <title>{TITLES[action]}</title>
        <g
          className={frames.length > 1 ? "scene-reel" : undefined}
          style={style}
        >
          {frames.map((frame, index) => (
            <g
              key={`frame-${index}`}
              transform={`translate(${index * SCENE_SIZE} 0)`}
            >
              {frame.map((run) => (
                <rect
                  key={`${run.x},${run.y}`}
                  x={run.x}
                  y={run.y}
                  width={run.width}
                  height="1"
                  className={run.className}
                />
              ))}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
