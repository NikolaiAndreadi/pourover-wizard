import { modelName } from "@/app/liveScale";
import type { BrewModel } from "@/app/useBrew";
import { Brew } from "./Brew";
import { SessionBar } from "./SessionBar";
export function Shell({
  brew,
  offline,
}: {
  brew: BrewModel;
  offline: { offlineReady: boolean; updateReady: boolean };
}) {
  return (
    <div className={`shell ${brew.session ? "active-session" : ""}`}>
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
            if (phase === "preparation" || phase === "armed") brew.restart();
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
      ) : offline.offlineReady ? (
        <p className="offline-status">Available offline</p>
      ) : null}
      <footer>
        <p className="footer-scales">
          Supported scales:{" "}
          {brew.supportedScales.map((scale, index) => (
            <span key={scale.id}>
              {index > 0 && ", "}
              {modelName(scale)} · {scale.verified ? "verified" : "untested"}
            </span>
          ))}
        </p>
        <a
          href="https://github.com/NikolaiAndreadi"
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
      </footer>
    </div>
  );
}
