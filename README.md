# Oasis

Oasis is a full-stack MVP for the gamified clinical assessment flow described in `SWD Project Report.pdf`. It provides a sliding tile puzzle for patient play and a PIN-gated psychiatrist dashboard for reviewing recorded game sessions.

## Current Features

- Public **Start a Game** flow for local psychiatrist-side play.
- Built-in tag-based image presets.
- Easy `3x3`, Medium `4x4`, and Hard `5x5` puzzle modes.
- Optional time and move limits; blank limits mean unlimited play.
- Gameplay **Hint** button using bounded A* search with heuristic fallback.
- Hint moves do not count as player moves, but are stored as a separate metric.
- SQLite-backed game session recording.
- PIN-gated psychiatrist dashboard.
- Dashboard session list, detail view, hint metrics, per-session delete, and full-history reset.
- Public session write APIs for a future remote client page.

## Run Locally

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

The default psychiatrist PIN is:

```text
1234
```

You can override it with:

```bash
PSYCHIATRIST_PIN=5678 npm start
```

## API Summary

Public game session APIs:

- `POST /api/sessions/start`
- `PATCH /api/sessions/:id/finish`

PIN-gated dashboard APIs:

- `POST /api/auth/login`
- `GET /api/sessions?pin=1234`
- `GET /api/sessions/:id?pin=1234`
- `DELETE /api/sessions?pin=1234`
- `DELETE /api/sessions/:id?pin=1234`

## Stored Session Metrics

Each recorded session stores:

- Optional patient nickname.
- Selected image name and tag.
- Difficulty and board size.
- Optional time limit.
- Optional move limit.
- Start and end timestamps.
- Total elapsed time.
- Player move count.
- Hint count.
- Completion status: `completed`, `exited`, `time_limit`, `move_limit`, or `started`.

Individual running sessions cannot be deleted from the dashboard. The dashboard **reset** action deletes all history, including running sessions, after confirmation.

## Files

- `server.js` - Express server, API routes, and SQLite setup.
- `index.html` - app shell and login modal.
- `styles.css` - responsive UI styling.
- `app.js` - puzzle, dashboard, and API client logic.
- `data/oasis.sqlite` - local database generated at runtime and ignored by git.

## Prototype Notes

The PIN-gated dashboard is suitable for local MVP testing only. Replace query-string PIN access with stronger authentication before production or clinical use.
