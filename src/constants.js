export const STORAGE_KEY = "sum-grid-browser-v1";

export const BOARD_SIZES = [4, 5, 6, 7];
export const DEFAULT_SIZE = 5;
export const DEFAULT_DIFFICULTY = "classic";
export const DEFAULT_PLAYER_NAME = "Игрок";

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
    lineSelectionRange: [1, 6],
    duplicateChance: 0.08,
    maxAttempts: 120,
    ambiguityProfile: {
      averageBase: 1.4,
      averagePerSize: 0.16,
      minLineCandidates: 1,
      maxTrivialLines: 8,
      minRichLineShare: 0.12,
      minBalancedLineShare: 0.35,
      balancedTargetRange: [0.2, 0.82],
    },
  },
  classic: {
    id: "classic",
    label: "Классика",
    description: "Сбалансированные поля с понятной, но не очевидной логикой.",
    densityRange: [0.36, 0.52],
    valueRange: [1, 9],
    lineSelectionRange: [1, 6],
    duplicateChance: 0.16,
    maxAttempts: 180,
    ambiguityProfile: {
      averageBase: 1.7,
      averagePerSize: 0.22,
      minLineCandidates: 1,
      maxTrivialLines: 6,
      minRichLineShare: 0.22,
      minBalancedLineShare: 0.42,
      balancedTargetRange: [0.24, 0.8],
    },
  },
  hard: {
    id: "hard",
    label: "Сложно",
    description: "Больше логической неоднозначности и меньше очевидных линий.",
    densityRange: [0.34, 0.52],
    valueRange: [1, 10],
    lineSelectionRange: [2, 5],
    duplicateChance: 0.28,
    maxAttempts: 260,
    ambiguityProfile: {
      averageBase: 2.15,
      averagePerSize: 0.5,
      minLineCandidates: 2,
      maxTrivialLines: 3,
      minRichLineShare: 0.42,
      minBalancedLineShare: 0.6,
      balancedTargetRange: [0.3, 0.74],
    },
  },
  expert: {
    id: "expert",
    label: "Эксперт",
    description: "Максимум неоднозначности: решение находится только через пересечения условий.",
    densityRange: [0.38, 0.58],
    valueRange: [1, 9],
    lineSelectionRange: [2, 5],
    duplicateChance: 0.42,
    maxAttempts: 340,
    ambiguityProfile: {
      averageBase: 2.65,
      averagePerSize: 0.68,
      minLineCandidates: 2,
      minLineCandidatesLargeBoard: 3,
      maxTrivialLines: 1,
      minRichLineShare: 0.58,
      minBalancedLineShare: 0.72,
      balancedTargetRange: [0.34, 0.7],
    },
  },
};
