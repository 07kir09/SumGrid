import { CELL_STATES } from "./constants.js";

const numberFormatter = new Intl.NumberFormat("ru-RU");

export class SumGridUI {
  constructor({ root, game }) {
    this.root = root;
    this.game = game;
    this.hasRenderedOnce = false;
    this.previousBoardLocked = false;
    this.profilePreviewTimer = null;

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

    this.root.addEventListener("input", (event) => {
      const target = event.target;

      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      if (target.matches("[data-profile-draft]")) {
        window.clearTimeout(this.profilePreviewTimer);
        this.profilePreviewTimer = window.setTimeout(() => {
          void this.game.previewProfileAvailability(target.value);
        }, 220);
      }
    });

    this.root.addEventListener("submit", (event) => {
      const form = event.target;

      if (!(form instanceof HTMLFormElement) || !form.matches("[data-profile-form]")) {
        return;
      }

      event.preventDefault();
      window.clearTimeout(this.profilePreviewTimer);
      const input = form.querySelector("[data-profile-draft]");
      const value = input instanceof HTMLInputElement ? input.value : "";
      void this.game.registerProfile(value);
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.game.closeProfilePanel();
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
      : "Sum Grid";

    this.root.innerHTML = `
      <div class="page-shell ${this.hasRenderedOnce ? "is-hydrated" : ""} ${
        viewModel.isProfilePanelOpen ? "has-sheet-open" : ""
      }">
        <div class="backdrop-orb backdrop-orb--left"></div>
        <div class="backdrop-orb backdrop-orb--right"></div>

        <header class="topbar panel">
          <div class="topbar__row">
            <div class="topbar__brand">
              <img class="topbar__logo" src="./assets/logo-sum-grid.svg" alt="Логотип Sum Grid" />
              <div class="topbar__copy">
                <div class="eyebrow">Премиальная логическая головоломка</div>
                <h1 class="topbar__title"><span>Sum</span> Grid</h1>
                <p class="topbar__subtitle">Собери точные суммы в строках и столбцах.</p>
              </div>
            </div>

            <button
              type="button"
              class="profile-trigger ${viewModel.isProfileReady ? "" : "is-disabled"}"
              data-action="toggle-profile"
              ${viewModel.isProfileReady ? "" : "disabled"}
            >
              <span class="profile-trigger__eyebrow">Профиль</span>
              <strong>${escapeHtml(
                viewModel.isProfileReady ? viewModel.playerName : "Создай ник"
              )}</strong>
              <small>${
                viewModel.isProfileReady
                  ? viewModel.currentPlayer.rank
                    ? `Место #${viewModel.currentPlayer.rank}`
                    : "Пока без места"
                  : "Нужен для общего рейтинга"
              }</small>
            </button>
          </div>

          <div class="topbar__stats">
            ${renderMetric("Поле", `${viewModel.size}×${viewModel.size}`)}
            ${renderMetric("Режим", viewModel.difficulty.label)}
            ${renderMetric("Раунд", `#${boardCode}`)}
            ${renderMetric("Время", viewModel.elapsedLabel, "timer")}
            ${renderMetric("Очки", formatNumber(viewModel.currentPlayer.totalScore))}
          </div>
        </header>

        ${renderProfileSheet(viewModel)}

        <main class="play-layout">
          <section class="board-stage panel">
            <div class="board-stage__header">
              <div>
                <div class="section-label">Игровое поле</div>
                <h2 class="board-stage__title">Пусто → выбрано → зачеркнуто</h2>
                <p class="board-stage__hint">
                  Подсказка подсветит одну нужную клетку, но снизит итоговый результат.
                </p>
              </div>

              <div class="board-stage__status">
                <span class="chip" data-tone="${viewModel.themeTone}">
                  ${viewModel.correctLines}/${viewModel.totalLines} линий совпало
                </span>
                <span class="chip">${viewModel.selectionCount} выбрано</span>
                <span class="chip">цель ${viewModel.grandTarget}</span>
                <span class="chip">подсказки ${viewModel.hintsUsed}</span>
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
                viewModel.isSolved
                  ? `
                    <div class="board-overlay board-overlay--victory">
                      ${renderVictoryCard(viewModel, boardCode)}
                    </div>
                  `
                  : viewModel.boardLocked && viewModel.isProfileReady
                  ? `
                    <div class="board-overlay">
                      <div class="board-overlay__card board-overlay__card--compact">
                        <div class="section-label">Раунд не начат</div>
                        <h3>${viewModel.startButtonLabel}</h3>
                        <p class="board-overlay__intro">
                          Нажми кнопку ниже, чтобы открыть доску и запустить таймер.
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
                            <p>8. Кнопка «Дать подсказку» открывает одну нужную клетку и фиксирует её на поле.</p>
                            <p>9. Подсказки снижают итоговые очки, поэтому лучший рейтинг собирается без них или с минимальным числом.</p>
                            <p>10. Таймер запускается только после нажатия на «Начать игру» или «Продолжить игру».</p>
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

              ${viewModel.isSolved ? '<div class="board-victory-flash" aria-hidden="true"></div>' : ""}

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
                ${renderActionButton(
                  "hint",
                  viewModel.remainingHints > 0 ? "Дать подсказку" : "Подсказок нет",
                  "accent",
                  !viewModel.isProfileReady ||
                    viewModel.boardLocked ||
                    viewModel.isSolved ||
                    viewModel.remainingHints === 0
                )}
              </div>

              <div class="status-strip" data-tone="${viewModel.themeTone}">
                <p class="status-strip__message">${viewModel.message}</p>
                <div class="status-strip__stats">
                  <span class="status-pill"><b>Ходы</b>${viewModel.moves}</span>
                  <span class="status-pill"><b>Подсказки</b>${viewModel.hintsUsed}</span>
                  <span class="status-pill"><b>Превышено</b>${viewModel.exceededLines}</span>
                  <span class="status-pill"><b>Не собрано</b>${viewModel.incompleteLines}</span>
                </div>
              </div>
            </div>
          </section>
        </main>

        ${!viewModel.isProfileReady ? renderProfileOnboarding(viewModel) : ""}
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

    if (action === "next-level") {
      this.game.startNewGame();
      return;
    }

    if (action === "reset") {
      this.game.resetBoard();
      return;
    }

    if (action === "hint") {
      this.game.useHint();
      return;
    }

    if (action === "toggle-profile") {
      this.game.toggleProfilePanel();
      return;
    }

    if (action === "close-profile") {
      this.game.closeProfilePanel();
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

function renderActionButton(action, label, variant, disabled = false) {
  return `
    <button
      type="button"
      class="action-button action-button--${variant}"
      data-action="${action}"
      ${disabled ? "disabled" : ""}
    >
      ${label}
    </button>
  `;
}

function renderProfileOnboarding(viewModel) {
  return `
    <div class="startup-overlay">
      <section class="startup-card panel" aria-live="polite">
        <div class="section-label">Личный кабинет</div>
        <h2 class="startup-card__title">Придумай уникальный никнейм</h2>
        <p class="startup-card__text">
          Ник нужен для общего рейтинга игроков. Один ник можно занять только один раз.
        </p>

        <form class="startup-form" data-profile-form>
          <label class="text-field">
            <span class="text-field__label">Уникальный ник</span>
            <input
              type="text"
              maxlength="24"
              class="text-field__input text-field__input--hero"
              data-profile-draft
              value="${escapeHtml(viewModel.profileDraft)}"
              placeholder="например, Kirill_07"
              autocomplete="nickname"
              autocapitalize="off"
              spellcheck="false"
              autofocus
            />
          </label>

          <p class="startup-card__hint">Разрешены буквы, цифры, _ и -. Минимум 3 символа.</p>

          ${
            viewModel.profileStatusMessage
              ? `<p class="startup-card__status" data-tone="${viewModel.profileStatusTone}">${escapeHtml(
                  viewModel.profileStatusMessage
                )}</p>`
              : ""
          }

          <button
            type="submit"
            class="action-button action-button--primary startup-card__button"
            ${viewModel.hasPendingProfileAction ? "disabled" : ""}
          >
            ${viewModel.isProfileSubmitting ? "Создаём профиль..." : "Создать профиль"}
          </button>
        </form>
      </section>
    </div>
  `;
}

function renderProfileSheet(viewModel) {
  return `
    <div class="profile-sheet ${viewModel.isProfilePanelOpen ? "is-open" : ""}">
      <button
        type="button"
        class="profile-sheet__backdrop"
        aria-label="Закрыть профиль"
        data-action="close-profile"
      ></button>
      <aside class="profile-sheet__panel panel">
        <div class="profile-sheet__header">
          <div>
            <div class="section-label">Профиль</div>
            <h2 class="profile-sheet__title">${escapeHtml(viewModel.playerName || DEFAULT_PROFILE_LABEL)}</h2>
            <p class="profile-sheet__subtitle">Общий рейтинг и персональная статистика.</p>
          </div>
          <button type="button" class="profile-sheet__close" data-action="close-profile" aria-label="Закрыть профиль">
            ×
          </button>
        </div>

        <div class="profile-stats profile-stats--sheet">
          ${renderProfileStat("Очки", formatNumber(viewModel.currentPlayer.totalScore))}
          ${renderProfileStat("Победы", String(viewModel.currentPlayer.wins))}
          ${renderProfileStat("Лучший", formatNumber(viewModel.currentPlayer.bestScore))}
          ${renderProfileStat(
            "Место",
            viewModel.currentPlayer.rank ? `#${viewModel.currentPlayer.rank}` : "—"
          )}
        </div>

        <div class="leaderboard-block">
          <div class="leaderboard__header">
            <div>
              <div class="section-label">Рейтинг</div>
              <strong class="leaderboard__title">Общий рейтинг игроков</strong>
            </div>
            <span class="chip">${
              viewModel.isLeaderboardLoading
                ? "синхронизация"
                : `${viewModel.leaderboard.length || 0} в топе`
            }</span>
          </div>
          ${renderLeaderboard(viewModel)}
        </div>
      </aside>
    </div>
  `;
}

function renderVictoryCard(viewModel, boardCode) {
  const breakdown = viewModel.roundScoreBreakdown;

  return `
    <section class="board-overlay__card board-overlay__card--victory victory-card" aria-live="polite">
      <div class="victory-card__glow victory-card__glow--left" aria-hidden="true"></div>
      <div class="victory-card__glow victory-card__glow--right" aria-hidden="true"></div>
      <div class="victory-card__confetti" aria-hidden="true">
        <span class="victory-card__confetti-piece"></span>
        <span class="victory-card__confetti-piece"></span>
        <span class="victory-card__confetti-piece"></span>
        <span class="victory-card__confetti-piece"></span>
        <span class="victory-card__confetti-piece"></span>
        <span class="victory-card__confetti-piece"></span>
      </div>

      <div class="victory-card__header">
        <div>
          <div class="section-label">Поздравляем</div>
          <h3 class="victory-card__title">Уровень пройден</h3>
          <p class="victory-card__text">
            Игрок <strong>${escapeHtml(viewModel.playerName)}</strong> закрыл раунд <strong>#${boardCode}</strong>
            в режиме <strong>${viewModel.difficulty.label}</strong>.
          </p>
        </div>
        <div class="victory-card__badge">Готово</div>
      </div>

      <div class="victory-card__stats victory-card__stats--wide">
        <div class="victory-stat">
          <span>Очки</span>
          <strong>${formatNumber(viewModel.roundScore ?? 0)}</strong>
        </div>
        <div class="victory-stat">
          <span>Время</span>
          <strong>${viewModel.elapsedLabel}</strong>
        </div>
        <div class="victory-stat">
          <span>Ходы</span>
          <strong>${viewModel.moves}</strong>
        </div>
        <div class="victory-stat">
          <span>Подсказки</span>
          <strong>${viewModel.hintsUsed}</strong>
        </div>
      </div>

      ${
        breakdown
          ? `
            <div class="victory-card__scoreline">
              <span>База ${formatNumber(breakdown.baseScore)}</span>
              <span>${formatSignedNumber(breakdown.timeAdjustment)} за темп</span>
              <span>−${formatNumber(breakdown.movePenalty)} за лишние ходы</span>
              <span>−${formatNumber(breakdown.hintPenalty)} за подсказки</span>
            </div>
          `
          : ""
      }

      <div class="victory-card__actions">
        <button type="button" class="action-button action-button--primary" data-action="next-level">
          Следующий уровень
        </button>
      </div>
    </section>
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
      const isHintedCell = viewModel.hintCells[rowIndex][columnIndex];

      content.push(`
        <button
          type="button"
          class="grid-cell"
          data-cell="true"
          data-row="${rowIndex}"
          data-column="${columnIndex}"
          data-state="${getCellStateName(cellState)}"
          data-hinted="${isHintedCell}"
          ${viewModel.isSolved || viewModel.boardLocked || isHintedCell ? "disabled" : ""}
          aria-label="Строка ${rowIndex + 1}, столбец ${columnIndex + 1}, значение ${value}${
            isHintedCell ? ", подсказка" : ""
          }"
          aria-pressed="${cellState === CELL_STATES.SELECTED}"
        >
          <span class="cell__value">${value}</span>
          <span class="cell__cross">×</span>
          <span class="cell__hint-pill">подсказка</span>
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

function renderLeaderboard(viewModel) {
  if (viewModel.isLeaderboardLoading && !viewModel.leaderboard.length) {
    return `
      <div class="leaderboard leaderboard--empty">
        <p class="leaderboard__empty">Загружаем общий рейтинг игроков...</p>
      </div>
    `;
  }

  if (viewModel.leaderboardError && !viewModel.leaderboard.length) {
    return `
      <div class="leaderboard leaderboard--empty">
        <p class="leaderboard__empty">${escapeHtml(viewModel.leaderboardError)}</p>
      </div>
    `;
  }

  if (!viewModel.leaderboard.length) {
    return `
      <div class="leaderboard leaderboard--empty">
        <p class="leaderboard__empty">Пока нет завершённых раундов. Первый результат появится после победы.</p>
      </div>
    `;
  }

  return `
    <div class="leaderboard">
      ${viewModel.leaderboard
        .map((entry) => {
          const isCurrent =
            entry.playerName.toLocaleLowerCase("ru-RU") ===
            viewModel.playerName.toLocaleLowerCase("ru-RU");

          return `
            <div class="leaderboard__row ${isCurrent ? "is-current" : ""}">
              <div class="leaderboard__position">#${entry.rank}</div>
              <div class="leaderboard__meta">
                <strong>${escapeHtml(entry.playerName)}</strong>
                <span>${entry.wins} побед · лучший раунд ${formatNumber(entry.bestScore)}</span>
              </div>
              <div class="leaderboard__score">${formatNumber(entry.totalScore)}</div>
            </div>
          `;
        })
        .join("")}
      ${
        viewModel.leaderboardError
          ? `<p class="leaderboard__status">${escapeHtml(viewModel.leaderboardError)}</p>`
          : ""
      }
    </div>
  `;
}

function renderProfileStat(label, value) {
  return `
    <div class="profile-stat">
      <span>${label}</span>
      <strong>${value}</strong>
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

function formatNumber(value) {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatSignedNumber(value) {
  if (!Number.isFinite(value) || value === 0) {
    return "0";
  }

  const sign = value > 0 ? "+" : "−";
  return `${sign}${formatNumber(Math.abs(value))}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const DEFAULT_PROFILE_LABEL = "Профиль";
