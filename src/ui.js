import { CELL_STATES } from "./constants.js";

export class SumGridUI {
  constructor({ root, game }) {
    this.root = root;
    this.game = game;
    this.hasRenderedOnce = false;
    this.previousBoardLocked = false;

    this.root.addEventListener("click", (event) => {
      const target =
        event.target instanceof Element ? event.target : event.target?.parentElement;

      if (!target) {
        return;
      }

      const actionElement = target.closest("button[data-action]");

      if (actionElement) {
        this.handleAction(actionElement.dataset.action);
        return;
      }

      const cellElement = target.closest("button[data-cell]");

      if (cellElement) {
        this.game.cycleCell(
          Number(cellElement.dataset.row),
          Number(cellElement.dataset.column)
        );
        return;
      }

      const sizeElement = target.closest("button[data-size]");

      if (sizeElement) {
        this.game.setSize(Number(sizeElement.dataset.size));
        return;
      }

      const difficultyElement = target.closest("button[data-difficulty]");

      if (difficultyElement) {
        this.game.setDifficulty(difficultyElement.dataset.difficulty);
      }
    });
  }

  render(viewModel) {
    if (!viewModel.puzzle) {
      return;
    }

    const previousBoardScroll =
      this.root.querySelector("[data-board-scroll]")?.scrollLeft ?? 0;
    const isUnlocking =
      this.hasRenderedOnce && this.previousBoardLocked && !viewModel.boardLocked;
    const boardCode = viewModel.puzzle.id.slice(-4).toUpperCase();

    document.title = viewModel.isSolved
      ? "Sum Grid - Решено"
      : `Sum Grid - ${viewModel.size}×${viewModel.size}`;

    this.root.innerHTML = `
      <div class="page-shell ${this.hasRenderedOnce ? "is-hydrated" : ""}">
        <div class="backdrop-orb backdrop-orb--left"></div>
        <div class="backdrop-orb backdrop-orb--right"></div>

        <header class="topbar panel">
          <div class="topbar__brand">
            <img class="topbar__logo" src="./assets/logo-sum-grid.svg" alt="Логотип Sum Grid" />
            <div class="topbar__copy">
              <div class="eyebrow">Премиальная логическая головоломка</div>
              <h1 class="topbar__title"><span>Sum</span> Grid</h1>
              <p class="topbar__subtitle">Собери точные суммы в строках и столбцах.</p>
            </div>
          </div>

          <div class="topbar__stats">
            ${renderMetric("Поле", `${viewModel.size}×${viewModel.size}`)}
            ${renderMetric("Режим", viewModel.difficulty.label)}
            ${renderMetric("Раунд", `#${boardCode}`)}
            ${renderMetric("Время", viewModel.elapsedLabel, "timer")}
            ${renderMetric("Победы", String(viewModel.totalWins))}
          </div>
        </header>

        <main class="play-layout">
          <section class="board-stage panel">
            <div class="board-stage__header">
              <div>
                <div class="section-label">Игровое поле</div>
                <h2 class="board-stage__title">Пусто → выбрано → зачеркнуто</h2>
                <p class="board-stage__hint">
                  Выбранные клетки входят в сумму. Цели справа и снизу должны совпасть.
                </p>
              </div>

              <div class="board-stage__status">
                <span class="chip" data-tone="${viewModel.themeTone}">
                  ${viewModel.correctLines}/${viewModel.totalLines} линий совпало
                </span>
                <span class="chip">${viewModel.selectionCount} выбрано</span>
                <span class="chip">цель ${viewModel.grandTarget}</span>
              </div>
            </div>

            <div class="progress-block">
              <div class="progress-block__copy">
                <span>Прогресс</span>
                <strong>${viewModel.progressPercent}%</strong>
              </div>
              <div class="progress-track">
                <span class="progress-fill" style="width: ${viewModel.progressPercent}%"></span>
              </div>
            </div>

            <div
              class="board-arena"
              data-locked="${viewModel.boardLocked}"
              data-unlocking="${isUnlocking}"
            >
              <div class="board-rails" aria-hidden="true">
                <span class="board-rail board-rail--top"></span>
                <span class="board-rail board-rail--right"></span>
                <span class="board-rail board-rail--bottom"></span>
                <span class="board-rail board-rail--left"></span>
                <span class="board-post board-post--tl"></span>
                <span class="board-post board-post--tr"></span>
                <span class="board-post board-post--br"></span>
                <span class="board-post board-post--bl"></span>
              </div>

              ${
                viewModel.boardLocked
                  ? `
                    <div class="board-overlay">
                      <div class="board-overlay__card board-overlay__card--compact">
                        <div class="section-label">Раунд не начат</div>
                        <h3>${viewModel.startButtonLabel}</h3>
                        <p class="board-overlay__intro">
                          Если хотите продолжить, нажмите кнопку ниже или откройте правила игры.
                        </p>
                        <button type="button" class="action-button action-button--primary board-overlay__button board-overlay__button--compact" data-action="start">
                          ${viewModel.startButtonLabel}
                        </button>
                        <details class="board-rules">
                          <summary>Правила игры</summary>
                          <div class="board-rules__content">
                            <p>1. На поле квадратная сетка с числами. Каждая клетка содержит одно значение.</p>
                            <p>2. Нужно отметить такие клетки, чтобы сумма выбранных чисел в каждой строке совпала с целью справа.</p>
                            <p>3. Одновременно сумма выбранных чисел в каждом столбце должна совпасть с целью снизу.</p>
                            <p>4. Нажатие на клетку переключает её состояние по кругу: пусто → выбрано → зачеркнуто → пусто.</p>
                            <p>5. В расчёт суммы входят только выбранные клетки. Зачеркнутые клетки исключаются.</p>
                            <p>6. Если сумма линии равна цели, она верна. Если больше цели, линия превышена. Если меньше, она ещё не собрана.</p>
                            <p>7. Победа засчитывается только тогда, когда все строки и все столбцы одновременно точно совпадают с целями.</p>
                            <p>8. «Проверить» оценивает текущее решение, «Сброс» очищает отметки, «Показать решение» открывает правильный узор.</p>
                            <p>9. Таймер запускается только после нажатия на «Начать игру» или «Продолжить игру».</p>
                          </div>
                        </details>
                      </div>
                    </div>
                  `
                  : isUnlocking
                  ? `
                    <div class="board-overlay board-overlay--exit" aria-hidden="true">
                      <div class="board-overlay__veil"></div>
                    </div>
                  `
                  : ""
              }

              <div
                class="board-scroll ${isUnlocking ? "board-scroll--unlocking" : ""}"
                data-board-scroll
              >
                ${renderBoard(viewModel)}
              </div>
            </div>

            <div class="control-rack">
              <div class="control-rack__row">
                <div class="control-group">
                  <div class="section-label">Размер поля</div>
                  <div class="choice-row">
                    ${viewModel.boardSizes
                      .map(
                        (size) => `
                          <button
                            type="button"
                            class="choice-pill ${size === viewModel.size ? "is-active" : ""}"
                            data-size="${size}"
                          >
                            ${size}×${size}
                          </button>
                        `
                      )
                      .join("")}
                  </div>
                </div>

                <div class="control-group">
                  <div class="section-label">Сложность</div>
                  <div class="choice-row">
                    ${viewModel.difficulties
                      .map(
                        (difficulty) => `
                          <button
                            type="button"
                            class="choice-pill ${
                              difficulty.id === viewModel.difficultyId ? "is-active" : ""
                            }"
                            data-difficulty="${difficulty.id}"
                          >
                            ${difficulty.label}
                          </button>
                        `
                      )
                      .join("")}
                  </div>
                  <p class="control-group__hint">${viewModel.difficulty.description}</p>
                </div>
              </div>

              <div class="control-rack__row control-rack__row--actions">
                ${renderActionButton("new-game", "Новая игра", "primary")}
                ${renderActionButton("reset", "Сброс", "ghost")}
                ${renderActionButton("check", "Проверить", "success")}
                ${renderActionButton("solution", viewModel.showSolutionLabel, "accent")}
              </div>

              <div class="status-strip" data-tone="${viewModel.themeTone}">
                <p class="status-strip__message">${viewModel.message}</p>
                <div class="status-strip__stats">
                  <span class="status-pill"><b>Ходы</b>${viewModel.moves}</span>
                  <span class="status-pill"><b>Проверки</b>${viewModel.checks}</span>
                  <span class="status-pill"><b>Превышено</b>${viewModel.exceededLines}</span>
                  <span class="status-pill"><b>Не собрано</b>${viewModel.incompleteLines}</span>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    `;

    const nextBoardScroll = this.root.querySelector("[data-board-scroll]");

    if (nextBoardScroll) {
      nextBoardScroll.scrollLeft = previousBoardScroll;
    }

    if (isUnlocking) {
      const exitOverlay = this.root.querySelector(".board-overlay--exit");

      if (exitOverlay) {
        window.setTimeout(() => {
          exitOverlay.remove();
        }, 440);
      }
    }

    this.hasRenderedOnce = true;
    this.previousBoardLocked = viewModel.boardLocked;
  }

  updateTimer(label) {
    const timerValue = this.root.querySelector('[data-role="timer-value"]');

    if (timerValue) {
      timerValue.textContent = label;
    }
  }

  handleAction(action) {
    if (action === "start") {
      this.game.startRound();
      return;
    }

    if (action === "new-game") {
      this.game.startNewGame();
      return;
    }

    if (action === "reset") {
      this.game.resetBoard();
      return;
    }

    if (action === "check") {
      this.game.checkBoard();
      return;
    }

    if (action === "solution") {
      this.game.toggleSolution();
    }
  }
}

function renderMetric(label, value, role = "") {
  return `
    <div class="metric-card">
      <span>${label}</span>
      <strong ${role ? `data-role="${role}-value"` : ""}>${value}</strong>
    </div>
  `;
}

function renderActionButton(action, label, variant) {
  return `
    <button type="button" class="action-button action-button--${variant}" data-action="${action}">
      ${label}
    </button>
  `;
}

function renderBoard(viewModel) {
  const cellMin =
    viewModel.size >= 7 ? 46 : viewModel.size === 6 ? 52 : viewModel.size === 5 ? 58 : 64;
  const totalMin = viewModel.size >= 7 ? 72 : viewModel.size === 6 ? 76 : 82;
  const content = [];

  viewModel.puzzle.numbers.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const cellState = viewModel.marks[rowIndex][columnIndex];
      const isSolutionCell = viewModel.puzzle.solution[rowIndex][columnIndex];

      content.push(`
        <button
          type="button"
          class="grid-cell"
          data-cell="true"
          data-row="${rowIndex}"
          data-column="${columnIndex}"
          data-state="${getCellStateName(cellState)}"
          data-solution="${isSolutionCell}"
          data-show-solution="${viewModel.showSolution}"
          ${viewModel.isSolved || viewModel.boardLocked ? "disabled" : ""}
          aria-label="Строка ${rowIndex + 1}, столбец ${columnIndex + 1}, значение ${value}"
          aria-pressed="${cellState === CELL_STATES.SELECTED}"
        >
          <span class="cell__value">${value}</span>
          <span class="cell__cross">×</span>
          <span class="cell__solution-pill">цель</span>
        </button>
      `);
    });

    content.push(`
      <div class="line-total line-total--row" data-status="${viewModel.rowStatuses[rowIndex]}">
        <span class="line-total__label">
          <span class="line-total__label-full">Строка ${rowIndex + 1}</span>
          <span class="line-total__label-short">→ ${rowIndex + 1}</span>
        </span>
        <strong>${viewModel.puzzle.rowTargets[rowIndex]}</strong>
        <span class="line-total__current">
          <span class="line-total__current-value">${viewModel.rowSums[rowIndex]}</span>
          <span class="line-total__current-word">сейчас</span>
        </span>
      </div>
    `);
  });

  viewModel.puzzle.columnTargets.forEach((target, columnIndex) => {
    content.push(`
      <div class="line-total line-total--column" data-status="${viewModel.columnStatuses[columnIndex]}">
        <span class="line-total__label">
          <span class="line-total__label-full">Столбец ${columnIndex + 1}</span>
          <span class="line-total__label-short">↓ ${columnIndex + 1}</span>
        </span>
        <strong>${target}</strong>
        <span class="line-total__current">
          <span class="line-total__current-value">${viewModel.columnSums[columnIndex]}</span>
          <span class="line-total__current-word">сейчас</span>
        </span>
      </div>
    `);
  });

  content.push(`
    <div class="grid-corner">
      <span>Σ</span>
      <small>Цели</small>
    </div>
  `);

  return `
    <div
      class="board-grid"
      data-board-size="${viewModel.size}"
      style="--board-size: ${viewModel.size}; --cell-min: ${cellMin}px; --total-min: ${totalMin}px;"
    >
      ${content.join("")}
    </div>
  `;
}

function getCellStateName(state) {
  if (state === CELL_STATES.SELECTED) {
    return "selected";
  }

  if (state === CELL_STATES.CROSSED) {
    return "crossed";
  }

  return "empty";
}
