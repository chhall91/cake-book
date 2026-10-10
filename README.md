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

## Bulk / group orders – v7
- Cupcake and cream pie orders have a **👥 Bulk / group order** switch (also a "👥 Bulk order" button on Upcoming, and voice:
  "bulk order … fundraiser … $12 a dozen"). Stored on the order: `bulk: true`, `organizer`, `pricePerDozen`, optional `pricePerHalf`
  (½ dozen price; with only a half price a dozen = 2×), `people: [{ id, name, phone, dozen (0.5 steps), flavor (blank = order default),
  paid, method (Cash/Venmo/Cash App/Zelle/Check/Other), amount (amount actually paid, only if different → "part paid"), pickedUp,
  note, addedAt, paidAt, pickedUpAt, textedAt, remindedAt, readyTextAt }]`. `name` = group/fundraiser name, `phone` = organizer phone.
  Turning the switch off keeps `people` stored (just hidden). Old orders are untouched (no migration needed).
- Order detail › **People & payments**: totals (people, dozen + cookies/cupcakes, picked up, collected of owed, outstanding / # unpaid),
  "To bake" per-flavor dozens, Add person sheet (mic on every field, ±½ stepper, ½/1/2/3/4/6 quick buttons, paid + method,
  Add & next person), **Paste a list** (one person per line, "next person" when dictating, CSV with header; live preview; people already
  on the list are skipped by phone/name), tap a row's 💵 to record payment, 📦 to toggle picked up, 💬 to text that person.
  Filters All / Unpaid / Not picked up, A–Z ↔ added order, search when > 8 people.
- **Remind unpaid** / **Ready texts** walk through people one at a time (each gets their own text with their own amount; no group
  text, so nobody sees everyone's numbers and there are no reply-all threads). **Share list**: plain text (phones optional) or CSV
  through the share sheet. **More**: mark everyone picked up, copy all phone numbers, start the next round with the same people.
- Optional "How people can pay" (More › Confirmation texts, `settings.payInfo`, in backups) adds "You can pay with …" to texts.
- Contacts picker (📇) only appears where `navigator.contacts.select` exists (Android Chrome; iOS Safari only with the
  experimental Contact Picker flag on), otherwise it's hidden.
- Cards: "Bulk · 23 people · 48 dozen · $96 unpaid"; reminders/calendar: "🍪 Tomorrow: 48 dozen cream pies – Smith fundraiser"
  (only totals go to the push server – never the people's names or numbers; the .ics description holds the full list on the phone).
- Tests: `node tests/bulk-parser.test.js`, `node tests/products.test.js`, `node tests/v7-bulk-e2e.js` (needs the :8765 server;
  screenshots 10a–10g), `node tests/upgrade-v7-test.js` (v6 snapshot in /tmp/live-v6 → v7, own server on :8770).


## Talk to Cake Book – voice changes – v8

The main mic (Upcoming → **🎤 Talk to Cake Book**, the 🎤 tab, or the round **🎤 Talk** button on any order page) now understands *changes* as well as new orders. Everything is rule-based and runs on the phone – no AI service, no internet needed for the understanding part (`assets/commands.js`).

**How it works**
1. Say (or type) something and tap **✨ Go**.
2. A whole new order (“Sarah Johnson, 555-…, birthday cake for Saturday…”) goes to the filled-in form exactly as before.
3. A change shows a **confirm card** with every before → after, e.g. *Jane Doe: 1 dozen → 3 dozen, owes $12 → $36* plus the order totals. Nothing is saved until you tap **Apply**; **Cancel** leaves everything alone.
4. After Apply you land on the order with an **Undo** bar for 12 seconds (or say “undo” later).

**Who/which order** – names are matched loosely (Jayne/Jane, Katie/Katy, Steven/Stephen…). Opened from an order’s 🎤 button, commands are about *that order* first (shown as “About Smith Family Fundraiser ✕”). If it could be two people or orders (“make Jane 3 dozen” with a Jane in two bulk orders) you get a **pick list**. If nothing matches you get a friendly “I couldn’t find …”.

**Things you can say** (also under **💡 What can I say?**)
- Bulk people: “make Jane 3 dozen”, “instead of Jane only getting one dozen make it 3 dozen”, “change Jane from one dozen to 3”, “Jane wants 2 more dozen”, “take a dozen off Bob”, “add Mike Brown 2 dozen to the Smith fundraiser”, “put Sue down for half a dozen”, “remove Amy” / “Amy dropped out”, “Jane paid Venmo”, “Mike paid 15 dollars” (part payment), “Bob hasn’t paid”, “Tom picked up”, “change Bob’s number to 555-201-0009”, “add a note for Jane that she’ll be late”.
- Orders: “move the Smith cake to Saturday at 2”, “pickup is now at 4pm”, “mark the Garcia cake ready / confirmed / in progress”, “cancel the Garcia order” (status **Cancelled** – kept, reminders stop), “change the frosting to cream cheese”, “make it chocolate”, “make it a 10 inch”, “the price is 90”, “deposit paid 20”, “change the price per dozen to 14” (bulk), “make it 3 dozen” (cupcakes / cream pies), “make it a delivery to 12 Oak Street”, “switch it to pickup”, “add a note that she’s allergic to nuts”, “Sarah confirmed” (customer-confirmed badge).
- Find: “open Jane’s order”, “show unpaid” (inside a bulk order this filters the people list), “who hasn’t picked up”, “what’s due this week / tomorrow / Saturday / next week”, “show me the cupcake orders”.
- Numbers can be words: “three dozen”, “half a dozen”, “a dozen and a half”, “two and a half”, “a couple”, “another dozen”.

Date/time changes re-sync push reminders automatically (same path as editing the form). Calendar (.ics) events already added to the iPhone Calendar can’t be changed from the web – the card reminds you to tap 📅 again.

New status: **Cancelled** (in the status picker too) – counts as closed, so no reminders and hidden from Upcoming.

**Tests**: `tests/commands.test.js` (94 phrases + resolution/diff cases + every older new-order sentence still routes to the form), `tests/v8-voice-e2e.js` (WebKit iPhone: apply, undo, cancel, pick list, scope, reschedule + reminders, queries, help, unknown), `tests/upgrade-v8-test.js` (real v7 → v8 with data, photos, settings). Screenshots `screenshots/11*.png`.
