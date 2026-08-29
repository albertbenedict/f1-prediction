# F1 Weekend Predictor

A vanilla HTML/CSS/JS prediction game for Formula 1 weekends. Pick the weekend — pole, podium, winner and a wildcard — and see how you score once results are in.

Live: `https://albertbenedict.github.io/f1-prediction/` (static, GitHub Pages)

### Features
- **Play** — Pole, Winner, Podium P2/P3, Sprint Pole (3 pts) / Sprint Win (5 pts) if sprint weekend, and Wildcard P4–22 (random per weekend, 8 pts bonus). Pole can overlap podium.
- **Whole-weekend countdown** — counts to FP1, then `Next: FP2 / Now: FP3` via OpenF1 `sessions` + Jolpica fallback. Live indicator during sessions.
- **Your Predictions** — current weekend + history from `localStorage`, with auto-score vs actual results when available.
- **Standings** — Drivers / Constructors from Jolpica + OpenF1 headshots/team colours (with overrides for HAD/LIN/TSU/BOT/PER) and team logos.
- **Past Results** — Top 10 race, top 5 quali, sprint top 5 + `Jump to round`.

### Scoring (adjustable in `script.js:SCORING`)
- Pole 5, Win 10, Podium exact 5 / wrong slot 2, Wildcard 8, Sprint Pole 3 / Sprint Win 5

### Stack
- No build — `index.html` + `style.css` + `script.js`
- Data: [Jolpica Ergast](https://github.com/jolpica/jolpica-f1) + [OpenF1](https://openf1.org/)
- Cache via `localStorage` (`cache:*` TTLs) so GitHub Pages stays functional without a server.


### Project structure
```
index.html      # tabs: Play / Your Predictions / Standings / Past Results
style.css       # theme vars --bg-color / --surface / --border-color
script.js       # fetch + cache + countdown + form + standings + results
```

### Data notes
- 2026 grid has 22 drivers (wildcard 4–22 fixed). Images/logos fall back to initials if `media.formula1.com` 404s.
- Predictions stored as `localStorage f1predict:{season}:{round}`.
