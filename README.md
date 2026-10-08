# Cake Book 🎂

An order scheduler for a home baker: cakes, cupcakes and oatmeal cream pies. It's a web app you can add to your phone's Home Screen. Plain HTML/CSS/JS with no dependencies; the data stays on the device (IndexedDB).

- `index.html`, `assets/styles.css`, `assets/app.js`: the app itself
- `assets/parser.js`: turns spoken or typed order text into form fields
- `assets/products.js`: product types (Cake / Cupcakes / Oatmeal cream pies), product phrases ("2 dozen cupcakes") and the customer confirmation text + `sms:` link
- `assets/ics.js`: builds calendar files with reminder alarms
- `assets/photos.js`: IndexedDB storage, photo attachments (up to 10 per order, downscaled to 1600px JPEG), full-screen viewer, and photo data in backups
- `service-worker.js`: works offline, and serves generated `.ics` files at real `./ics/…` URLs as `text/calendar` so iOS opens Calendar's "Add All" sheet
- `manifest.json`, `icons/`: needed for installing the app

## Run locally
    python3 -m http.server 8765    # then open http://localhost:8765

On an iPhone, speech recognition, the service worker and notifications need **HTTPS** (e.g. GitHub Pages).

## Tests
    node tests/parser.test.js                      # parser unit tests
    BROWSER=webkit node tests/e2e.js               # needs the server above; saves screenshots/
    python3 tests/validate-ics.py                  # checks tests/out/*.ics
    BROWSER=webkit node tests/photos-e2e.js        # photos: add 3, viewer, delete, backup/restore, legacy migration
    node tests/photos-ui.js                        # backup/restore buttons, 4000px downscale, HEIC error

## Reminder notifications (push) – v5
Real push reminders come from the **cake-push** Cloudflare Worker (`/workspace/cake-push`).
- `assets/config.js` → `pushApi` (Worker URL; empty = feature hidden, old in-app alerts shown) and the VAPID public key.
  Changing it requires a service-worker VERSION bump (config.js is precached).
- More › **Turn on reminder notifications**: only offered in the installed Home-Screen app on iPhone (Safari tab shows
  "Add to Home Screen" steps). Tap → permission → `pushManager.subscribe` → register → resync all orders.
- `assets/push.js` keeps a persistent queue (IndexedDB `pushQueue`) of changed orders; retries with backoff, on
  `online`, and when the app is reopened. Closed (Delivered/Picked up, Paid) and deleted orders → reminders removed.
- Only customer name, product + quantity, occasion and due date/time leave the phone (in the notification title/body).
- While push is on, the old in-app local alerts are suppressed (avoids duplicates). Calendar (.ics) stays as backup.
- Tests: `tests/push-e2e.mjs` (app ↔ local Worker ↔ mock push), `tests/sw-push.test.js` (SW push/click handlers),
  `tests/upgrade-v5-test.js`, `tests/real-push-firefox.mjs` (real Mozilla push service accepts our pushes). Node ≥ 22 for wrangler.

## Product types & confirmation texts – v6
- Every order has `productType`: `cake` (default; all pre-v6 orders and old backups are migrated to it, nothing else changes),
  `cupcakes` or `creampies`. New fields: `qty` + `qtyUnit` (`dozen`|`each`), `itemSize` (Regular/Mini/Jumbo), `liners` (cupcakes),
  `wrapped` (`yes`|`no`) + `packaging` (cream pies). Cupcakes/cream pies reuse `flavor` (cookie flavor), `filling`, `frosting`,
  `design` (decorations/toppers) and `message`. Fields of other types stay stored but hidden/ignored.
- Upcoming has All / Cakes / Cupcakes / Cream pies chips (remembered for the session); cards show a type pill, calendar dots are colored by type.
- Order detail (when there is a phone number): **Text for confirmation** opens Messages via `sms:NUMBER&body=…` (iPhone format;
  other platforms get `?body=`). Tapping it records `confirmSentAt`. **Mark customer confirmed** sets `customerConfirmedAt` +
  `confirmedSig` (and Inquiry → Confirmed). Editing the details later shows "Changed since confirmed". Private notes are never texted.
  Optional sign-off name: More › Confirmation texts (`settings.signature`, included in backups).
- Push titles / .ics titles name the product ("🧁 Tomorrow: 2 dozen cupcakes for Jane Doe – Birthday"); on first start of v6 the
  app re-syncs all reminders once so the server copies get the new titles.
- Tests: `node tests/products.test.js`, `node tests/v6-e2e.js` (needs the :8765 server; saves screenshots 6–9),
  `node tests/upgrade-v6-test.js` (live v5 deploy → v6, own server on :8769).
