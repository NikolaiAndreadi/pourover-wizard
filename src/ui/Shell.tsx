import { type Route, routeHrefs } from "@/app/routes";
import type { BrewModel } from "@/app/useBrew";
import { Brew } from "./Brew";
import { SessionBar } from "./SessionBar";
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
          Pourover Wizard<span>V60 · one cup</span>
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
        <SessionBar model={brew} />
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
              Pourover Wizard is being developed around James Hoffmann’s Better
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
            <section aria-labelledby="how" className="how">
              <h2 id="how">How the guide works</h2>
              <ul>
                <li>
                  Pour targets rise in a straight line between step times. That
                  line is guidance, not a required pour rate.
                </li>
                <li>
                  Drawdown time varies with grind and coffee, and a scale cannot
                  tell when it ends. Around 3:00 is typical; tap{" "}
                  <strong>Done</strong> when the coffee stops dripping.
                </li>
                <li>
                  Moving the dripper shakes the scale, so readings during the
                  two swirls are hidden from the chart. The purple dashed line
                  there is guidance, not a measurement.
                </li>
                <li>
                  <strong>Water poured</strong> is the highest settled reading:
                  steady within 1 g for half a second, above a zeroed start.
                  Brief spikes are ignored, but leaning on the scale or resting
                  the kettle on it for a while can inflate it. Without a zeroed
                  start, or with missing readings, it is unknown or may read
                  low.
                </li>
                <li>
                  <strong>Start when I pour</strong> needs a connected scale,
                  tared and still at zero. The timer starts after the weight
                  rises at least 3 g over half a second and counts from the
                  start of that rise. <strong>Pour now</strong> works anytime.
                </li>
                <li>
                  A live brew stops if the scale disconnects. Reconnect and tare
                  before the next brew.
                </li>
                <li>
                  The device list shows only BOOKOO scales. The app remembers
                  the last scale you connected and, where the browser or iOS
                  allows, reconnects to it without the list.
                  {brew.rememberedScale && (
                    <>
                      {" "}
                      <button type="button" onClick={brew.forgetScale}>
                        Forget scale
                      </button>
                    </>
                  )}
                </li>
                <li>
                  To cancel, hold <strong>Hold to cancel</strong> for one
                  second. With a keyboard, focus it and hold Space or Enter.
                </li>
              </ul>
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
        Pourover Wizard <span>Made for a quieter coffee ritual.</span>
      </footer>
    </div>
  );
}
