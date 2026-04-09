import { CELL_STATES, DEFAULT_DIFFICULTY, DIFFICULTIES } from "./constants.js";
import {
  clamp,
  createMatrix,
  generateId,
  randomInt,
  shuffle,
  sum,
} from "./utils.js";

export function buildEmptyMarks(size) {
  return createMatrix(size, CELL_STATES.EMPTY);
}

export function calculateRowSums(numbers, marks) {
  return numbers.map((row, rowIndex) =>
    row.reduce(
      (total, value, columnIndex) =>
        total + (marks[rowIndex][columnIndex] === CELL_STATES.SELECTED ? value : 0),
      0
    )
  );
}

export function calculateColumnSums(numbers, marks) {
  return Array.from({ length: numbers.length }, (_, columnIndex) =>
    numbers.reduce(
      (total, row, rowIndex) =>
        total + (marks[rowIndex][columnIndex] === CELL_STATES.SELECTED ? row[columnIndex] : 0),
      0
    )
  );
}

export function getLineStatus(current, target) {
  if (current === target) {
    return "correct";
  }

  if (current > target) {
    return "exceeded";
  }

  return "incomplete";
}

export function generatePuzzle({ size, difficultyId = DEFAULT_DIFFICULTY }) {
  const difficulty = DIFFICULTIES[difficultyId] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];
  let fallbackPuzzle = null;

  for (let attempt = 0; attempt < difficulty.maxAttempts; attempt += 1) {
    const numbers = createNumberGrid(size, difficulty);
    const solution = createSolutionPattern(size, difficulty);
    const puzzle = finalizePuzzle({ size, difficultyId, numbers, solution });
    const solutionCount = countSolutions(puzzle, 2);

    if (solutionCount === 1) {
      return {
        ...puzzle,
        integrity: "unique",
        solutionCount,
      };
    }

    if (!fallbackPuzzle) {
      fallbackPuzzle = {
        ...puzzle,
        integrity: "relaxed",
        solutionCount,
      };
    }
  }

  return fallbackPuzzle;
}

function createNumberGrid(size, difficulty) {
  const [minValue, maxValue] = difficulty.valueRange;

  return createMatrix(size, () => {
    const baseValue = randomInt(minValue, maxValue);
    const spike = Math.random() > 0.84 ? 1 : 0;
    return clamp(baseValue + spike, minValue, maxValue);
  });
}

function createSolutionPattern(size, difficulty) {
  const [minDensity, maxDensity] = difficulty.densityRange;
  const minSelectedPerLine = 1;
  const maxSelectedPerLine = size - 1;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const density = minDensity + Math.random() * (maxDensity - minDensity);
    const selection = createMatrix(size, false);
    const rowCounts = Array(size).fill(0);
    const columnCounts = Array(size).fill(0);

    for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
      const desiredSelected = clamp(
        Math.round(size * density) + randomInt(-1, 1),
        minSelectedPerLine,
        maxSelectedPerLine
      );

      const candidateColumns = shuffle(
        Array.from({ length: size }, (_, columnIndex) => columnIndex)
      ).sort((left, right) => columnCounts[left] - columnCounts[right]);

      for (let index = 0; index < desiredSelected; index += 1) {
        const columnIndex = candidateColumns[index];
        selection[rowIndex][columnIndex] = true;
        rowCounts[rowIndex] += 1;
        columnCounts[columnIndex] += 1;
      }
    }

    if (
      rebalanceSelection(selection, rowCounts, columnCounts, minSelectedPerLine, maxSelectedPerLine)
    ) {
      return selection;
    }
  }

  return createMatrix(size, (rowIndex, columnIndex) => rowIndex === columnIndex);
}

function rebalanceSelection(selection, rowCounts, columnCounts, minCount, maxCount) {
  const size = selection.length;

  for (let pass = 0; pass < 16; pass += 1) {
    let changed = false;

    for (let columnIndex = 0; columnIndex < size; columnIndex += 1) {
      while (columnCounts[columnIndex] < minCount) {
        const rowIndex = pickRowForColumn(selection, rowCounts, columnIndex, maxCount, "add");

        if (rowIndex === null) {
          break;
        }

        setSelection(selection, rowCounts, columnCounts, rowIndex, columnIndex, true);
        changed = true;
      }

      while (columnCounts[columnIndex] > maxCount) {
        const rowIndex = pickRowForColumn(selection, rowCounts, columnIndex, minCount, "remove");

        if (rowIndex === null) {
          break;
        }

        setSelection(selection, rowCounts, columnCounts, rowIndex, columnIndex, false);
        changed = true;
      }
    }

    for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
      while (rowCounts[rowIndex] < minCount) {
        const columnIndex = pickColumnForRow(selection, columnCounts, rowIndex, maxCount, "add");

        if (columnIndex === null) {
          break;
        }

        setSelection(selection, rowCounts, columnCounts, rowIndex, columnIndex, true);
        changed = true;
      }

      while (rowCounts[rowIndex] > maxCount) {
        const columnIndex = pickColumnForRow(selection, columnCounts, rowIndex, minCount, "remove");

        if (columnIndex === null) {
          break;
        }

        setSelection(selection, rowCounts, columnCounts, rowIndex, columnIndex, false);
        changed = true;
      }
    }

    if (isBalanced(rowCounts, columnCounts, minCount, maxCount)) {
      return true;
    }

    if (!changed) {
      break;
    }
  }

  return isBalanced(rowCounts, columnCounts, minCount, maxCount);
}

function pickRowForColumn(selection, rowCounts, columnIndex, limit, mode) {
  const candidates = [];

  for (let rowIndex = 0; rowIndex < selection.length; rowIndex += 1) {
    if (mode === "add") {
      if (!selection[rowIndex][columnIndex] && rowCounts[rowIndex] < limit) {
        candidates.push(rowIndex);
      }
      continue;
    }

    if (selection[rowIndex][columnIndex] && rowCounts[rowIndex] > limit) {
      candidates.push(rowIndex);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const sortedCandidates = shuffle(candidates).sort((left, right) =>
    mode === "add" ? rowCounts[left] - rowCounts[right] : rowCounts[right] - rowCounts[left]
  );

  return sortedCandidates[0];
}

function pickColumnForRow(selection, columnCounts, rowIndex, limit, mode) {
  const candidates = [];

  for (let columnIndex = 0; columnIndex < selection.length; columnIndex += 1) {
    if (mode === "add") {
      if (!selection[rowIndex][columnIndex] && columnCounts[columnIndex] < limit) {
        candidates.push(columnIndex);
      }
      continue;
    }

    if (selection[rowIndex][columnIndex] && columnCounts[columnIndex] > limit) {
      candidates.push(columnIndex);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const sortedCandidates = shuffle(candidates).sort((left, right) =>
    mode === "add"
      ? columnCounts[left] - columnCounts[right]
      : columnCounts[right] - columnCounts[left]
  );

  return sortedCandidates[0];
}

function setSelection(selection, rowCounts, columnCounts, rowIndex, columnIndex, nextState) {
  const currentState = selection[rowIndex][columnIndex];

  if (currentState === nextState) {
    return;
  }

  selection[rowIndex][columnIndex] = nextState;
  const delta = nextState ? 1 : -1;
  rowCounts[rowIndex] += delta;
  columnCounts[columnIndex] += delta;
}

function isBalanced(rowCounts, columnCounts, minCount, maxCount) {
  return (
    rowCounts.every((count) => count >= minCount && count <= maxCount) &&
    columnCounts.every((count) => count >= minCount && count <= maxCount)
  );
}

function finalizePuzzle({ size, difficultyId, numbers, solution }) {
  const rowTargets = numbers.map((row, rowIndex) =>
    row.reduce((total, value, columnIndex) => total + (solution[rowIndex][columnIndex] ? value : 0), 0)
  );

  const columnTargets = Array.from({ length: size }, (_, columnIndex) =>
    numbers.reduce(
      (total, row, rowIndex) => total + (solution[rowIndex][columnIndex] ? row[columnIndex] : 0),
      0
    )
  );

  return {
    id: generateId("puzzle"),
    createdAt: new Date().toISOString(),
    size,
    difficultyId,
    numbers,
    solution,
    rowTargets,
    columnTargets,
  };
}

function countSolutions(puzzle, limit = 2) {
  const rowMeta = puzzle.numbers.map((rowValues, rowIndex) => {
    const candidates = buildRowCandidates(rowValues, puzzle.rowTargets[rowIndex]);
    return {
      rowIndex,
      candidates,
    };
  });

  if (rowMeta.some((row) => row.candidates.length === 0)) {
    return 0;
  }

  rowMeta.sort((left, right) => left.candidates.length - right.candidates.length);

  const suffixBounds = buildSuffixBounds(rowMeta, puzzle.size);
  const memo = new Map();

  function search(rowCursor, columnSums) {
    if (rowCursor === rowMeta.length) {
      return columnSums.every((value, columnIndex) => value === puzzle.columnTargets[columnIndex])
        ? 1
        : 0;
    }

    const memoKey = `${rowCursor}|${columnSums.join(",")}`;

    if (memo.has(memoKey)) {
      return memo.get(memoKey);
    }

    let totalSolutions = 0;
    const currentRow = rowMeta[rowCursor];

    for (const candidate of currentRow.candidates) {
      const nextColumnSums = columnSums.map(
        (value, columnIndex) => value + candidate.columnAdds[columnIndex]
      );

      if (
        nextColumnSums.some(
          (value, columnIndex) => value > puzzle.columnTargets[columnIndex]
        )
      ) {
        continue;
      }

      let isViable = true;

      for (let columnIndex = 0; columnIndex < puzzle.size; columnIndex += 1) {
        const remainingMin =
          nextColumnSums[columnIndex] + suffixBounds.min[rowCursor + 1][columnIndex];
        const remainingMax =
          nextColumnSums[columnIndex] + suffixBounds.max[rowCursor + 1][columnIndex];

        if (
          remainingMin > puzzle.columnTargets[columnIndex] ||
          remainingMax < puzzle.columnTargets[columnIndex]
        ) {
          isViable = false;
          break;
        }
      }

      if (!isViable) {
        continue;
      }

      totalSolutions += search(rowCursor + 1, nextColumnSums);

      if (totalSolutions >= limit) {
        memo.set(memoKey, limit);
        return limit;
      }
    }

    memo.set(memoKey, totalSolutions);
    return totalSolutions;
  }

  return search(0, Array(puzzle.size).fill(0));
}

function buildRowCandidates(rowValues, target) {
  const candidateCount = 1 << rowValues.length;
  const candidates = [];

  for (let mask = 0; mask < candidateCount; mask += 1) {
    let total = 0;
    const columnAdds = Array(rowValues.length).fill(0);

    for (let columnIndex = 0; columnIndex < rowValues.length; columnIndex += 1) {
      if ((mask & (1 << columnIndex)) === 0) {
        continue;
      }

      const value = rowValues[columnIndex];
      total += value;
      columnAdds[columnIndex] = value;

      if (total > target) {
        break;
      }
    }

    if (total === target) {
      candidates.push({ mask, columnAdds });
    }
  }

  return candidates;
}

function buildSuffixBounds(rowMeta, size) {
  const minBounds = Array.from({ length: rowMeta.length + 1 }, () => Array(size).fill(0));
  const maxBounds = Array.from({ length: rowMeta.length + 1 }, () => Array(size).fill(0));

  for (let rowIndex = rowMeta.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const minAdds = Array(size).fill(Number.POSITIVE_INFINITY);
    const maxAdds = Array(size).fill(Number.NEGATIVE_INFINITY);

    for (const candidate of rowMeta[rowIndex].candidates) {
      for (let columnIndex = 0; columnIndex < size; columnIndex += 1) {
        minAdds[columnIndex] = Math.min(minAdds[columnIndex], candidate.columnAdds[columnIndex]);
        maxAdds[columnIndex] = Math.max(maxAdds[columnIndex], candidate.columnAdds[columnIndex]);
      }
    }

    for (let columnIndex = 0; columnIndex < size; columnIndex += 1) {
      minBounds[rowIndex][columnIndex] = minAdds[columnIndex] + minBounds[rowIndex + 1][columnIndex];
      maxBounds[rowIndex][columnIndex] = maxAdds[columnIndex] + maxBounds[rowIndex + 1][columnIndex];
    }
  }

  return {
    min: minBounds,
    max: maxBounds,
  };
}

export function summarizeTargets(puzzle) {
  return {
    rowTotal: sum(puzzle.rowTargets),
    columnTotal: sum(puzzle.columnTargets),
  };
}
