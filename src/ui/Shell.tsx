import { useEffect } from "react";
import { modelName } from "@/app/liveScale";
import type { BrewModel } from "@/app/useBrew";
import type { ThemeModel } from "@/app/useTheme";
import { Brew } from "./Brew";
import { SessionBar } from "./SessionBar";

const THEME_LABEL = { system: "System", light: "Light", dark: "Dark" };
export function Shell({
  brew,
  offline,
  theme,
}: {
  brew: BrewModel;
  offline: { offlineReady: boolean; updateReady: boolean };
  theme: ThemeModel;
}) {
  const active = Boolean(brew.session);
  const home = !active && !brew.historyOpen && !brew.reviewing;
  useEffect(() => {
    if (!active || !window.matchMedia("(max-width: 600px)").matches) return;
    document.getElementById("content")?.scrollIntoView({ block: "start" });
  }, [active]);
  return (
    <div
      className={`shell ${active ? "active-session" : ""}`}
      data-offline-ready={offline.offlineReady}
    >
      <button
        type="button"
        className="skip"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("content")?.focus();
        }}
      >
        Skip to content
      </button>
      <header>
        <a
          className="brand"
          href="#/"
          onClick={(event) => {
            event.preventDefault();
            const phase = brew.session?.phase;
            if (brew.reviewing || brew.historyOpen) brew.closeHistory();
            else if (phase === "preparation" || phase === "armed")
              brew.restart();
          }}
        >
          Pourover Wizard<span>V60 brew guide</span>
        </a>
        <SessionBar model={brew} />
      </header>
      <main id="content" tabIndex={-1}>
        <Brew model={brew} />
      </main>
      {offline.updateReady ? (
        <p role="status" className="offline-status">
          Update ready. After brewing, close all app tabs and windows, then
          reopen to use it.
        </p>
      ) : null}
      {home && (
        <footer>
          <div className="footer-scales">
            <p>Supported scales:</p>
            <ul>
              {brew.supportedScales.map((scale) => (
                <li key={scale.id}>
                  {modelName(scale)} ·{" "}
                  {scale.verified ? "verified" : "untested"}
                </li>
              ))}
            </ul>
          </div>
          <a
            href="https://github.com/NikolaiAndreadi/pourover-wizard"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a
            href="https://www.linkedin.com/in/andreadi-n"
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn
          </a>
          <button
            type="button"
            className="theme-toggle"
            onClick={theme.cycleTheme}
          >
            Theme · {THEME_LABEL[theme.theme]}
          </button>
        </footer>
      )}
    </div>
  );
}
