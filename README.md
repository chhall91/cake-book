# Cake Book 🎂

A cake-order scheduler for a home baker. It's a web app you can add to your phone's Home Screen. Plain HTML/CSS/JS with no dependencies; the data stays on the device (IndexedDB).

- `index.html`, `assets/styles.css`, `assets/app.js`: the app itself
- `assets/parser.js`: turns spoken or typed order text into form fields
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
