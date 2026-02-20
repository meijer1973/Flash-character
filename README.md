# Flash Character

Local-first Chinese flashcard/SRS app with speed-based promotion and self-grading.

## Features
- React + TypeScript + Vite single-page app.
- IndexedDB persistence using Dexie (`cards`, `reviews`, `settings`).
- Review flow with keyboard shortcuts:
  - `Enter`: flip card (front -> back)
  - `Space`: correct
  - `V`: wrong
- Timing metric is the front-to-flip duration.
- Wrong cards are re-queued until eventually marked correct in the same session.
- Configurable SRS steps, infinite-growth config, wrong behavior, front/back display fields, and TTS options.
- Import by pasted CSV and export JSON/CSV (all or due-only).
- Print-friendly card grid.

## Data model
Cards include `characters`, optional `pinyin`, `meaning`, status, due date, and review stats.
Reviews are tracked in a separate history table with answer speed and status transitions.

## Commands
```bash
npm install
npm run dev
npm test
```

## Notes
If package installation is blocked in your environment, run in a network-enabled node environment.
