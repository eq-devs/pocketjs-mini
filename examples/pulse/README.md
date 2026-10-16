# Pulse example

A real-data dashboard built on three free public APIs, with no API keys. Run
`pjm run --device android -d <serial>` (or `pjm run` for iOS) in this folder.

| Tab | Source | Shows |
| --- | --- | --- |
| Weather | [Open-Meteo](https://open-meteo.com) | Gradient hero with drawn weather icons, feels-like/humidity/wind/UV tiles, 24-hour temperature bar chart, 7-day forecast with range bars, city picker and "Use my location" |
| News | [Hacker News Algolia API](https://hn.algolia.com/api) | Top/New/Ask/Show feeds, word-wrapped titles, story page with top-level comments, full comment page, copy links |
| Markets | [Frankfurter](https://frankfurter.dev) (ECB reference rates) | 14 currencies with 45-day sparklines and change, base/amount selectors, detail page with 1M/3M/6M/1Y chart, high/low/average, swap and copy |

## How it works

- `app/net.ts` sends every request as a streamed resource and reads it back in
  parallel 1536-byte chunks. The host allows each app 4 concurrent requests and
  32 per minute, so requests are queued (3 at a time) and capped at 28 per minute.
  Each feed or comment page is one request.
- `app/text.ts` reduces remote text to the glyphs baked at build time (NFKD plus
  a punctuation map) and word-wraps with the engine's own text measurement. The
  engine only breaks lines on `\n`.
- `app/state.ts` holds routing, network state, toasts and preferences (tab, city,
  base currency, amount, feed) under one storage key. The last forecast is saved
  separately, so the Weather tab has data straight away and while offline.
- The app shows an offline banner, refreshes the current tab when the network
  returns or the app comes back to the foreground, and labels data with
  "updated X ago". Loading uses skeleton placeholders and failures show a Retry card.
- Charts, sparklines, range bars, weather icons and tab icons are plain `View`s
  with computed sizes. There are no image assets.

`mini.json` declares the five pages, the `location` permission and the three
exact HTTPS domains. Other hosts are denied by the container's domain policy.

## Evidence (2026-10-15)

`pjm check` passes for Android, and all 129 class strings compile to styles.
On the Android emulator, every flow loaded live data: weather, city switch,
news feeds, a story with comments, the market list and the currency detail.
A standalone signed APK (`dev.pjm.pulse`) ran on a physical Pixel 8 Pro and
rendered live weather. The header-width fix was rebuilt after that run but not
yet installed on the Pixel. Location and the iOS host were not exercised.
