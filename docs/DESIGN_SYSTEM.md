# HealthWallet application design system

The approved LUX AI logo is reused without alteration. Orange is an interface
accent, not a claim of affiliation: no Orange company logos are used.

## Foundations

- Neutral canvas `#f6f8fc`, white surfaces, dark navy text `#001539`.
- Orange `#ff7900` identifies primary actions and progress; dark navy text on orange.
- Muted text `#526079`; readable orange text uses `#a84700`, never bright orange.
- Success `#176347` on `#edf7f1`; pending `#795000` on `#fff6df`;
  error `#a52925` on `#fff0ef`; information `#305579` on `#eef4fa`.
- Status always has a text label. Color is supplementary.
- System sans typography, 16px minimum form inputs, fluid page headings.
- Shared panels, buttons, badges, feedback notices, progress steps, and form patterns
  are defined in `apps/web/src/styles/workspace.css` and `global.css`.

## Navigation and responsive behavior

Customer navigation is Home, Pay for Care, Get Support, and History. Profile is
under the More disclosure with institutional access and service status. Small
screens use fixed bottom navigation with safe-area spacing. Above 820px navigation
moves into the header. Desktop dashboards use two columns; forms pair with a help
panel. Institutional workspaces use a desktop sidebar and wrapping mobile controls.
Customer entry is separate from institutional access; choosing a preview never
grants backend permissions.

## Funds and actions

All wallet amounts explicitly display LRD (Liberian dollars). Available funds
exclude restricted and pending amounts. Unconnected balances show a dash, not a
false zero. Amounts use integer minor units; inputs reject negative values,
exponents, fractional cents, and amounts above the stated limit.

Pay, Save, and Support follow Details → Review → Confirmation. Completion updates
only a synthetic wallet and its history. Support remains pending and does not
increase spendable funds. Restricted funds cannot be spent by these demonstrations.
History includes filters, record details, statuses, and fictional references.
Institutional previews show role-specific queues, record review, and a session log.

## Feedback and accessibility

- Loading: busy label and status announcement; duplicate submission disabled.
- Empty: explanatory message and a relevant next action.
- Success: explicit outcome, affected amount, and a next step.
- Error: alert text associated with the form; retry or edit retains entered data.
- Unavailable: explain that the live service is not connected; never fake success.
- Network: offline notice, bounded connection retry, failure and restored states.
- Semantic labels, 44–48px minimum targets, visible focus, skip link, route focus,
  step heading focus, Escape for the More menu, and reduced-motion support.
- Optional savings guidance is general information; personalized AI is unavailable.

## Demo boundary and current limitations

`VITE_APP_ENV=demo` is the only environment with Try Demo and institutional
previews. Development, test, and production builds do not expose those entries.
Synthetic data stays in memory and resets on exit or reload. The demo never calls
payment, saving, support, or institutional mutation APIs. Neon remains the backend
for existing identity and service-status endpoints. Live financial flows and
institutional authentication require further backend work.

Run the explicit demo locally with:

```sh
VITE_APP_ENV=demo pnpm --filter @healthwallet/web dev --port 5174
```

Browser checks: `scripts/check-browser.mjs` targets the running app. If local Chrome
navigation is unavailable, `scripts/build-browser-fixture.mjs` bundles the same
React components with MemoryRouter into `/tmp/lux-design-fixture.html`. Open that
file in an isolated Chrome session on debugging port 9225, then run
`scripts/check-fixture.mjs`. This fallback verifies component layouts/interactions,
not the network proxy, backend, or production installation flow.
