const IMAGE_PRESETS = [
  { id: "garden", name: "Morning Garden", tag: "nature", colors: ["#8ed6ff", "#9ee6b5", "#f7f6b7"] },
  { id: "sea", name: "Quiet Sea", tag: "water", colors: ["#65c7f7", "#9cecfb", "#ffffff"] },
  { id: "books", name: "Book Corner", tag: "reading", colors: ["#b8d8ff", "#f3d6a3", "#ffffff"] },
  { id: "music", name: "Soft Music", tag: "music", colors: ["#a8c0ff", "#d8b4f8", "#ffffff"] },
  { id: "flowers", name: "Blue Flowers", tag: "flowers", colors: ["#bde0fe", "#caffbf", "#ffffff"] },
  { id: "sky", name: "Open Sky", tag: "sky", colors: ["#90dbf4", "#ffffff", "#c3f0ca"] },
];

const DIFFICULTIES = {
  easy: { label: "Easy", size: 3 },
  medium: { label: "Medium", size: 4 },
  hard: { label: "Hard", size: 5 },
};

const A_STAR_SEARCH_CAP = 5000;

const app = document.querySelector("#app");
const homeButton = document.querySelector("#homeButton");
const loginButton = document.querySelector("#loginButton");
const loginModal = document.querySelector("#loginModal");
const closeLoginButton = document.querySelector("#closeLoginButton");
const cancelLoginButton = document.querySelector("#cancelLoginButton");
const pinForm = document.querySelector("#pinForm");
const pinInput = document.querySelector("#pinInput");
const pinError = document.querySelector("#pinError");

const state = {
  view: "home",
  selectedPresetId: IMAGE_PRESETS[0].id,
  currentSession: null,
  dashboardPin: "",
  sessions: [],
  selectedSessionId: null,
  selectedSession: null,
  timerId: null,
  hintHighlightTimerId: null,
};

function presetImage(preset) {
  const [a, b, c] = preset.colors;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${a}"/>
          <stop offset="52%" stop-color="${b}"/>
          <stop offset="100%" stop-color="${c}"/>
        </linearGradient>
      </defs>
      <rect width="600" height="600" fill="url(#g)"/>
      <circle cx="470" cy="120" r="84" fill="rgba(255,255,255,0.45)"/>
      <circle cx="150" cy="420" r="130" fill="rgba(255,255,255,0.28)"/>
      <path d="M60 470 C170 360 250 570 360 410 S510 350 560 470 V600 H60 Z" fill="rgba(20,34,53,0.16)"/>
      <path d="M80 170 C180 85 300 235 420 130 S540 145 560 230" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="24" stroke-linecap="round"/>
    </svg>
  `;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function api(path, options = {}) {
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  });
}

function formatDate(value) {
  if (!value) return "Not ended";
  return new Date(value).toLocaleString();
}

function formatLimit(value, unit) {
  return value === null || value === undefined ? "Unlimited" : `${value} ${unit}`;
}

function formatStatus(status) {
  return String(status || "").replaceAll("_", " ");
}

function setTimer(active) {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  if (active) {
    state.timerId = setInterval(() => {
      if (state.view !== "game" || !state.currentSession) return;
      const elapsed = elapsedSeconds();
      if (state.currentSession.timeLimitSeconds && elapsed >= state.currentSession.timeLimitSeconds) {
        finishGame("time_limit");
        return;
      }
      updateGameMetrics();
    }, 500);
  }
}

function render() {
  const canOpenDashboard = state.view === "home" || state.view === "thanks";
  loginButton.classList.toggle("hidden", !canOpenDashboard);

  if (state.view !== "game") {
    setTimer(false);
  }

  if (state.view === "home") renderHome();
  if (state.view === "config") renderConfig();
  if (state.view === "game") renderGame();
  if (state.view === "thanks") renderThanks();
  if (state.view === "dashboard") renderDashboard();
}

function renderHome() {
  app.innerHTML = `
    <section class="home-view">
      <div class="start-panel">
        <button class="primary-action" id="startGameButton" type="button">Start a Game</button>
      </div>
    </section>
  `;

  document.querySelector("#startGameButton").addEventListener("click", () => {
    state.view = "config";
    render();
  });
}

function renderConfig(error = "") {
  const selectedPreset = IMAGE_PRESETS.find((preset) => preset.id === state.selectedPresetId);
  const presetButtons = IMAGE_PRESETS.map((preset) => {
    const selectedClass = preset.id === selectedPreset.id ? " is-selected" : "";
    return `
      <button class="preset-option${selectedClass}" type="button" data-preset-id="${preset.id}">
        <span class="preset-preview" style="background-image: url('${presetImage(preset)}')"></span>
        <span class="preset-name">${preset.name}</span>
        <span class="preset-tag">${preset.tag}</span>
      </button>
    `;
  }).join("");

  app.innerHTML = `
    <section>
      <div class="view-header">
        <div>
          <h1>Configure Game</h1>
          <p>Choose a puzzle image, difficulty, and optional limits.</p>
        </div>
        <button class="secondary-button" id="cancelConfigButton" type="button">Cancel</button>
      </div>
      <form class="config-panel" id="configForm" novalidate>
        <div class="config-grid">
          <div>
            <label for="patientNickname">Patient nickname</label>
            <input id="patientNickname" name="patientNickname" maxlength="80" autocomplete="off">
          </div>
          <div>
            <label for="difficulty">Difficulty</label>
            <select id="difficulty" name="difficulty">
              <option value="easy">Easy - 3x3</option>
              <option value="medium">Medium - 4x4</option>
              <option value="hard">Hard - 5x5</option>
            </select>
          </div>
          <div>
            <label for="timeLimit">Time limit in seconds</label>
            <input id="timeLimit" name="timeLimit" type="number" min="1" step="1" placeholder="Unlimited">
          </div>
          <div>
            <label for="moveLimit">Move limit</label>
            <input id="moveLimit" name="moveLimit" type="number" min="1" step="1" placeholder="Unlimited">
          </div>
          <div class="field-full">
            <label for="tagSearch">Tag search</label>
            <input id="tagSearch" name="tagSearch" autocomplete="off" placeholder="nature, music, sky">
            <div class="preset-grid" id="presetGrid">${presetButtons}</div>
          </div>
        </div>
        ${error ? `<p class="page-error">${error}</p>` : ""}
        <div class="form-actions">
          <button class="primary-button" type="submit">Enter</button>
        </div>
      </form>
    </section>
  `;

  const presetGrid = document.querySelector("#presetGrid");
  const tagSearch = document.querySelector("#tagSearch");

  document.querySelector("#cancelConfigButton").addEventListener("click", goHome);
  presetGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset-id]");
    if (!button) return;
    state.selectedPresetId = button.dataset.presetId;
    renderConfig();
  });
  tagSearch.addEventListener("input", () => {
    const term = tagSearch.value.trim().toLowerCase();
    const buttons = presetGrid.querySelectorAll("[data-preset-id]");
    buttons.forEach((button) => {
      const preset = IMAGE_PRESETS.find((item) => item.id === button.dataset.presetId);
      const matches = !term || preset.tag.includes(term) || preset.name.toLowerCase().includes(term);
      button.classList.toggle("hidden", !matches);
    });
  });
  document.querySelector("#configForm").addEventListener("submit", startGame);
}

async function startGame(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const difficulty = form.get("difficulty");
  const selectedPreset = IMAGE_PRESETS.find((preset) => preset.id === state.selectedPresetId);
  const timeLimitSeconds = form.get("timeLimit") ? Number(form.get("timeLimit")) : null;
  const moveLimit = form.get("moveLimit") ? Number(form.get("moveLimit")) : null;
  const boardSize = DIFFICULTIES[difficulty].size;

  try {
    const data = await api("/api/sessions/start", {
      method: "POST",
      body: JSON.stringify({
        patientNickname: String(form.get("patientNickname") || "").trim(),
        imageTag: selectedPreset.tag,
        imageName: selectedPreset.name,
        difficulty,
        boardSize,
        timeLimitSeconds,
        moveLimit,
      }),
    });

    state.currentSession = {
      id: data.id,
      difficulty,
      boardSize,
      timeLimitSeconds,
      moveLimit,
      imageName: selectedPreset.name,
      imageTag: selectedPreset.tag,
      imageUrl: presetImage(selectedPreset),
      startedAtMs: Date.now(),
      moves: 0,
      hints: 0,
      highlightedHintTile: null,
      tiles: shuffledTiles(boardSize),
      finished: false,
    };
    state.view = "game";
    render();
    setTimer(true);
  } catch (error) {
    renderConfig(error.message);
  }
}

function shuffledTiles(size) {
  const solved = Array.from({ length: size * size - 1 }, (_, index) => index + 1).concat(0);
  let tiles = solved.slice();

  do {
    for (let index = tiles.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [tiles[index], tiles[swapIndex]] = [tiles[swapIndex], tiles[index]];
    }
  } while (!isSolvable(tiles, size) || isSolved(tiles));

  return tiles;
}

function isSolvable(tiles, size) {
  const values = tiles.filter(Boolean);
  let inversions = 0;

  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      if (values[i] > values[j]) inversions += 1;
    }
  }

  if (size % 2 === 1) {
    return inversions % 2 === 0;
  }

  const emptyIndex = tiles.indexOf(0);
  const emptyRowFromBottom = size - Math.floor(emptyIndex / size);
  return emptyRowFromBottom % 2 === 0 ? inversions % 2 === 1 : inversions % 2 === 0;
}

function isSolved(tiles) {
  return tiles.every((tile, index) => tile === (index === tiles.length - 1 ? 0 : index + 1));
}

function elapsedSeconds() {
  if (!state.currentSession) return 0;
  return Math.floor((Date.now() - state.currentSession.startedAtMs) / 1000);
}

function renderGame() {
  const session = state.currentSession;
  const size = session.boardSize;
  const tiles = session.tiles.map((tile, index) => tileMarkup(tile, index, size, session.imageUrl)).join("");

  app.innerHTML = `
    <section class="game-shell">
      <div class="view-header">
        <div>
          <h1>${DIFFICULTIES[session.difficulty].label} Puzzle</h1>
          <p>${session.imageName} / ${session.imageTag}</p>
        </div>
      </div>
      <div class="puzzle-board" id="puzzleBoard" style="--board-size: ${size}; grid-template-columns: repeat(${size}, 1fr);">
        ${tiles}
      </div>
      <div class="game-actions">
        <button class="hint-button" id="hintButton" type="button">Hint</button>
        <button class="exit-button" id="exitGameButton" type="button">Exit</button>
      </div>
    </section>
  `;

  document.querySelector("#puzzleBoard").addEventListener("click", onTileClick);
  document.querySelector("#hintButton").addEventListener("click", handleHintClick);
  document.querySelector("#exitGameButton").addEventListener("click", () => finishGame("exited"));
}

function tileMarkup(tile, index, size, imageUrl) {
  if (tile === 0) {
    return `<button class="tile tile-empty" type="button" data-index="${index}" aria-label="Empty tile"></button>`;
  }

  const sourceIndex = tile - 1;
  const row = Math.floor(sourceIndex / size);
  const col = sourceIndex % size;
  const positionX = size === 1 ? 0 : (col / (size - 1)) * 100;
  const positionY = size === 1 ? 0 : (row / (size - 1)) * 100;

  const highlightClass = state.currentSession?.highlightedHintTile === tile ? " hint-highlight" : "";

  return `
    <button
      class="tile${highlightClass}"
      type="button"
      data-index="${index}"
      style="background-image: url('${imageUrl}'); background-position: ${positionX}% ${positionY}%"
      aria-label="Tile ${tile}"
    >
      ${tile}
    </button>
  `;
}

function onTileClick(event) {
  const button = event.target.closest("[data-index]");
  if (!button || button.classList.contains("tile-empty")) return;

  const index = Number(button.dataset.index);
  const session = state.currentSession;
  const emptyIndex = session.tiles.indexOf(0);

  if (!areAdjacent(index, emptyIndex, session.boardSize)) return;

  performTileMove(index, { countMove: true, countHint: false, highlight: false });
}

function performTileMove(index, options) {
  const session = state.currentSession;
  const emptyIndex = session.tiles.indexOf(0);
  const movedTile = session.tiles[index];

  [session.tiles[index], session.tiles[emptyIndex]] = [session.tiles[emptyIndex], session.tiles[index]];

  if (options.countMove) {
    session.moves += 1;
  }

  if (options.countHint) {
    session.hints += 1;
  }

  if (options.highlight) {
    setHintHighlight(movedTile);
  } else {
    session.highlightedHintTile = null;
  }

  if (isSolved(session.tiles)) {
    finishGame("completed");
    return;
  }

  if (options.countMove && session.moveLimit && session.moves >= session.moveLimit) {
    finishGame("move_limit");
    return;
  }

  renderGame();
}

function handleHintClick() {
  const session = state.currentSession;
  if (!session || session.finished || isSolved(session.tiles)) return;

  const move = findBestHintMove(session.tiles, session.boardSize);
  if (move === null) return;

  performTileMove(move, { countMove: false, countHint: true, highlight: true });
}

function setHintHighlight(tile) {
  const session = state.currentSession;
  if (!session) return;

  session.highlightedHintTile = tile;

  if (state.hintHighlightTimerId) {
    clearTimeout(state.hintHighlightTimerId);
  }

  state.hintHighlightTimerId = setTimeout(() => {
    if (state.currentSession && state.currentSession.highlightedHintTile === tile) {
      state.currentSession.highlightedHintTile = null;
      if (state.view === "game") renderGame();
    }
  }, 650);
}

function areAdjacent(a, b, size) {
  const aRow = Math.floor(a / size);
  const bRow = Math.floor(b / size);
  const aCol = a % size;
  const bCol = b % size;
  return Math.abs(aRow - bRow) + Math.abs(aCol - bCol) === 1;
}

function boardKey(tiles) {
  return tiles.join(",");
}

function manhattanDistance(tiles, size) {
  return tiles.reduce((total, tile, index) => {
    if (tile === 0) return total;

    const currentRow = Math.floor(index / size);
    const currentCol = index % size;
    const targetIndex = tile - 1;
    const targetRow = Math.floor(targetIndex / size);
    const targetCol = targetIndex % size;

    return total + Math.abs(currentRow - targetRow) + Math.abs(currentCol - targetCol);
  }, 0);
}

function hintNeighbors(tiles, size) {
  const emptyIndex = tiles.indexOf(0);
  return adjacentIndexes(emptyIndex, size).map((tileIndex) => {
    const nextTiles = tiles.slice();
    const movedTile = nextTiles[tileIndex];
    [nextTiles[tileIndex], nextTiles[emptyIndex]] = [nextTiles[emptyIndex], nextTiles[tileIndex]];
    return { tiles: nextTiles, moveIndex: tileIndex, movedTile };
  });
}

function adjacentIndexes(index, size) {
  const row = Math.floor(index / size);
  const col = index % size;
  const indexes = [];

  if (row > 0) indexes.push(index - size);
  if (row < size - 1) indexes.push(index + size);
  if (col > 0) indexes.push(index - 1);
  if (col < size - 1) indexes.push(index + 1);

  return indexes;
}

function findBestHintMove(tiles, size) {
  const aStarMove = boundedAStarFirstMove(tiles, size);
  if (aStarMove !== null) {
    return aStarMove;
  }

  return greedyHintMove(tiles, size);
}

function boundedAStarFirstMove(tiles, size) {
  const startKey = boardKey(tiles);
  const open = [];
  pushSearchNode(open, {
    tiles: tiles.slice(),
    g: 0,
    h: manhattanDistance(tiles, size),
    firstMove: null,
    key: startKey,
  });
  const bestCosts = new Map([[startKey, 0]]);
  let explored = 0;

  while (open.length > 0 && explored < A_STAR_SEARCH_CAP) {
    const current = popSearchNode(open);
    explored += 1;

    if (isSolved(current.tiles)) {
      return current.firstMove;
    }

    for (const neighbor of hintNeighbors(current.tiles, size)) {
      const nextG = current.g + 1;
      const key = boardKey(neighbor.tiles);
      const knownBest = bestCosts.get(key);

      if (knownBest !== undefined && knownBest <= nextG) {
        continue;
      }

      bestCosts.set(key, nextG);
      pushSearchNode(open, {
        tiles: neighbor.tiles,
        g: nextG,
        h: manhattanDistance(neighbor.tiles, size),
        firstMove: current.firstMove ?? neighbor.moveIndex,
        key,
      });
    }
  }

  return null;
}

function searchScore(node) {
  return node.g + node.h;
}

function pushSearchNode(heap, node) {
  heap.push(node);
  let index = heap.length - 1;

  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (searchScore(heap[parentIndex]) <= searchScore(heap[index])) break;
    [heap[parentIndex], heap[index]] = [heap[index], heap[parentIndex]];
    index = parentIndex;
  }
}

function popSearchNode(heap) {
  const top = heap[0];
  const last = heap.pop();

  if (heap.length > 0) {
    heap[0] = last;
    let index = 0;

    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = index * 2 + 2;
      let smallestIndex = index;

      if (leftIndex < heap.length && searchScore(heap[leftIndex]) < searchScore(heap[smallestIndex])) {
        smallestIndex = leftIndex;
      }

      if (rightIndex < heap.length && searchScore(heap[rightIndex]) < searchScore(heap[smallestIndex])) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === index) break;
      [heap[index], heap[smallestIndex]] = [heap[smallestIndex], heap[index]];
      index = smallestIndex;
    }
  }

  return top;
}

function greedyHintMove(tiles, size) {
  const neighbors = hintNeighbors(tiles, size);
  if (neighbors.length === 0) return null;

  neighbors.sort((a, b) => manhattanDistance(a.tiles, size) - manhattanDistance(b.tiles, size));
  return neighbors[0].moveIndex;
}

function updateGameMetrics() {
  elapsedSeconds();
}

async function finishGame(status) {
  if (!state.currentSession || state.currentSession.finished) return;

  state.currentSession.finished = true;
  setTimer(false);

  try {
    await api(`/api/sessions/${state.currentSession.id}/finish`, {
      method: "PATCH",
      body: JSON.stringify({
        completionStatus: status,
        moveCount: state.currentSession.moves,
        hintCount: state.currentSession.hints,
        totalTimeSeconds: elapsedSeconds(),
      }),
    });
  } catch (error) {
    console.error(error);
  }

  state.currentSession.finalStatus = status;
  state.view = "thanks";
  render();
}

function renderThanks() {
  app.innerHTML = `
    <button class="thank-you-panel" id="resetButton" type="button">
      <span>
        <h1>Thank you for Playing</h1>
        <p>Tap to return to the start screen.</p>
      </span>
    </button>
  `;

  document.querySelector("#resetButton").addEventListener("click", goHome);
}

async function openLogin() {
  loginModal.classList.remove("hidden");
  pinInput.value = "";
  pinError.textContent = "";
  pinInput.focus();
}

function closeLogin() {
  loginModal.classList.add("hidden");
  pinInput.value = "";
  pinError.textContent = "";
  loginButton.focus();
}

async function submitLogin(event) {
  event.preventDefault();
  const pin = pinInput.value;

  try {
    await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ pin }),
    });

    state.dashboardPin = pin;
    loginModal.classList.add("hidden");
    pinInput.value = "";
    pinError.textContent = "";
    await loadDashboard();
  } catch (error) {
    pinError.textContent = "Incorrect PIN. Please try again.";
    pinInput.select();
  }
}

async function loadDashboard() {
  try {
    const data = await api(`/api/sessions?pin=${encodeURIComponent(state.dashboardPin)}`);
    state.sessions = data.sessions;
    state.selectedSessionId = data.sessions[0]?.id || null;
    state.selectedSession = null;
    if (state.selectedSessionId) {
      await loadSessionDetail(state.selectedSessionId, false);
    }
    state.view = "dashboard";
    render();
  } catch (error) {
    state.dashboardPin = "";
    pinError.textContent = error.message;
    openLogin();
  }
}

async function loadSessionDetail(id, shouldRender = true) {
  const data = await api(`/api/sessions/${id}?pin=${encodeURIComponent(state.dashboardPin)}`);
  state.selectedSessionId = id;
  state.selectedSession = data.session;
  if (shouldRender) renderDashboard();
}

function renderDashboard() {
  const rows = state.sessions.map((session) => {
    const selectedClass = session.id === state.selectedSessionId ? " is-selected" : "";
    return `
      <button class="session-row${selectedClass}" type="button" data-session-id="${session.id}">
        <strong>${session.patientNickname || "Anonymous session"}</strong>
        <span>${formatDate(session.startedAt)}</span>
        <span>${formatStatus(session.completionStatus)} / ${session.moveCount} moves</span>
      </button>
    `;
  }).join("");

  app.innerHTML = `
    <section class="dashboard-panel">
      <div class="view-header">
        <div>
          <p class="eyebrow">Psychiatrist Area</p>
          <h1>Clinical Dashboard</h1>
        </div>
        <button class="secondary-button" id="dashboardExitButton" type="button">Close</button>
      </div>
      <div class="dashboard-layout">
        <div>
          <div class="sessions-heading">
            <h2>Sessions</h2>
            <button class="reset-button" id="resetHistoryButton" type="button">reset</button>
          </div>
          <div class="session-list" id="sessionList">
            ${rows || `<p class="empty-state">No session data yet.</p>`}
          </div>
        </div>
        <div class="detail-card" id="sessionDetail">
          ${detailMarkup(state.selectedSession)}
        </div>
      </div>
    </section>
  `;

  document.querySelector("#dashboardExitButton").addEventListener("click", () => {
    state.dashboardPin = "";
    goHome();
  });

  document.querySelector("#sessionList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-session-id]");
    if (!button) return;
    await loadSessionDetail(Number(button.dataset.sessionId));
  });

  const deleteButton = document.querySelector("#deleteSessionButton");
  if (deleteButton) {
    deleteButton.addEventListener("click", deleteSelectedSession);
  }

  document.querySelector("#resetHistoryButton").addEventListener("click", resetHistory);
}

function detailMarkup(session) {
  if (!session) {
    return `<p class="empty-state">Select a session to inspect metrics.</p>`;
  }

  const isRunning = session.completionStatus === "started";
  const deleteControl = isRunning
    ? `<button class="danger-button" id="deleteSessionButton" type="button" disabled>Delete Session</button>
       <p class="helper-text">Running sessions can be deleted after they end.</p>`
    : `<button class="danger-button" id="deleteSessionButton" type="button">Delete Session</button>`;

  return `
    <h2>Session Details</h2>
    <div class="detail-grid">
      <div><span>Patient</span><strong>${session.patientNickname || "Anonymous"}</strong></div>
      <div><span>Status</span><strong>${formatStatus(session.completionStatus)}</strong></div>
      <div><span>Started</span><strong>${formatDate(session.startedAt)}</strong></div>
      <div><span>Ended</span><strong>${formatDate(session.endedAt)}</strong></div>
      <div><span>Difficulty</span><strong>${DIFFICULTIES[session.difficulty]?.label || session.difficulty}</strong></div>
      <div><span>Board</span><strong>${session.boardSize}x${session.boardSize}</strong></div>
      <div><span>Image</span><strong>${session.imageName}</strong></div>
      <div><span>Tag</span><strong>${session.imageTag}</strong></div>
      <div><span>Total Time</span><strong>${session.totalTimeSeconds ?? 0}s</strong></div>
      <div><span>Moves</span><strong>${session.moveCount}</strong></div>
      <div><span>Time Limit</span><strong>${formatLimit(session.timeLimitSeconds, "s")}</strong></div>
      <div><span>Move Limit</span><strong>${formatLimit(session.moveLimit, "moves")}</strong></div>
      <div><span>Hints</span><strong>${session.hintCount ?? 0}</strong></div>
    </div>
    <div class="detail-actions">
      ${deleteControl}
    </div>
  `;
}

async function deleteSelectedSession() {
  if (!state.selectedSessionId || state.selectedSession?.completionStatus === "started") return;

  await api(`/api/sessions/${state.selectedSessionId}?pin=${encodeURIComponent(state.dashboardPin)}`, {
    method: "DELETE",
  });

  await loadDashboard();
}

async function resetHistory() {
  const confirmed = window.confirm("Reset all session history? This cannot be undone.");
  if (!confirmed) return;

  await api(`/api/sessions?pin=${encodeURIComponent(state.dashboardPin)}`, {
    method: "DELETE",
  });

  state.sessions = [];
  state.selectedSessionId = null;
  state.selectedSession = null;
  renderDashboard();
}

function goHome() {
  state.view = "home";
  state.currentSession = null;
  if (state.hintHighlightTimerId) {
    clearTimeout(state.hintHighlightTimerId);
    state.hintHighlightTimerId = null;
  }
  state.selectedSession = null;
  state.selectedSessionId = null;
  render();
}

homeButton.addEventListener("click", goHome);
loginButton.addEventListener("click", openLogin);
closeLoginButton.addEventListener("click", closeLogin);
cancelLoginButton.addEventListener("click", closeLogin);
pinForm.addEventListener("submit", submitLogin);

loginModal.addEventListener("click", (event) => {
  if (event.target === loginModal) closeLogin();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !loginModal.classList.contains("hidden")) {
    closeLogin();
  }
});

render();
