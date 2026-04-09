import { CELL_STATES } from "./constants.js";

export class SumGridUI {
  constructor({ root, game }) {
    this.root = root;
    this.game = game;
    this.hasRenderedOnce = false;
    this.previousBoardLocked = false;

    this.root.addEventListener("click", (event) => {
      const actionElement = event.target.closest("[data-action]");

      if (actionElement) {
        this.handleAction(actionElement.dataset.action);
        return;
      }

      const sizeElement = event.target.closest("[data-size]");

      if (sizeElement) {
        this.game.setSize(Number(sizeElement.dataset.size));
        return;
      }

      const difficultyElement = event.target.closest("[data-difficulty]");

      if (difficultyElement) {
        this.game.setDifficulty(difficultyElement.dataset.difficulty);
        return;
      }

      const cellElement = event.target.closest("[data-cell]");

      if (cellElement) {
        this.game.cycleCell(
          Number(cellElement.dataset.row),
          Number(cellElement.dataset.column)
        );
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

    document.title = viewModel.isSolved
      ? "Sum Grid - Решено"
      : `Sum Grid - ${viewModel.size}×${viewModel.size}`;

    this.root.innerHTML = `
      <div class="page-shell ${this.hasRenderedOnce ? "is-hydrated" : ""}">
        <div class="backdrop-orb backdrop-orb--left"></div>
        <div class="backdrop-orb backdrop-orb--right"></div>

        <header class="hero-card panel">
          <div class="hero-brand">
            <div class="hero-logo-wrap">
              <img class="hero-logo" src="./assets/logo-sum-grid.svg" alt="Логотип Sum Grid" />
            </div>
            <div class="hero-card__copy">
              <div class="eyebrow">Премиальная логическая головоломка</div>
              <h1 class="hero-title"><span>Sum</span> Grid</h1>
              <p class="hero-subtitle">
                Отмечай нужные клетки так, чтобы сумма выбранных чисел в каждой строке совпала с
                целью справа, а в каждом столбце с целью снизу.
              </p>
            </div>
          </div>

          <div class="metrics-grid">
            ${renderMetric("Поле", `${viewModel.size}×${viewModel.size}`)}
            ${renderMetric("Сложность", viewModel.difficulty.label)}
            ${renderMetric("Время", viewModel.elapsedLabel, "timer")}
            ${renderMetric("Победы", String(viewModel.totalWins))}
          </div>
        </header>

        <main class="main-grid">
          <section class="board-panel panel">
            <div class="board-panel__top">
              <div>
                <div class="section-label">Игровое поле</div>
                <h2>Клик по клетке: пусто → выбрано → зачеркнуто</h2>
              </div>

              <div class="board-meta">
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
                      <div class="board-overlay__card">
                        <div class="section-label">Раунд не начат</div>
                        <h3>${viewModel.startButtonLabel}</h3>
                        <p class="board-overlay__intro">
                          Если хотите продолжить, нажмите кнопку ниже или ознакомьтесь с правилами игры.
                        </p>
                        <button class="action-button action-button--primary board-overlay__button" data-action="start">
                          ${viewModel.startButtonLabel}
                        </button>
                        <div class="board-overlay__rules">
                          <div class="board-overlay__rules-title">Правила игры</div>
                          <div class="board-overlay__rules-list">
                            <p>1. На поле находится квадратная сетка с числами. Каждая клетка содержит одно значение.</p>
                            <p>2. Твоя задача — отметить такие клетки, чтобы сумма выбранных чисел в каждой строке совпала с целью справа.</p>
                            <p>3. Одновременно сумма выбранных чисел в каждом столбце должна совпасть с целью снизу.</p>
                            <p>4. Нажатие на клетку переключает её состояние по кругу: пусто → выбрано → зачеркнуто → пусто.</p>
                            <p>5. В расчёт суммы входят только выбранные клетки. Зачеркнутые клетки считаются исключёнными и в сумму не добавляются.</p>
                            <p>6. Если сумма линии уже равна цели, линия считается правильной. Если сумма больше цели, линия подсвечивается как превышенная. Если сумма меньше цели, линия ещё не завершена.</p>
                            <p>7. Победа засчитывается только тогда, когда все строки и все столбцы одновременно точно совпадают со своими целями.</p>
                            <p>8. Кнопка «Проверить» подсказывает текущее состояние решения, «Сброс» очищает отметки, а «Показать решение» открывает правильный узор клеток.</p>
                            <p>9. Таймер запускается только после нажатия на «Начать игру» или «Продолжить игру».</p>
                          </div>
                        </div>
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

            <div class="legend">
              <div class="legend-item">
                <span class="legend-swatch legend-swatch--selected"></span>
                <span>Выбранные клетки входят в сумму</span>
              </div>
              <div class="legend-item">
                <span class="legend-swatch legend-swatch--crossed"></span>
                <span>Зачеркнутые клетки исключены</span>
              </div>
              <div class="legend-item">
                <span class="legend-swatch legend-swatch--solution"></span>
                <span>Показ решения подсвечивает правильный узор</span>
              </div>
            </div>
          </section>

          <aside class="sidebar">
            <section class="panel control-panel">
              <div class="section-label">Сложность</div>
              <div class="choice-grid choice-grid--stacked">
                ${viewModel.difficulties
                  .map(
                    (difficulty) => `
                      <button
                        class="choice-card ${
                          difficulty.id === viewModel.difficultyId ? "is-active" : ""
                        }"
                        data-difficulty="${difficulty.id}"
                      >
                        <strong>${difficulty.label}</strong>
                        <span>${difficulty.description}</span>
                      </button>
                    `
                  )
                  .join("")}
              </div>
            </section>

            <section class="panel control-panel">
              <div class="section-label">Размер поля</div>
              <div class="choice-grid">
                ${viewModel.boardSizes
                  .map(
                    (size) => `
                      <button
                        class="choice-pill ${size === viewModel.size ? "is-active" : ""}"
                        data-size="${size}"
                      >
                        ${size}×${size}
                      </button>
                    `
                  )
                  .join("")}
              </div>
            </section>

            <section class="panel action-panel">
              <div class="section-label">Управление</div>
              <div class="action-grid">
                ${renderActionButton("new-game", "Новая игра", "primary")}
                ${renderActionButton("reset", "Сброс", "ghost")}
                ${renderActionButton("check", "Проверить", "success")}
                ${renderActionButton("solution", viewModel.showSolutionLabel, "accent")}
              </div>
            </section>

            <section class="panel status-panel" data-tone="${viewModel.themeTone}">
              <div class="section-label">Статус</div>
              <p class="status-message">${viewModel.message}</p>
              <div class="status-grid">
                <div class="status-card">
                  <span>Ходы</span>
                  <strong>${viewModel.moves}</strong>
                </div>
                <div class="status-card">
                  <span>Проверки</span>
                  <strong>${viewModel.checks}</strong>
                </div>
                <div class="status-card">
                  <span>Превышено</span>
                  <strong>${viewModel.exceededLines}</strong>
                </div>
                <div class="status-card">
                  <span>Не собрано</span>
                  <strong>${viewModel.incompleteLines}</strong>
                </div>
              </div>
            </section>
          </aside>
        </main>
      </div>
    `;

    const nextBoardScroll = this.root.querySelector("[data-board-scroll]");

    if (nextBoardScroll) {
      nextBoardScroll.scrollLeft = previousBoardScroll;
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
    <button class="action-button action-button--${variant}" data-action="${action}">
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
        <span class="line-total__label">Строка ${rowIndex + 1}</span>
        <strong>${viewModel.puzzle.rowTargets[rowIndex]}</strong>
        <span>${viewModel.rowSums[rowIndex]} сейчас</span>
      </div>
    `);
  });

  viewModel.puzzle.columnTargets.forEach((target, columnIndex) => {
    content.push(`
      <div class="line-total line-total--column" data-status="${viewModel.columnStatuses[columnIndex]}">
        <span class="line-total__label">Столбец ${columnIndex + 1}</span>
        <strong>${target}</strong>
        <span>${viewModel.columnSums[columnIndex]} сейчас</span>
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
