const express = require("express");
const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PSYCHIATRIST_PIN = process.env.PSYCHIATRIST_PIN || "1234";
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "oasis.sqlite");

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_nickname TEXT,
    image_tag TEXT NOT NULL,
    image_name TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    board_size INTEGER NOT NULL,
    time_limit_seconds INTEGER,
    move_limit INTEGER,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    total_time_seconds INTEGER,
    move_count INTEGER NOT NULL DEFAULT 0,
    hint_count INTEGER NOT NULL DEFAULT 0,
    completion_status TEXT NOT NULL DEFAULT 'started'
  )
`);

const sessionColumns = db.prepare("PRAGMA table_info(sessions)").all();
const hasHintCount = sessionColumns.some((column) => column.name === "hint_count");
if (!hasHintCount) {
  db.exec("ALTER TABLE sessions ADD COLUMN hint_count INTEGER NOT NULL DEFAULT 0");
}

app.use(express.json({ limit: "64kb" }));
app.use(express.static(__dirname));

function isValidPin(pin) {
  return typeof pin === "string" && pin === PSYCHIATRIST_PIN;
}

function pinFromRequest(req) {
  return req.query.pin || req.get("x-psychiatrist-pin") || "";
}

function requirePin(req, res, next) {
  if (!isValidPin(pinFromRequest(req))) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  next();
}

function nullablePositiveInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return undefined;
  }

  return numberValue;
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

app.post("/api/auth/login", (req, res) => {
  if (!isValidPin(req.body.pin)) {
    res.status(401).json({ ok: false, error: "Invalid PIN" });
    return;
  }

  res.json({ ok: true });
});

app.post("/api/sessions/start", (req, res) => {
  const difficulty = cleanText(req.body.difficulty, 20);
  const imageTag = cleanText(req.body.imageTag, 40);
  const imageName = cleanText(req.body.imageName, 80);
  const patientNickname = cleanText(req.body.patientNickname, 80) || null;
  const boardSize = Number(req.body.boardSize);
  const timeLimitSeconds = nullablePositiveInteger(req.body.timeLimitSeconds);
  const moveLimit = nullablePositiveInteger(req.body.moveLimit);

  if (!["easy", "medium", "hard"].includes(difficulty)) {
    res.status(400).json({ error: "Invalid difficulty" });
    return;
  }

  if (!Number.isInteger(boardSize) || boardSize < 3 || boardSize > 5) {
    res.status(400).json({ error: "Invalid board size" });
    return;
  }

  if (!imageTag || !imageName) {
    res.status(400).json({ error: "Image selection is required" });
    return;
  }

  if (timeLimitSeconds === undefined || moveLimit === undefined) {
    res.status(400).json({ error: "Limits must be positive whole numbers or blank" });
    return;
  }

  const startedAt = new Date().toISOString();
  const result = db
    .prepare(`
      INSERT INTO sessions (
        patient_nickname,
        image_tag,
        image_name,
        difficulty,
        board_size,
        time_limit_seconds,
        move_limit,
        started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      patientNickname,
      imageTag,
      imageName,
      difficulty,
      boardSize,
      timeLimitSeconds,
      moveLimit,
      startedAt
    );

  res.status(201).json({ id: result.lastInsertRowid, startedAt });
});

app.patch("/api/sessions/:id/finish", (req, res) => {
  const id = Number(req.params.id);
  const status = cleanText(req.body.completionStatus, 20);
  const moveCount = Number(req.body.moveCount);
  const hintCount = req.body.hintCount === undefined ? 0 : Number(req.body.hintCount);
  const totalTimeSeconds = Number(req.body.totalTimeSeconds);
  const allowedStatuses = ["completed", "exited", "time_limit", "move_limit"];

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  if (!allowedStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid completion status" });
    return;
  }

  if (!Number.isInteger(moveCount) || moveCount < 0) {
    res.status(400).json({ error: "Invalid move count" });
    return;
  }

  if (!Number.isInteger(hintCount) || hintCount < 0) {
    res.status(400).json({ error: "Invalid hint count" });
    return;
  }

  if (!Number.isInteger(totalTimeSeconds) || totalTimeSeconds < 0) {
    res.status(400).json({ error: "Invalid total time" });
    return;
  }

  const result = db
    .prepare(`
      UPDATE sessions
      SET ended_at = ?,
          total_time_seconds = ?,
          move_count = ?,
          hint_count = ?,
          completion_status = ?
      WHERE id = ?
    `)
    .run(new Date().toISOString(), totalTimeSeconds, moveCount, hintCount, status, id);

  if (result.changes === 0) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({ ok: true });
});

app.get("/api/sessions", requirePin, (req, res) => {
  const rows = db
    .prepare(`
      SELECT
        id,
        patient_nickname AS patientNickname,
        image_tag AS imageTag,
        image_name AS imageName,
        difficulty,
        board_size AS boardSize,
        time_limit_seconds AS timeLimitSeconds,
        move_limit AS moveLimit,
        started_at AS startedAt,
        ended_at AS endedAt,
        total_time_seconds AS totalTimeSeconds,
        move_count AS moveCount,
        hint_count AS hintCount,
        completion_status AS completionStatus
      FROM sessions
      ORDER BY datetime(started_at) DESC, id DESC
    `)
    .all();

  res.json({ sessions: rows });
});

app.get("/api/sessions/:id", requirePin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const row = db
    .prepare(`
      SELECT
        id,
        patient_nickname AS patientNickname,
        image_tag AS imageTag,
        image_name AS imageName,
        difficulty,
        board_size AS boardSize,
        time_limit_seconds AS timeLimitSeconds,
        move_limit AS moveLimit,
        started_at AS startedAt,
        ended_at AS endedAt,
        total_time_seconds AS totalTimeSeconds,
        move_count AS moveCount,
        hint_count AS hintCount,
        completion_status AS completionStatus
      FROM sessions
      WHERE id = ?
    `)
    .get(id);

  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({ session: row });
});

app.delete("/api/sessions", requirePin, (req, res) => {
  const result = db.prepare("DELETE FROM sessions").run();
  res.json({ ok: true, deletedCount: result.changes });
});

app.delete("/api/sessions/:id", requirePin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const result = db
    .prepare("DELETE FROM sessions WHERE id = ? AND completion_status <> 'started'")
    .run(id);

  if (result.changes > 0) {
    res.json({ ok: true });
    return;
  }

  const session = db.prepare("SELECT id FROM sessions WHERE id = ?").get(id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.status(409).json({ error: "Running sessions cannot be deleted" });
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`Oasis running at http://localhost:${PORT}`);
});

const keepAlive = setInterval(() => {}, 60 * 60 * 1000);

server.on("close", () => {
  clearInterval(keepAlive);
});
