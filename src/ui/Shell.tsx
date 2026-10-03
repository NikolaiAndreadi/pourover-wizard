import type { Route } from "../app/routes";
export function Shell({ route }: { route: Route }) {
  return (
    <div className="shell">
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
        <a className="brand" href="#/">
          Brew Guide<span>V60 · one cup</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#/" aria-current={route === "home" ? "page" : undefined}>
            Home
          </a>
          <a
            href="#/about"
            aria-current={route === "about" ? "page" : undefined}
          >
            About
          </a>
        </nav>
      </header>
      <main id="content" tabIndex={-1}>
        <p className="eyebrow">A little care, a better cup</p>
        {route === "home" ? (
          <>
            <h1>
              Your daily pour-over,
              <br />
              with room to focus.
            </h1>
            <p className="intro">A simple guide for one cup of V60 coffee.</p>
            <section aria-labelledby="status">
              <h2 id="status">The guide is taking shape</h2>
              <p>
                The brewing timer and scale connection are being built. This
                preview establishes the app’s layout and navigation.
              </p>
              <a className="button" href="#/about">
                About this guide <span aria-hidden="true">↗</span>
              </a>
            </section>
          </>
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
                Recipe guidance, a timer, and BOOKOO Themis Mini support will
                follow. Brewing and Bluetooth are not available in this preview.
              </p>
              <a className="button" href="#/">
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
