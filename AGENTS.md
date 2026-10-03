# Working agreement

- The primary agent is the **overseer**, not an implementer. Delegate application
  code, tests, tooling, CI, and fixes to **Sol agents**. The overseer may maintain
  plans, assign work, inspect changes, run checks, and review results; it must
  return implementation defects to a Sol agent rather than patch them itself.
- Use parallel Sol agents only for independent tasks with explicit file ownership.
  Serialize shared-interface, lockfile, and Git operations. Require a handoff
  listing changed files, actual verification results, and unresolved issues.
- Work directly on `main`; keep changes small. Do not discard unrelated work.
- Keep the repository private through development, testing, and verification.
  Passing checks must not automatically change visibility or publish artifacts.
- Preserve the small-SPA architecture. Tests and metrics provide evidence, not a
  guarantee of zero bugs. Record unverified hardware behavior explicitly.
- Commit messages describe the actual work completed and resulting behavior.
  Do not use local planning stages or task identifiers as commit descriptions.
- Keep local planning and session timelines out of commits. Committed files and
  commit messages must not reference uncommitted or ignored planning material.
  Committed instructions and documentation must stand on their own in a fresh
  checkout; references to repository files must resolve to committed files.

Current scope: one Hoffmann Better 1 Cup V60 recipe for 15 g coffee, web plus
SideStore, BOOKOO Themis Mini. Start manually with Pour now, or detect pouring
only after explicit arming. Hold to cancel.

## Application conventions

- Use Node 24.21.0 and npm 11.19.0, `npm ci`, and the committed lockfile.
- Run `npm run check` before committing application or tooling changes. See
  `README.md` for focused commands and generated report locations.
- Keep `core/` pure and DOM-free; `scale/` and `platform/` depend only on core
  and themselves. `app/` composes adapters; `ui/` uses app and core types.
- Restrict platform Bluetooth APIs to `src/scale/transport/`. Keep native plugin
  imports there too. Avoid computed or indirect API tricks that hide access.
- Add meaningful behavior tests as functionality arrives. Do not invent domain
  code, coverage thresholds, or mutation targets for an empty domain.
- Production browser checks must exercise the `/pourover-wizard/` asset base.
  Never equate emulation or mocked Bluetooth with real-device acceptance.
