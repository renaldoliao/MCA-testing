---
name: Responsive verification
description: Keep broad device-layout audits efficient and report browser coverage honestly.
---

Run broad viewport checks in short per-route batches, then exercise the changed interaction flow once. Keep browser runs bounded and distinguish viewport emulation from real-device and browser-engine coverage.

**Why:** A large footer-and-viewport sweep exceeded browser-script time limits and delayed its report even though the completed application checks passed.

**How to apply:** For future responsive work, batch overflow and layout measurements rather than navigating and scrolling every route and viewport in one long browser script. Report only engines and devices actually tested.