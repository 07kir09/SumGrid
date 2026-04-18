import {
  BOARD_SIZES,
  CELL_STATES,
  DEFAULT_DIFFICULTY,
  DEFAULT_PLAYER_NAME,
  DEFAULT_SIZE,
  DIFFICULTIES,
} from "./constants.js";
import {
  checkNicknameAvailability,
  fetchLeaderboard,
  registerNickname,
  submitResult,
} from "./api.js";
import {
  buildEmptyMarks,
  calculateColumnSums,
  calculateRowSums,
  generatePuzzle,
  getLineStatus,
  summarizeTargets,
} from "./generator.js";
import {
  calculateRoundScore,
  isNicknameValid,
  normalizePlayerName,
  sanitizeNickname,
} from "./scoring.js";
import { loadPersistedState, savePersistedState } from "./storage.js";
import { cloneMatrix, createMatrix, formatDuration, pluralizeRu } from "./utils.js";

const DEFAULT_MESSAGE =
  "Отмечай клетки так, чтобы суммы в строках и столбцах совпали с целями по краям.";
const LEADERBOARD_LIMIT = 8;

export class SumGridGame {
  constructor() {
    this.listeners = new Set();
    this.isSyncingResults = false;
    this.profileAvailabilityRequestId = 0;
    this.state = this.createBaseState();

    const restored = this.restore();

    if (!restored) {
      this.startNewGame({
        size: DEFAULT_SIZE,
        difficultyId: DEFAULT_DIFFICULTY,
        announce: false,
      });
      this.persist();
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getViewModel());

    return () => {
      this.listeners.delete(listener);
    };
  }

  async initialize() {
    if (!this.state.isProfileReady) {
      return;
    }

    if (this.state.pendingResults.length > 0) {
      await this.flushPendingResults();
      return;
    }

    await this.refreshLeaderboard({ silent: true });
  }

  startNewGame({
    size = this.state.size,
    difficultyId = this.state.difficultyId,
    announce = true,
  } = {}) {
    const nextSize = BOARD_SIZES.includes(size) ? size : DEFAULT_SIZE;
    const nextDifficulty = DIFFICULTIES[difficultyId]
      ? difficultyId
      : DEFAULT_DIFFICULTY;
    const puzzle = generatePuzzle({ size: nextSize, difficultyId: nextDifficulty });

    this.state = {
      ...this.state,
      size: nextSize,
      difficultyId: nextDifficulty,
      puzzle,
      marks: buildEmptyMarks(nextSize),
      hintCells: buildHintMatrix(nextSize),
      isSolved: false,
      isRoundStarted: false,
      hasRecordedWin: false,
      moves: 0,
      checks: 0,
      hintsUsed: 0,
      elapsedMs: 0,
      timerBaseMs: null,
      message: announce
        ? `Новая доска ${nextSize}×${nextSize}, режим «${
            DIFFICULTIES[nextDifficulty].label
          }». Нажми «Начать игру».`
        : "Поле готово. Нажми «Начать игру».",
    };

    this.persist();
    this.emit();
  }

  openProfilePanel() {
    if (!this.state.isProfileReady || this.state.isProfilePanelOpen) {
      return;
    }

    this.state.isProfilePanelOpen = true;
    this.emit();
    void this.refreshLeaderboard({ silent: true });
  }

  closeProfilePanel() {
    if (!this.state.isProfilePanelOpen) {
      return;
    }

    this.state.isProfilePanelOpen = false;
    this.emit();
  }

  toggleProfilePanel() {
    if (this.state.isProfilePanelOpen) {
      this.closeProfilePanel();
      return;
    }

    this.openProfilePanel();
  }

  async previewProfileAvailability(nicknameInput) {
    const nickname = sanitizeNickname(nicknameInput);

    this.state.profileDraft = nickname;

    if (!nickname) {
      this.state.isProfileChecking = false;
      this.state.profileStatusMessage = "";
      this.state.profileStatusTone = "neutral";
      this.emit();
      return false;
    }

    if (!isNicknameValid(nickname)) {
      this.state.isProfileChecking = false;
      this.state.profileStatusMessage =
        "Ник должен быть длиной от 3 символов и содержать только буквы, цифры, _ или -.";
      this.state.profileStatusTone = "danger";
      this.emit();
      return false;
    }

    const requestId = ++this.profileAvailabilityRequestId;
    this.state.isProfileChecking = true;
    this.state.profileStatusMessage = "Проверяем ник...";
    this.state.profileStatusTone = "neutral";
    this.emit();

    try {
      const payload = await checkNicknameAvailability(nickname);

      if (requestId !== this.profileAvailabilityRequestId) {
        return false;
      }

      this.state.isProfileChecking = false;
      this.state.profileStatusMessage = payload?.message || "";
      this.state.profileStatusTone = payload?.available ? "success" : "danger";
      this.emit();

      return Boolean(payload?.available);
    } catch (error) {
      if (requestId !== this.profileAvailabilityRequestId) {
        return false;
      }

      this.state.isProfileChecking = false;
      this.state.profileStatusMessage =
        error instanceof Error ? error.message : "Не удалось проверить ник.";
      this.state.profileStatusTone = "danger";
      this.emit();
      return false;
    }
  }

  async registerProfile(nicknameInput) {
    const nickname = sanitizeNickname(nicknameInput);

    this.state.profileDraft = nickname;
    this.profileAvailabilityRequestId += 1;

    if (!isNicknameValid(nickname)) {
      this.state.profileStatusMessage =
        "Ник должен быть длиной от 3 символов и содержать только буквы, цифры, _ или -.";
      this.state.profileStatusTone = "danger";
      this.emit();
      return false;
    }

    this.state.isProfileSubmitting = true;
    this.state.profileStatusMessage = "Создаём профиль...";
    this.state.profileStatusTone = "neutral";
    this.emit();

    try {
      const payload = await registerNickname(nickname, { limit: LEADERBOARD_LIMIT });

      this.state.playerName = nickname;
      this.state.isProfileReady = true;
      this.state.isProfileSubmitting = false;
      this.state.isProfileChecking = false;
      this.state.profileStatusMessage = "Профиль создан. Ник закреплён за тобой на этом устройстве.";
      this.state.profileStatusTone = "success";
      this.applyLeaderboardResponse(payload);
      this.persist();
      this.emit();
      return true;
    } catch (error) {
      this.state.isProfileSubmitting = false;
      this.state.isProfileChecking = false;
      this.state.profileStatusMessage =
        error instanceof Error ? error.message : "Не удалось создать профиль.";
      this.state.profileStatusTone = "danger";
      this.emit();
      return false;
    }
  }

  setSize(size) {
    if (!BOARD_SIZES.includes(size) || size === this.state.size) {
      return;
    }

    this.startNewGame({ size });
  }

  setDifficulty(difficultyId) {
    if (!DIFFICULTIES[difficultyId] || difficultyId === this.state.difficultyId) {
      return;
    }

    this.startNewGame({ difficultyId });
  }

  resetBoard() {
    if (!this.state.puzzle || !this.state.isProfileReady) {
      return;
    }

    this.state.marks = buildEmptyMarks(this.state.size);
    this.state.hintCells = buildHintMatrix(this.state.size);
    this.state.isSolved = false;
    this.state.isRoundStarted = false;
    this.state.hasRecordedWin = false;
    this.state.moves = 0;
    this.state.checks = 0;
    this.state.hintsUsed = 0;
    this.state.elapsedMs = 0;
    this.state.timerBaseMs = null;
    this.state.message = "Поле сброшено. Нажми «Начать игру», когда будешь готов.";

    this.persist();
    this.emit();
  }

  startRound() {
    if (
      !this.state.isProfileReady ||
      !this.state.puzzle ||
      this.state.isSolved ||
      this.state.isRoundStarted
    ) {
      return;
    }

    this.state.isRoundStarted = true;
    this.state.timerBaseMs = Date.now() - this.state.elapsedMs;
    this.state.message =
      this.state.moves > 0 || this.state.elapsedMs > 0
        ? "Игра продолжена. Таймер снова запущен."
        : "Игра началась. Собери правильные суммы.";

    this.persist();
    this.emit();
  }

  pauseRound({ silent = false } = {}) {
    if (!this.state.puzzle || this.state.isSolved || !this.state.isRoundStarted) {
      return false;
    }

    this.state.elapsedMs = this.getElapsedMs();
    this.state.timerBaseMs = null;
    this.state.isRoundStarted = false;

    if (!silent) {
      this.state.message = "Игра на паузе. Нажми «Продолжить игру».";
    }

    this.persist();

    if (!silent) {
      this.emit();
    }

    return true;
  }

  cycleCell(rowIndex, columnIndex) {
    if (
      !this.state.isProfileReady ||
      !this.state.puzzle ||
      this.state.isSolved ||
      !this.state.isRoundStarted
    ) {
      return;
    }

    if (this.state.hintCells[rowIndex]?.[columnIndex]) {
      return;
    }

    const nextMarks = cloneMatrix(this.state.marks);
    nextMarks[rowIndex][columnIndex] = (nextMarks[rowIndex][columnIndex] + 1) % 3;

    this.state.marks = nextMarks;
    this.state.moves += 1;

    const derived = this.getDerivedState();

    if (derived.allCorrect) {
      this.completePuzzle();
      return;
    }

    if (derived.exceededLines > 0) {
      this.state.message =
        "Одна или несколько линий превысили цель. Вычеркни лишние клетки.";
    } else {
      this.state.message =
        "Продолжай сверять суммы строк и столбцов с целями по краям.";
    }

    this.persist();
    this.emit();
  }

  useHint() {
    if (!this.state.isProfileReady || !this.state.puzzle) {
      return;
    }

    if (!this.state.isRoundStarted) {
      this.state.message = "Сначала нажми «Начать игру».";
      this.persist();
      this.emit();
      return;
    }

    const hintedCell = this.pickHintCell();

    if (!hintedCell) {
      this.state.message = "Все нужные клетки уже подсвечены. Дальше только логика.";
      this.persist();
      this.emit();
      return;
    }

    const nextMarks = cloneMatrix(this.state.marks);
    const nextHintCells = cloneMatrix(this.state.hintCells);

    nextMarks[hintedCell.rowIndex][hintedCell.columnIndex] = CELL_STATES.SELECTED;
    nextHintCells[hintedCell.rowIndex][hintedCell.columnIndex] = true;

    this.state.marks = nextMarks;
    this.state.hintCells = nextHintCells;
    this.state.hintsUsed += 1;
    this.state.message = `Подсказка дала нужную клетку: строка ${
      hintedCell.rowIndex + 1
    }, столбец ${hintedCell.columnIndex + 1}. Эта клетка уже входит в решение.`;

    const derived = this.getDerivedState();

    if (derived.allCorrect) {
      this.completePuzzle();
      return;
    }

    this.persist();
    this.emit();
  }

  tick() {
    if (
      this.state.isSolved ||
      !this.state.isRoundStarted ||
      this.state.timerBaseMs === null
    ) {
      return null;
    }

    const nextElapsed = Date.now() - this.state.timerBaseMs;
    const previousSecond = Math.floor(this.state.elapsedMs / 1000);
    const nextSecond = Math.floor(nextElapsed / 1000);

    this.state.elapsedMs = nextElapsed;

    if (nextSecond !== previousSecond) {
      this.persist();
      return formatDuration(nextElapsed);
    }

    return null;
  }

  flush() {
    this.persist();
  }

  refresh() {
    this.emit();
  }

  async refreshLeaderboard({ silent = false } = {}) {
    if (this.isSyncingResults || !this.state.isProfileReady) {
      return;
    }

    this.state.isLeaderboardLoading = true;

    if (!silent) {
      this.state.leaderboardError = "";
      this.emit();
    }

    try {
      const payload = await fetchLeaderboard({
        playerName: this.state.playerName,
        limit: LEADERBOARD_LIMIT,
      });

      this.applyLeaderboardResponse(payload);
    } catch (error) {
      this.state.leaderboardError =
        error instanceof Error ? error.message : "Не удалось загрузить общий рейтинг.";
    } finally {
      this.state.isLeaderboardLoading = false;
      this.emit();
    }
  }

  getViewModel() {
    const derived = this.getDerivedState();
    const difficulty = DIFFICULTIES[this.state.difficultyId];
    const totals = summarizeTargets(this.state.puzzle);
    const roundScore = this.state.isSolved ? this.getRoundScore() : null;

    return {
      ...this.state,
      difficulty,
      difficulties: Object.values(DIFFICULTIES),
      boardSizes: BOARD_SIZES,
      elapsedLabel: formatDuration(this.getElapsedMs()),
      progressPercent:
        derived.totalLines > 0
          ? Math.round((derived.correctLines / derived.totalLines) * 100)
          : 0,
      totalLines: derived.totalLines,
      correctLines: derived.correctLines,
      exceededLines: derived.exceededLines,
      incompleteLines: derived.incompleteLines,
      rowSums: derived.rowSums,
      columnSums: derived.columnSums,
      rowStatuses: derived.rowStatuses,
      columnStatuses: derived.columnStatuses,
      selectionCount: derived.selectionCount,
      grandTarget: totals.rowTotal,
      boardLocked:
        !this.state.isProfileReady ||
        (!this.state.isSolved && !this.state.isRoundStarted),
      startButtonLabel:
        this.state.moves > 0 || this.state.elapsedMs > 0
          ? "Продолжить игру"
          : "Начать игру",
      themeTone: this.state.isSolved
        ? "success"
        : derived.exceededLines > 0
        ? "warning"
        : "neutral",
      remainingHints: this.getAvailableHintCells().length,
      roundScore: roundScore?.score ?? null,
      roundScoreBreakdown: roundScore?.breakdown ?? null,
      hasPendingProfileAction:
        this.state.isProfileChecking || this.state.isProfileSubmitting,
    };
  }

  createBaseState() {
    return {
      size: DEFAULT_SIZE,
      difficultyId: DEFAULT_DIFFICULTY,
      playerName: "",
      isProfileReady: false,
      isProfilePanelOpen: false,
      profileDraft: "",
      profileStatusMessage: "",
      profileStatusTone: "neutral",
      isProfileChecking: false,
      isProfileSubmitting: false,
      puzzle: null,
      marks: buildEmptyMarks(DEFAULT_SIZE),
      hintCells: buildHintMatrix(DEFAULT_SIZE),
      isSolved: false,
      isRoundStarted: false,
      hasRecordedWin: false,
      totalWins: 0,
      moves: 0,
      checks: 0,
      hintsUsed: 0,
      elapsedMs: 0,
      timerBaseMs: null,
      message: DEFAULT_MESSAGE,
      leaderboard: [],
      currentPlayer: createEmptyPlayerStats(""),
      isLeaderboardLoading: false,
      leaderboardError: "",
      pendingResults: [],
    };
  }

  getDerivedState() {
    const puzzle = this.state.puzzle;

    if (!puzzle) {
      return {
        rowSums: [],
        columnSums: [],
        rowStatuses: [],
        columnStatuses: [],
        selectionCount: 0,
        totalLines: 0,
        correctLines: 0,
        exceededLines: 0,
        incompleteLines: 0,
        allCorrect: false,
      };
    }

    const rowSums = calculateRowSums(puzzle.numbers, this.state.marks);
    const columnSums = calculateColumnSums(puzzle.numbers, this.state.marks);
    const rowStatuses = rowSums.map((value, rowIndex) =>
      getLineStatus(value, puzzle.rowTargets[rowIndex])
    );
    const columnStatuses = columnSums.map((value, columnIndex) =>
      getLineStatus(value, puzzle.columnTargets[columnIndex])
    );
    const correctLines =
      rowStatuses.filter((status) => status === "correct").length +
      columnStatuses.filter((status) => status === "correct").length;
    const exceededLines =
      rowStatuses.filter((status) => status === "exceeded").length +
      columnStatuses.filter((status) => status === "exceeded").length;
    const totalLines = puzzle.size * 2;
    const incompleteLines = totalLines - correctLines - exceededLines;
    const selectionCount = this.state.marks.reduce(
      (total, row) =>
        total +
        row.filter((cellState) => cellState === CELL_STATES.SELECTED).length,
      0
    );

    return {
      rowSums,
      columnSums,
      rowStatuses,
      columnStatuses,
      correctLines,
      exceededLines,
      incompleteLines,
      totalLines,
      selectionCount,
      allCorrect: correctLines === totalLines,
    };
  }

  restore() {
    const saved = loadPersistedState();

    if (!saved) {
      return false;
    }

    const normalizedState = this.normalizeState(saved);

    if (!normalizedState) {
      return false;
    }

    this.state = normalizedState;
    return true;
  }

  normalizeState(saved) {
    const size = BOARD_SIZES.includes(saved?.size) ? saved.size : DEFAULT_SIZE;
    const difficultyId = DIFFICULTIES[saved?.difficultyId]
      ? saved.difficultyId
      : DEFAULT_DIFFICULTY;
    const puzzle = isPuzzleShape(saved?.puzzle, size) ? saved.puzzle : null;

    if (!puzzle) {
      return null;
    }

    const persistedPlayerName = sanitizeNickname(saved?.playerName);
    const isProfileReady = Boolean(saved?.isProfileReady) && isNicknameValid(persistedPlayerName);
    const marks = isMarksMatrix(saved?.marks, size)
      ? saved.marks
      : buildEmptyMarks(size);
    const hintCells = isBooleanMatrix(saved?.hintCells, size)
      ? saved.hintCells
      : buildHintMatrix(size);
    const elapsedMs = Number.isFinite(saved?.elapsedMs)
      ? Math.max(0, saved.elapsedMs)
      : 0;
    const isSolved = Boolean(saved?.isSolved) && this.areTargetsMet(puzzle, marks);
    const isRoundStarted = Boolean(saved?.isRoundStarted) && !isSolved;
    const profileDraft = sanitizeNickname(saved?.profileDraft || persistedPlayerName);

    return {
      size,
      difficultyId,
      playerName: isProfileReady ? persistedPlayerName : "",
      isProfileReady,
      isProfilePanelOpen: false,
      profileDraft,
      profileStatusMessage: "",
      profileStatusTone: "neutral",
      isProfileChecking: false,
      isProfileSubmitting: false,
      puzzle,
      marks,
      hintCells,
      isSolved,
      isRoundStarted,
      hasRecordedWin: isSolved ? Boolean(saved?.hasRecordedWin) : false,
      totalWins: Number.isFinite(saved?.totalWins) ? Math.max(0, saved.totalWins) : 0,
      moves: Number.isFinite(saved?.moves) ? Math.max(0, saved.moves) : 0,
      checks: Number.isFinite(saved?.checks) ? Math.max(0, saved.checks) : 0,
      hintsUsed: Number.isFinite(saved?.hintsUsed) ? Math.max(0, saved.hintsUsed) : 0,
      elapsedMs,
      timerBaseMs: isSolved || !isRoundStarted
        ? null
        : Number.isFinite(saved?.timerBaseMs)
        ? saved.timerBaseMs
        : Date.now() - elapsedMs,
      message: isSolved
        ? typeof saved?.message === "string"
          ? saved.message
          : DEFAULT_MESSAGE
        : isRoundStarted
        ? typeof saved?.message === "string"
          ? saved.message
          : DEFAULT_MESSAGE
        : "Поле готово. Нажми «Начать игру».",
      leaderboard: [],
      currentPlayer: createEmptyPlayerStats(isProfileReady ? persistedPlayerName : ""),
      isLeaderboardLoading: false,
      leaderboardError: "",
      pendingResults: normalizePendingResults(saved?.pendingResults),
    };
  }

  areTargetsMet(puzzle, marks) {
    const rowSums = calculateRowSums(puzzle.numbers, marks);
    const columnSums = calculateColumnSums(puzzle.numbers, marks);

    return (
      rowSums.every((value, rowIndex) => value === puzzle.rowTargets[rowIndex]) &&
      columnSums.every(
        (value, columnIndex) => value === puzzle.columnTargets[columnIndex]
      )
    );
  }

  completePuzzle() {
    if (this.state.isSolved) {
      return;
    }

    this.state.elapsedMs = this.getElapsedMs();
    this.state.timerBaseMs = null;
    this.state.isSolved = true;
    this.state.isRoundStarted = false;

    const roundScore = this.getRoundScore();

    if (!this.state.hasRecordedWin) {
      this.state.totalWins += 1;
      this.state.hasRecordedWin = true;
      this.state.pendingResults = [
        ...this.state.pendingResults,
        this.createResultPayload(),
      ];
    }

    this.state.message = `Поздравляем! Раунд пройден за ${formatDuration(
      this.state.elapsedMs
    )}, использовано ${this.state.hintsUsed} ${pluralizeRu(
      this.state.hintsUsed,
      "подсказка",
      "подсказки",
      "подсказок"
    )}, начислено ${roundScore.score} очков.`;

    this.persist();
    this.emit();
    void this.flushPendingResults();
  }

  getElapsedMs() {
    if (this.state.isSolved || this.state.timerBaseMs === null) {
      return this.state.elapsedMs;
    }

    return Date.now() - this.state.timerBaseMs;
  }

  persist() {
    const snapshot = {
      ...this.state,
      elapsedMs: this.getElapsedMs(),
      timerBaseMs: this.state.isSolved ? null : this.state.timerBaseMs,
      leaderboard: [],
      currentPlayer: createEmptyPlayerStats(this.state.playerName),
      isLeaderboardLoading: false,
      leaderboardError: "",
      isProfilePanelOpen: false,
      isProfileChecking: false,
      isProfileSubmitting: false,
      profileStatusMessage: "",
      profileStatusTone: "neutral",
    };

    savePersistedState(snapshot);
  }

  emit() {
    const viewModel = this.getViewModel();
    this.listeners.forEach((listener) => listener(viewModel));
  }

  getAvailableHintCells() {
    if (!this.state.puzzle) {
      return [];
    }

    const derived = this.getDerivedState();
    const candidates = [];

    this.state.puzzle.solution.forEach((row, rowIndex) => {
      row.forEach((isSolutionCell, columnIndex) => {
        if (
          !isSolutionCell ||
          this.state.hintCells[rowIndex][columnIndex] ||
          this.state.marks[rowIndex][columnIndex] === CELL_STATES.SELECTED
        ) {
          return;
        }

        const priority =
          (derived.rowStatuses[rowIndex] !== "correct" ? 1 : 0) +
          (derived.columnStatuses[columnIndex] !== "correct" ? 1 : 0);

        candidates.push({ rowIndex, columnIndex, priority });
      });
    });

    return candidates.sort((left, right) => right.priority - left.priority);
  }

  pickHintCell() {
    return this.getAvailableHintCells()[0] ?? null;
  }

  getRoundScore() {
    return calculateRoundScore({
      size: this.state.size,
      difficultyId: this.state.difficultyId,
      elapsedMs: this.state.elapsedMs,
      moves: this.state.moves,
      checks: this.state.checks,
      hintsUsed: this.state.hintsUsed,
      solutionRevealCount: 0,
    });
  }

  createResultPayload() {
    return {
      playerName: this.state.playerName,
      size: this.state.size,
      difficultyId: this.state.difficultyId,
      moves: this.state.moves,
      checks: this.state.checks,
      hintsUsed: this.state.hintsUsed,
      solutionRevealCount: 0,
      elapsedMs: this.state.elapsedMs,
      boardId: this.state.puzzle?.id,
      createdAt: new Date().toISOString(),
    };
  }

  async flushPendingResults() {
    if (
      this.isSyncingResults ||
      !this.state.isProfileReady ||
      this.state.pendingResults.length === 0
    ) {
      return;
    }

    this.isSyncingResults = true;
    this.state.isLeaderboardLoading = true;
    this.state.leaderboardError = "";
    this.emit();

    try {
      while (this.state.pendingResults.length > 0) {
        const nextResult = this.state.pendingResults[0];
        const payload = await submitResult(nextResult, {
          viewerName: this.state.playerName,
          limit: LEADERBOARD_LIMIT,
        });

        this.state.pendingResults = this.state.pendingResults.slice(1);
        this.applyLeaderboardResponse(payload);
        this.persist();
        this.emit();
      }
    } catch (error) {
      this.state.leaderboardError =
        error instanceof Error ? error.message : "Не удалось обновить общий рейтинг.";
    } finally {
      this.isSyncingResults = false;
      this.state.isLeaderboardLoading = false;
      this.persist();
      this.emit();
    }
  }

  applyLeaderboardResponse(payload) {
    this.state.leaderboard = normalizeRemoteLeaderboard(payload?.leaderboard);
    this.state.currentPlayer = normalizeRemotePlayer(
      payload?.currentPlayer,
      this.state.playerName
    );
    this.state.leaderboardError = "";
  }
}

function buildHintMatrix(size) {
  return createMatrix(size, false);
}

function createEmptyPlayerStats(playerName) {
  return {
    playerName: playerName ? normalizePlayerName(playerName) : DEFAULT_PLAYER_NAME,
    totalScore: 0,
    wins: 0,
    bestScore: 0,
    averageScore: 0,
    rank: null,
    lastPlayedAt: null,
  };
}

function normalizePendingResults(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => normalizePendingResult(entry))
    .filter(Boolean)
    .slice(0, 20);
}

function normalizePendingResult(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const playerName = sanitizeNickname(entry.playerName);
  const size = BOARD_SIZES.includes(entry.size) ? entry.size : null;
  const difficultyId = DIFFICULTIES[entry.difficultyId] ? entry.difficultyId : null;

  if (!playerName || !size || !difficultyId) {
    return null;
  }

  return {
    playerName,
    size,
    difficultyId,
    moves: Number.isFinite(entry.moves) ? Math.max(0, entry.moves) : 0,
    checks: Number.isFinite(entry.checks) ? Math.max(0, entry.checks) : 0,
    hintsUsed: Number.isFinite(entry.hintsUsed) ? Math.max(0, entry.hintsUsed) : 0,
    solutionRevealCount: 0,
    elapsedMs: Number.isFinite(entry.elapsedMs) ? Math.max(0, entry.elapsedMs) : 0,
    boardId: typeof entry.boardId === "string" ? entry.boardId : "unknown-board",
    createdAt:
      typeof entry.createdAt === "string" && Number.isFinite(Date.parse(entry.createdAt))
        ? new Date(entry.createdAt).toISOString()
        : new Date().toISOString(),
  };
}

function normalizeRemoteLeaderboard(leaderboard) {
  if (!Array.isArray(leaderboard)) {
    return [];
  }

  return leaderboard
    .map((entry, index) => normalizeRemoteLeaderboardEntry(entry, index))
    .filter(Boolean);
}

function normalizeRemoteLeaderboardEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return {
    rank: Number.isFinite(entry.rank) ? entry.rank : index + 1,
    playerName: normalizePlayerName(entry.playerName),
    totalScore: Number.isFinite(entry.totalScore) ? Math.max(0, entry.totalScore) : 0,
    wins: Number.isFinite(entry.wins) ? Math.max(0, entry.wins) : 0,
    bestScore: Number.isFinite(entry.bestScore) ? Math.max(0, entry.bestScore) : 0,
    averageScore: Number.isFinite(entry.averageScore)
      ? Math.max(0, entry.averageScore)
      : 0,
    lastPlayedAt:
      typeof entry.lastPlayedAt === "string" && Number.isFinite(Date.parse(entry.lastPlayedAt))
        ? entry.lastPlayedAt
        : null,
  };
}

function normalizeRemotePlayer(entry, fallbackName) {
  if (!entry || typeof entry !== "object") {
    return createEmptyPlayerStats(fallbackName);
  }

  return {
    playerName: normalizePlayerName(entry.playerName ?? fallbackName),
    totalScore: Number.isFinite(entry.totalScore) ? Math.max(0, entry.totalScore) : 0,
    wins: Number.isFinite(entry.wins) ? Math.max(0, entry.wins) : 0,
    bestScore: Number.isFinite(entry.bestScore) ? Math.max(0, entry.bestScore) : 0,
    averageScore: Number.isFinite(entry.averageScore) ? Math.max(0, entry.averageScore) : 0,
    rank: Number.isFinite(entry.rank) ? entry.rank : null,
    lastPlayedAt:
      typeof entry.lastPlayedAt === "string" && Number.isFinite(Date.parse(entry.lastPlayedAt))
        ? entry.lastPlayedAt
        : null,
  };
}

function isPuzzleShape(puzzle, size) {
  return (
    Boolean(puzzle) &&
    Number.isFinite(puzzle.size) &&
    puzzle.size === size &&
    isNumberMatrix(puzzle.numbers, size) &&
    isBooleanMatrix(puzzle.solution, size) &&
    Array.isArray(puzzle.rowTargets) &&
    puzzle.rowTargets.length === size &&
    puzzle.rowTargets.every(Number.isFinite) &&
    Array.isArray(puzzle.columnTargets) &&
    puzzle.columnTargets.length === size &&
    puzzle.columnTargets.every(Number.isFinite)
  );
}

function isNumberMatrix(matrix, size) {
  return (
    Array.isArray(matrix) &&
    matrix.length === size &&
    matrix.every(
      (row) =>
        Array.isArray(row) &&
        row.length === size &&
        row.every((value) => Number.isFinite(value))
    )
  );
}

function isBooleanMatrix(matrix, size) {
  return (
    Array.isArray(matrix) &&
    matrix.length === size &&
    matrix.every(
      (row) =>
        Array.isArray(row) &&
        row.length === size &&
        row.every((value) => typeof value === "boolean")
    )
  );
}

function isMarksMatrix(matrix, size) {
  const validStates = new Set(Object.values(CELL_STATES));

  return (
    Array.isArray(matrix) &&
    matrix.length === size &&
    matrix.every(
      (row) =>
        Array.isArray(row) &&
        row.length === size &&
        row.every((value) => validStates.has(value))
    )
  );
}
