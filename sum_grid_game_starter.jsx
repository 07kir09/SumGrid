import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, CheckCircle2, Eye, EyeOff, RotateCcw, Trophy } from "lucide-react";

const STORAGE_KEY = "sum-grid-game-starter-v1";

function buildEmptyMarks(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createPuzzle(size) {
  const numbers = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => randomInt(1, 9))
  );

  const density = size <= 4 ? 0.42 : size === 5 ? 0.38 : 0.34;
  const solution = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => Math.random() < density)
  );

  for (let r = 0; r < size; r++) {
    if (!solution[r].some(Boolean)) {
      solution[r][randomInt(0, size - 1)] = true;
    }
  }

  for (let c = 0; c < size; c++) {
    const hasSelected = solution.some((row) => row[c]);
    if (!hasSelected) {
      solution[randomInt(0, size - 1)][c] = true;
    }
  }

  const rowTargets = solution.map((row, r) =>
    row.reduce((sum, isOn, c) => sum + (isOn ? numbers[r][c] : 0), 0)
  );

  const colTargets = Array.from({ length: size }, (_, c) =>
    solution.reduce((sum, row, r) => sum + (row[c] ? numbers[r][c] : 0), 0)
  );

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    size,
    numbers,
    solution,
    rowTargets,
    colTargets,
  };
}

function calcPlayerRowSums(puzzle, marks) {
  return puzzle.numbers.map((row, r) =>
    row.reduce((sum, value, c) => sum + (marks[r][c] === 1 ? value : 0), 0)
  );
}

function calcPlayerColSums(puzzle, marks) {
  return Array.from({ length: puzzle.size }, (_, c) =>
    puzzle.numbers.reduce((sum, row, r) => sum + (marks[r][c] === 1 ? row[c] : 0), 0)
  );
}

function getStatus(current, target) {
  if (current === target) return "ok";
  if (current > target) return "over";
  return "under";
}

function formatElapsedTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function StatPill({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
      <div className="text-xs uppercase tracking-[0.2em] text-white/50">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

export default function SumGridGameStarter() {
  const [size, setSize] = useState(5);
  const [puzzle, setPuzzle] = useState(() => createPuzzle(5));
  const [marks, setMarks] = useState(() => buildEmptyMarks(5));
  const [showSolution, setShowSolution] = useState(false);
  const [message, setMessage] = useState("Выделяй клетки так, чтобы суммы совпали с числами справа и снизу.");
  const [moves, setMoves] = useState(0);
  const [wins, setWins] = useState(0);
  const [level, setLevel] = useState(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isWinRecorded, setIsWinRecorded] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (saved?.puzzle?.size && saved?.marks) {
        setSize(saved.puzzle.size);
        setPuzzle(saved.puzzle);
        setMarks(saved.marks);
        setShowSolution(false);
        setMoves(saved.moves || 0);
        setWins(saved.wins || 0);
        setLevel(saved.level || 1);
        setElapsedSeconds(saved.elapsedSeconds || 0);
        setIsWinRecorded(saved.isWinRecorded || false);
      }
    } catch {
      // ignore broken save
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ puzzle, marks, moves, wins, level, elapsedSeconds, isWinRecorded })
    );
  }, [puzzle, marks, moves, wins, level, elapsedSeconds, isWinRecorded]);

  const rowSums = useMemo(() => calcPlayerRowSums(puzzle, marks), [puzzle, marks]);
  const colSums = useMemo(() => calcPlayerColSums(puzzle, marks), [puzzle, marks]);

  const allCorrect = useMemo(() => {
    const rowsOk = rowSums.every((sum, i) => sum === puzzle.rowTargets[i]);
    const colsOk = colSums.every((sum, i) => sum === puzzle.colTargets[i]);
    return rowsOk && colsOk;
  }, [rowSums, colSums, puzzle]);

  useEffect(() => {
    if (allCorrect && !isWinRecorded) {
      setWins((w) => w + 1);
      setIsWinRecorded(true);
      setMessage(
        `Поздравляем! Вы прошли уровень ${level} за ${formatElapsedTime(elapsedSeconds)} и сделали ${moves} ходов.`
      );
    }
  }, [allCorrect, elapsedSeconds, isWinRecorded, level, moves]);

  useEffect(() => {
    if (allCorrect) return undefined;

    const timer = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [allCorrect, puzzle.id]);

  function newPuzzle(nextSize = size) {
    const fresh = createPuzzle(nextSize);
    setPuzzle(fresh);
    setMarks(buildEmptyMarks(nextSize));
    setShowSolution(false);
    setMoves(0);
    setElapsedSeconds(0);
    setIsWinRecorded(false);
    setLevel((currentLevel) => currentLevel + 1);
    setMessage("Новый уровень готов.");
  }

  function resetMarks() {
    setMarks(buildEmptyMarks(size));
    setShowSolution(false);
    setMoves(0);
    setElapsedSeconds(0);
    setIsWinRecorded(false);
    setMessage("Поле очищено.");
  }

  function toggleCell(r, c) {
    if (allCorrect) return;
    setMarks((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][c] = (next[r][c] + 1) % 3; // 0 empty, 1 selected, 2 crossed
      return next;
    });
    setMoves((m) => m + 1);
  }

  function checkBoard() {
    if (allCorrect) {
      setMessage(
        `Поздравляем! Вы прошли уровень ${level} за ${formatElapsedTime(elapsedSeconds)} и сделали ${moves} ходов.`
      );
      return;
    }

    const badRows = rowSums.filter((sum, i) => sum !== puzzle.rowTargets[i]).length;
    const badCols = colSums.filter((sum, i) => sum !== puzzle.colTargets[i]).length;
    setMessage(`Пока не сходится: строк ${badRows}, столбцов ${badCols}.`);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.28),_transparent_30%),linear-gradient(180deg,#0b1020_0%,#0f172a_55%,#111827_100%)] text-white p-6">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl lg:flex-row lg:items-end lg:justify-between"
        >
          <div>
            <div className="mb-2 inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.25em] text-indigo-200">
              Logic Puzzle Prototype
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Sum Grid</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
              Внутри клеток лежат числа. Выделяй нужные клетки так, чтобы сумма выбранных чисел в каждой строке и каждом столбце совпала с целями по краям.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatPill label="Уровень" value={level} />
            <StatPill label="Ходов" value={moves} />
            <StatPill label="Время" value={formatElapsedTime(elapsedSeconds)} />
            <StatPill label="Побед" value={wins} />
          </div>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_360px]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Игровое поле</h2>
                <p className="text-sm text-white/60">Клик по клетке: пусто → выбрано → зачёркнуто → пусто</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setSize(n);
                      newPuzzle(n);
                    }}
                    className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                      size === n
                        ? "bg-white text-slate-900"
                        : "bg-white/8 text-white/80 hover:bg-white/14"
                    }`}
                  >
                    {n}×{n}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-auto rounded-[24px] border border-white/10 bg-slate-950/40 p-4">
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${size + 1}, minmax(54px, 1fr))`,
                  minWidth: `${(size + 1) * 62}px`,
                }}
              >
                {Array.from({ length: size }).map((_, c) => {
                  const status = getStatus(colSums[c], puzzle.colTargets[c]);
                  return (
                    <div
                      key={`top-${c}`}
                      className={`col-start-${c + 1} row-start-1 flex h-14 items-center justify-center rounded-2xl border text-lg font-bold ${
                        status === "ok"
                          ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                          : status === "over"
                          ? "border-rose-400/40 bg-rose-400/15 text-rose-200"
                          : "border-white/10 bg-white/5 text-white/80"
                      }`}
                      style={{ gridColumn: c + 1, gridRow: 1 }}
                    >
                      <div className="text-center leading-tight">
                        <div>{puzzle.colTargets[c]}</div>
                        <div className="text-[10px] font-medium text-white/50">{colSums[c]}</div>
                      </div>
                    </div>
                  );
                })}

                <div style={{ gridColumn: size + 1, gridRow: 1 }} />

                {puzzle.numbers.map((row, r) => {
                  const rowStatus = getStatus(rowSums[r], puzzle.rowTargets[r]);
                  return (
                    <React.Fragment key={`row-${r}`}>
                      {row.map((value, c) => {
                        const state = marks[r][c];
                        const isSolution = puzzle.solution[r][c];

                        const baseClass =
                          state === 1
                            ? "border-indigo-300/60 bg-indigo-400/25 text-white shadow-[0_0_0_1px_rgba(165,180,252,0.15),0_12px_40px_rgba(99,102,241,0.25)]"
                            : state === 2
                            ? "border-white/10 bg-white/5 text-white/30"
                            : "border-white/10 bg-white/[0.04] text-white/90 hover:bg-white/[0.08]";

                        const solutionGlow = showSolution && isSolution ? "ring-2 ring-emerald-400/50" : "";

                        return (
                          <button
                            key={`${r}-${c}`}
                            onClick={() => toggleCell(r, c)}
                            className={`group relative h-16 rounded-2xl border text-xl font-bold transition-all duration-150 ${baseClass} ${solutionGlow}`}
                            style={{ gridColumn: c + 1, gridRow: r + 2 }}
                          >
                            <span className={state === 2 ? "line-through decoration-2" : ""}>{value}</span>
                            {state === 2 && (
                              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl text-white/25">
                                ✕
                              </span>
                            )}
                            {showSolution && isSolution && state !== 1 && (
                              <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                                target
                              </span>
                            )}
                          </button>
                        );
                      })}

                      <div
                        className={`flex h-16 items-center justify-center rounded-2xl border text-lg font-bold ${
                          rowStatus === "ok"
                            ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                            : rowStatus === "over"
                            ? "border-rose-400/40 bg-rose-400/15 text-rose-200"
                            : "border-white/10 bg-white/5 text-white/80"
                        }`}
                        style={{ gridColumn: size + 1, gridRow: r + 2 }}
                      >
                        <div className="text-center leading-tight">
                          <div>{puzzle.rowTargets[r]}</div>
                          <div className="text-[10px] font-medium text-white/50">{rowSums[r]}</div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl"
          >
            <h2 className="text-lg font-semibold">Управление</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">Сейчас это красивый стартовый прототип. Дальше можно добавить настоящий редактор уровней, подсказки, анимацию падения числа и уникальный генератор.</p>

            <div className="mt-5 grid gap-3">
              <button
                onClick={() => newPuzzle(size)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-semibold text-slate-900 transition hover:scale-[1.01]"
              >
                <RefreshCw className="h-4 w-4" /> Новый уровень
              </button>

              <button
                onClick={checkBoard}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-400/20 px-4 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-400/25"
              >
                <CheckCircle2 className="h-4 w-4" /> Проверить
              </button>

              <button
                onClick={resetMarks}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/8 px-4 py-3 font-semibold text-white transition hover:bg-white/12"
              >
                <RotateCcw className="h-4 w-4" /> Сбросить
              </button>

              <button
                onClick={() => setShowSolution((v) => !v)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-400/20 px-4 py-3 font-semibold text-indigo-200 transition hover:bg-indigo-400/25"
              >
                {showSolution ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showSolution ? "Скрыть решение" : "Показать решение"}
              </button>
            </div>

            <div className="mt-5 rounded-3xl border border-white/10 bg-slate-950/40 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 rounded-2xl bg-amber-400/15 p-2 text-amber-200">
                  <Trophy className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold">Статус партии</h3>
                  <p className="mt-2 text-sm leading-6 text-white/70">{message}</p>
                  {allCorrect && (
                    <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                      <div className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">Уровень пройден</div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        Уровень {level} закрыт. Отличная работа.
                      </div>
                      <div className="mt-2 leading-6 text-white/80">
                        Время: {formatElapsedTime(elapsedSeconds)}. Ходов: {moves}. Размер поля: {size}×{size}.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="font-semibold">Следующие улучшения</h3>
              <ul className="mt-3 space-y-2 text-sm text-white/70">
                <li>• Настоящее различие между одним тапом и двойным тапом на мобильных устройствах.</li>
                <li>• Анимация «обвала» числа при выборе клетки.</li>
                <li>• Уникальный генератор уровней с проверкой решаемости.</li>
                <li>• Ежедневные челленджи и таблица рекордов.</li>
                <li>• Плавные звуки, вибрация и тема day/night.</li>
              </ul>
            </div>
          </motion.aside>
        </div>
      </div>
    </div>
  );
}
