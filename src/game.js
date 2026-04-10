import {
  BOARD_SIZES,
  CELL_STATES,
  DEFAULT_DIFFICULTY,
  DEFAULT_SIZE,
  DIFFICULTIES,
} from "./constants.js";
import {
  buildEmptyMarks,
  calculateColumnSums,
  calculateRowSums,
  generatePuzzle,
  getLineStatus,
  summarizeTargets,
} from "./generator.js";
import { loadPersistedState, savePersistedState } from "./storage.js";
import { cloneMatrix, formatDuration, pluralizeRu } from "./utils.js";

const DEFAULT_MESSAGE =
  "Отмечай клетки так, чтобы суммы в строках и столбцах совпали с целями по краям.";

export class SumGridGame {
  constructor() {
    this.listeners = new Set();
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
      showSolution: false,
      isSolved: false,
      isRoundStarted: false,
      hasRecordedWin: false,
      moves: 0,
      checks: 0,
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
    if (!this.state.puzzle) {
      return;
    }

    this.state.marks = buildEmptyMarks(this.state.size);
    this.state.showSolution = false;
    this.state.isSolved = false;
    this.state.isRoundStarted = false;
    this.state.hasRecordedWin = false;
    this.state.moves = 0;
    this.state.checks = 0;
    this.state.elapsedMs = 0;
    this.state.timerBaseMs = null;
    this.state.message = "Поле сброшено. Нажми «Начать игру», когда будешь готов.";

    this.persist();
    this.emit();
  }

  startRound() {
    if (!this.state.puzzle || this.state.isSolved || this.state.isRoundStarted) {
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
    if (!this.state.puzzle || this.state.isSolved || !this.state.isRoundStarted) {
      return;
    }

    const nextMarks = cloneMatrix(this.state.marks);
    nextMarks[rowIndex][columnIndex] =
      (nextMarks[rowIndex][columnIndex] + 1) % 3;

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

  checkBoard() {
    if (!this.state.puzzle) {
      return;
    }

    if (!this.state.isRoundStarted) {
      this.state.message = "Сначала нажми «Начать игру».";
      this.persist();
      this.emit();
      return;
    }

    this.state.checks += 1;
    const derived = this.getDerivedState();

    if (derived.allCorrect) {
      this.completePuzzle();
      return;
    }

    const incorrectLines = derived.totalLines - derived.correctLines;

    if (derived.exceededLines > 0) {
      this.state.message = `Цель превышена в ${derived.exceededLines} ${pluralizeRu(
        derived.exceededLines,
        "линии",
        "линиях",
        "линиях"
      )}.`;
    } else {
      this.state.message = `${incorrectLines} ${pluralizeRu(
        incorrectLines,
        "линия ещё не совпадает.",
        "линии ещё не совпадают.",
        "линий ещё не совпадают."
      )}`;
    }

    this.persist();
    this.emit();
  }

  toggleSolution() {
    if (!this.state.isRoundStarted && !this.state.isSolved) {
      this.state.message =
        "Сначала начни игру, а потом при необходимости открой решение.";
      this.persist();
      this.emit();
      return;
    }

    this.state.showSolution = !this.state.showSolution;
    this.state.message = this.state.showSolution
      ? "Подсветка решения включена. Целевые клетки отмечены."
      : "Подсветка решения скрыта. Снова только логика.";

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

  getViewModel() {
    const derived = this.getDerivedState();
    const difficulty = DIFFICULTIES[this.state.difficultyId];
    const totals = summarizeTargets(this.state.puzzle);

    return {
      ...this.state,
      difficulty,
      difficulties: Object.values(DIFFICULTIES),
      boardSizes: BOARD_SIZES,
      elapsedLabel: formatDuration(this.getElapsedMs()),
      progressPercent: Math.round((derived.correctLines / derived.totalLines) * 100),
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
      boardLocked: !this.state.isSolved && !this.state.isRoundStarted,
      startButtonLabel:
        this.state.moves > 0 || this.state.elapsedMs > 0
          ? "Продолжить игру"
          : "Начать игру",
      themeTone: this.state.isSolved
        ? "success"
        : derived.exceededLines > 0
        ? "warning"
        : "neutral",
      showSolutionLabel: this.state.showSolution
        ? "Скрыть решение"
        : "Показать решение",
    };
  }

  createBaseState() {
    return {
      size: DEFAULT_SIZE,
      difficultyId: DEFAULT_DIFFICULTY,
      puzzle: null,
      marks: buildEmptyMarks(DEFAULT_SIZE),
      showSolution: false,
      isSolved: false,
      isRoundStarted: false,
      hasRecordedWin: false,
      totalWins: 0,
      moves: 0,
      checks: 0,
      elapsedMs: 0,
      timerBaseMs: null,
      message: DEFAULT_MESSAGE,
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

    const marks = isMarksMatrix(saved?.marks, size)
      ? saved.marks
      : buildEmptyMarks(size);
    const elapsedMs = Number.isFinite(saved?.elapsedMs)
      ? Math.max(0, saved.elapsedMs)
      : 0;
    const isSolved = Boolean(saved?.isSolved) && this.areTargetsMet(puzzle, marks);
    const isRoundStarted = Boolean(saved?.isRoundStarted) && !isSolved;

    return {
      size,
      difficultyId,
      puzzle,
      marks,
      showSolution: Boolean(saved?.showSolution),
      isSolved,
      isRoundStarted,
      hasRecordedWin: isSolved ? Boolean(saved?.hasRecordedWin) : false,
      totalWins: Number.isFinite(saved?.totalWins) ? Math.max(0, saved.totalWins) : 0,
      moves: Number.isFinite(saved?.moves) ? Math.max(0, saved.moves) : 0,
      checks: Number.isFinite(saved?.checks) ? Math.max(0, saved.checks) : 0,
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

    if (!this.state.hasRecordedWin) {
      this.state.totalWins += 1;
      this.state.hasRecordedWin = true;
    }

    this.state.message = `Поздравляем! Раунд пройден за ${formatDuration(
      this.state.elapsedMs
    )} и ${this.state.moves} ${pluralizeRu(
      this.state.moves,
      "ход",
      "хода",
      "ходов"
    )}.`;

    this.persist();
    this.emit();
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
    };

    savePersistedState(snapshot);
  }

  emit() {
    const viewModel = this.getViewModel();
    this.listeners.forEach((listener) => listener(viewModel));
  }
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
