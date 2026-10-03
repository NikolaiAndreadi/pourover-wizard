import { type Route, routeHrefs } from "@/app/routes";
import type { BrewModel } from "@/app/useBrew";
import { Brew } from "./Brew";
import { ScaleLab } from "./ScaleLab";
export function Shell({ route, brew }: { route: Route; brew: BrewModel }) {
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
          Brew Guide<span>V60 · one cup</span>
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
          <a
            href={routeHrefs["scale-lab"]}
            aria-current={route === "scale-lab" ? "page" : undefined}
          >
            Scale lab
          </a>
        </nav>
      </header>
      <main id="content" tabIndex={-1}>
        <p className="eyebrow">A little care, a better cup</p>
        {route === "home" ? (
          <Brew model={brew} />
        ) : route === "scale-lab" ? (
          <ScaleLab />
        ) : (
          <>
            <h1>
              One cup.
              <br />A clear routine.
            </h1>
            <p className="intro">
              Brew Guide is being developed around James Hoffmann’s Better 1 Cup
              V60 technique, using 15 g of coffee and 250 g of water.
            </p>
            <section aria-labelledby="preview">
              <h2 id="preview">An early preview</h2>
              <p>
                Follow the timed recipe with a timer alone or rehearse with a
                simulated scale. Real Bluetooth and native iOS are still being
                developed.
              </p>
              <a className="button" href={routeHrefs.home}>
                Back to home <span aria-hidden="true">↗</span>
              </a>
            </section>
          </>
        )}
      </main>
      <footer>
        Brew Guide <span>Made for a quieter coffee ritual.</span>
      </footer>
    </div>
  );
}
