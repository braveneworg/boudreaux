# Media assertions must be codec-agnostic

E2E media assertions must be codec-agnostic: local macOS Playwright Chromium
lacks H.264 (error fallback renders) while CI's Linux build plays it — assert
either terminal state with `expect(a.or(b)).toBeVisible()`, never the error
path alone.
