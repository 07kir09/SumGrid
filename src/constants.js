export const STORAGE_KEY = "sum-grid-browser-v1";

export const BOARD_SIZES = [4, 5, 6, 7];
export const DEFAULT_SIZE = 5;
export const DEFAULT_DIFFICULTY = "classic";

export const CELL_STATES = {
  EMPTY: 0,
  SELECTED: 1,
  CROSSED: 2,
};

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Легко",
    description: "Больше нужных клеток и более мягкие значения.",
    densityRange: [0.46, 0.62],
    valueRange: [1, 7],
    maxAttempts: 120,
  },
  classic: {
    id: "classic",
    label: "Классика",
    description: "Сбалансированные поля с понятной, но не очевидной логикой.",
    densityRange: [0.36, 0.52],
    valueRange: [1, 9],
    maxAttempts: 160,
  },
  hard: {
    id: "hard",
    label: "Сложно",
    description: "Меньше нужных клеток и более широкий диапазон чисел.",
    densityRange: [0.28, 0.42],
    valueRange: [2, 11],
    maxAttempts: 200,
  },
  expert: {
    id: "expert",
    label: "Эксперт",
    description: "Редкие решения, крупные числа и более жёсткое чтение поля.",
    densityRange: [0.22, 0.36],
    valueRange: [3, 12],
    maxAttempts: 240,
  },
};
