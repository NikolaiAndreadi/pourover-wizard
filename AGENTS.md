# Working agreement

- The primary agent oversees; delegate application code, tests, tooling, CI, and
  fixes to **Sol agents**. Review changes, run checks, and return defects to their
  implementer. Each handoff lists changed files, actual checks, and open issues.
- Parallel tasks need independent file ownership. Serialize shared interfaces,
  lockfiles, and Git operations.
- Work on `main` in small changes; preserve unrelated work.
- Keep the repository private during development and verification. Passing checks
  does not authorize publication or a visibility change.
- Keep the small SPA. Tests and metrics are evidence, not proof of zero bugs;
  record unverified hardware behavior.
- Keep local plans and session timelines out of commits. Committed documentation
  must stand alone with references to committed files. Commit messages describe
  completed work and resulting behavior, without local task or stage identifiers.

Scope: Hoffmann Better 1 Cup V60, 15 g coffee; web and SideStore; BOOKOO Themis
Mini. Start with **Pour now**, or detect pouring after explicit arming. Hold to cancel.

## Application conventions

- Track the latest stable Node Current (including non-LTS) and latest compatible
  npm; current pins
  are Node **26.10.0** and npm **12.2.0**. Use `npm ci` and the committed lockfile;
  verify compatibility when updating pins.
- Run `npm run check` before committing application or tooling changes. Focused
  commands and report locations are in `README.md`.
- Keep `core/` pure and DOM-free. `scale/` and `platform/` depend only on core and
  themselves; `app/` composes adapters; `ui/` uses app and type-only core imports.
- Platform Bluetooth APIs and native plugin imports belong in
  `src/scale/transport/`. Do not hide access with computed or indirect API tricks.
- Add meaningful behavior tests as functionality arrives; do not invent domain
  code, coverage thresholds, or mutation targets to fill an empty domain.
- Production browser checks use `/pourover-wizard/`. Emulation and mocked
  Bluetooth do not establish real-device acceptance.
