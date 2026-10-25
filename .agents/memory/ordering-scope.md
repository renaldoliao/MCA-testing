---
name: Pickup ordering
description: The user's current requirements for live pickup ordering and how it is presented.
---

The user explicitly wants customers to submit real pay-at-pickup orders and have them sync to the staff dashboard. The dashboard must be protected by staff sign-in before showing customer names, phone numbers, or notes.

Do not add redundant phone-order prompts or duplicate forward CTAs; keep one primary action in the cart and do not overlay it with a floating cart bar. Keep the customer flow to three in-page steps: choose dishes → pickup details → review, without route changes.

Until server submission and protected staff delivery are active, clearly label the flow as a preview and do not imply an order was placed.

**Why:** The user changed the earlier preview-only scope, selected pay-at-pickup, identified the dashboard as the destination for live orders, and approved staff sign-in to protect customer information.

**How to apply:** Build server-persisted order submission and a staff-authenticated dashboard inbox. Keep payment at pickup unless the user asks to add online payments; remove phone-to-order CTAs but retain general contact links.

For the explicitly requested browser-only demo, confirmed customer orders must appear in the dashboard's primary Orders list and its totals, not just in a separate saved-orders panel.

**Why:** The user confirmed a demo order and still saw only sample customers in the main dashboard, despite a separate panel reading the saved data. A storage write and confirmation message did not satisfy the expected visible sync. Automatic simulated arrivals also changed counts and sales, then disappeared on reload, making real demo submissions look unreliable.

**How to apply:** Test confirmation into an already-open dashboard, reload persistence, and the main order list/count/total together. Keep submitted item names and prices as snapshots, keep customer orders distinct from simulated samples, and do not automatically complete customer orders with the sample clock or inject fake incoming orders. Give confirmation a same-origin dashboard link: Replit preview and Vercel have separate browser storage and cannot share demo records without a backend.

Browser-only demo navigation must stay in the current preview context. A same-origin link opened outside an embedded preview can still use different, partitioned browser storage.

**Why:** Browsers can partition embedded-site storage by the top-level site, so a new standalone tab is not guaranteed to see the preview's saved orders. Also, the screenshot browser has its own storage: an empty screenshot cannot establish that the user's saved orders are missing.

**How to apply:** Keep confirmation-to-dashboard navigation in the same tab or iframe and preserve the order query parameter through redirects. Distinguish a verified navigation bug from an unverified claim about the user's browser data.