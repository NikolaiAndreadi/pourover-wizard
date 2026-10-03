import { type Route, routeHrefs } from "@/app/routes";
import type { BrewModel } from "@/app/useBrew";
import { Brew } from "./Brew";
export function Shell({
  route,
  brew,
  offline,
}: {
  route: Route;
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
        <a className="brand" href={routeHrefs.home}>
          Pourover Wizzard<span>V60 · one cup</span>
        </a>
        <nav aria-label="Main navigation">
          <a
            href={routeHrefs.home}
            aria-current={route === "home" ? "page" : undefined}
          >
            Home
          </a>
          <a
            href={routeHrefs.about}
            aria-current={route === "about" ? "page" : undefined}
          >
            About
          </a>
        </nav>
      </header>
      <main id="content" tabIndex={-1}>
        <p className="eyebrow">A little care, a better cup</p>
        {route === "home" ? (
          <Brew model={brew} />
        ) : (
          <>
            <h1>
              One cup.
              <br />A clear routine.
            </h1>
            <p className="intro">
              Pourover Wizzard is being developed around James Hoffmann’s Better
              1 Cup V60 technique, using 15 g of coffee and 250 g of water.
            </p>
            <section aria-labelledby="preview">
              <h2 id="preview">An early preview</h2>
              <p>
                Preview each step before brewing, follow the timed recipe with a
                timer alone, or connect your BOOKOO Themis Mini on Mac Chrome or
                the iOS app.
              </p>
              <a className="button" href={routeHrefs.home}>
                Back to home <span aria-hidden="true">↗</span>
              </a>
            </section>
          </>
        )}
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
        Pourover Wizzard <span>Made for a quieter coffee ritual.</span>
      </footer>
    </div>
  );
}
