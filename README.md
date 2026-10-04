# Pourover Wizard

A guided V60 pour-over timer for the browser and iPhone. Pick a recipe, set
your dose, and follow step-by-step cues. Connect a BOOKOO scale over Bluetooth
and the guide shows your pour against the target in real time.

**Try it:** <https://nikolaiandreadi.github.io/pourover-wizard/>

![Pourover Wizard brewing screen](docs/screenshot.png)

## What it does

- **Three recipes, credited to their authors:** James Hoffmann's Better 1 Cup
  V60 and Ultimate V60, and Tetsu Kasuya's 4:6 Method. Each is a fixed
  timeline with cumulative water targets and a typical finish time.
- **Dose picker.** Choose your coffee dose within the recipe's range; water
  targets scale, timing stays as the author set it.
- **Recipe preview.** Step through a recipe before brewing, with a one-line
  hint for every step.
- **Now and next.** While brewing, the screen shows the current step with a
  pixel-art scene and countdown, and the next step beside it, with a progress
  strip of the whole recipe.
- **Live scale assist.** With a supported scale connected: tap to tare, start
  the brew automatically when water lands, see the ideal weight for right now
  next to the actual reading, and get a pace hint (faster, keep pace, slow
  down). Each pour gets a zoomed chart of target versus measured.
- **Timer-only mode.** Everything except the scale features works without a
  scale, on any device.
- **Brew summary and history.** After each brew: coffee, water, time, and the
  full chart, with water poured and ratio when a scale measured them. The last
  50 completed brews stay on your device and can be browsed step by step.
- **Works offline.** Installable as a web app; once loaded it runs without a
  network, and updates download in the background.
- **Hard to tap by mistake.** Cancel, disconnect and clear history all need a
  one-second hold. Arrow keys step through recipes.
- **Private by design.** No account, no server, no analytics. Brews and
  settings stay in your browser or on your phone.

## Using it

### In a browser

Open the link above. For live scale assist you need a browser with Web
Bluetooth: Chrome or Edge on desktop or Android. Safari and Firefox run the
timer-only mode. The scale chooser is filtered to supported scales; **Show all
devices** lists everything if yours does not appear.

### On iPhone and iPad

Safari has no Web Bluetooth, so there are two ways to brew with a scale:

1. **Web Bluetooth browser.** Install a BLE-enabled browser such as
   [Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055)
   and open the same link in it. No install beyond the browser.
2. **Native app via SideStore.** Download `PouroverWizard.ipa` from the latest
   [release](https://github.com/NikolaiAndreadi/pourover-wizard/releases),
   install [SideStore](https://docs.sidestore.io/docs/intro), then import the
   IPA from Files in SideStore's **My Apps** screen. SideStore signs it with
   your free Apple ID and refreshes it; see the
   [SideStore FAQ](https://docs.sidestore.io/docs/faq) for its limits. The
   app uses native Bluetooth and asks for permission on first connect.

For timer-only brewing, Safari's **Add to Home Screen** gives you an offline
app without any of that.

Keep the app visible and your phone awake while brewing. There is no
background mode, so a locked screen can pause the timer and the scale link.

## Supported scales

| Scale              | Status                              |
|--------------------|-------------------------------------|
| BOOKOO Themis Mini | Verified on hardware                |
| BOOKOO Ultra Scale | From vendor protocol docs, untested |

Scales are data in [`src/scale/supported.ts`](src/scale/supported.ts): name
prefixes, service and characteristic UUIDs, and the codec that decodes weight
frames. The BOOKOO protocol comes from the vendor's
[open-source documentation](https://github.com/BooKooCode/OpenSource).
Contributions for other scales are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Recipes

| Recipe             | Author         | Default            | Done around | Source                                                                                                                         |
|--------------------|----------------|--------------------|-------------|--------------------------------------------------------------------------------------------------------------------------------|
| Better 1 Cup V60   | James Hoffmann | 15 g / 250 g       | 3:00        | [Video](https://www.youtube.com/watch?v=1oB1oDrDkHM), [Hario](https://www.hario-usa.com/blogs/recipes-and-more-from-friends/james-hoffmann-1-cup-v60-technique)       |
| Ultimate V60       | James Hoffmann | 30 g / 500 g       | 3:30        | [Video](https://www.youtube.com/watch?v=AI4ynXzkSQo), [Hario](https://www.hario-usa.com/blogs/recipes-and-more-from-friends/james-hoffmann-uitimate-v60-technique) |
| 4:6 Method         | Tetsu Kasuya   | 20 g / 300 g       | 3:30        | [Philocoffea](https://en.philocoffea.com/blogs/blog/coffee-brewing-method)                                                     |

Recipe names omit the authors' names and the credits do not imply
endorsement. Where a source gives no clock time for a swirl or stir, the guide
models it as a ten-second step; the details are in
[docs/behavior.md](docs/behavior.md#recipes).

## Good to know

- Recipes run on the clock. Methods with drainage-triggered steps, such as
  Scott Rao's, are not supported yet.
- Tare on a stable zero before each brew. **Water poured** is an estimate
  from the highest settled reading and is only shown when the brew started
  from a verified zero.
- A Bluetooth drop stops a live brew and keeps its time and chart. Reconnect
  and tare again for the next one.
- Only the original doses were checked against the sources. Scaled doses keep
  the timing, which may not suit every grind.
- Everything about scale behaviour was verified on one BOOKOO Themis Mini.
  Reports from other scales and firmware versions help.

## Development

Node 26 and npm 12, then:

```sh
npm ci
npm run dev      # local app at /pourover-wizard/
npm run check    # type checks, lint, architecture, unit and browser tests
```

[CONTRIBUTING.md](CONTRIBUTING.md) covers the toolchain, the quality gates, the
layered architecture, CI, and how to build the iOS app.
[docs/behavior.md](docs/behavior.md) is the detailed behavior reference.
