import { useEffect } from "react";
import { modelName } from "@/app/liveScale";
import type { BrewModel } from "@/app/useBrew";
import type { SoundAssistModel } from "@/app/useSoundAssist";
import type { ThemeModel } from "@/app/useTheme";
import { Brew } from "./Brew";
import { SessionBar } from "./SessionBar";

const THEME_LABEL = { system: "System", light: "Light", dark: "Dark" };
export function Shell({
  brew,
  offline,
  theme,
  sound,
}: {
  brew: BrewModel;
  offline: { offlineReady: boolean; updateReady: boolean };
  theme: ThemeModel;
  sound: SoundAssistModel;
}) {
  const active = Boolean(brew.session);
  const phase = brew.session?.phase;
  const brewing = phase === "armed" || phase === "brewing";
  const home = !active && !brew.historyOpen && !brew.reviewing;
  useEffect(() => {
    if (active || brewing) window.scrollTo(0, 0);
  }, [active, brewing]);
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
      {!brewing && (
        <header>
          {/* biome-ignore lint/a11y/useValidAnchor: a real link home that also resets in-app state */}
          <a
            className="brand"
            href="#/"
            onClick={(event) => {
              event.preventDefault();
              if (brew.reviewing || brew.historyOpen) brew.closeHistory();
              else if (active) brew.restart();
            }}
          >
            Pourover Wizard<span>V60 brew guide</span>
          </a>
          {!active && <SessionBar model={brew} />}
        </header>
      )}
      <main
        id="content"
        tabIndex={-1}
        className={
          phase === "preparation" || phase === "completed"
            ? "swipes-steps"
            : undefined
        }
      >
        <Brew model={brew} />
      </main>
      {active && <SessionBar model={brew} />}
      {offline.updateReady ? (
        <p role="status" className="offline-status">
          Update ready. It loads when you’re back on the home screen.
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
          <div className="footer-links">
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
              className="footer-toggle"
              onClick={theme.cycleTheme}
            >
              Theme · {THEME_LABEL[theme.theme]}
            </button>
            <button
              type="button"
              className="footer-toggle"
              onClick={sound.toggleSoundAssist}
            >
              Sound Assist · {sound.soundAssist ? "On" : "Off"}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
