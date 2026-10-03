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
