export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function createMatrix(size, factory) {
  return Array.from({ length: size }, (_, rowIndex) =>
    Array.from({ length: size }, (_, columnIndex) =>
      typeof factory === "function" ? factory(rowIndex, columnIndex) : factory
    )
  );
}

export function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function shuffle(items) {
  const array = items.slice();

  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }

  return array;
}

export function sampleIndices(length, count) {
  return shuffle(Array.from({ length }, (_, index) => index)).slice(0, count);
}

export function generateId(prefix = "sum-grid") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
  }

  return [minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

export function pluralizeRu(count, one, few, many) {
  const absolute = Math.abs(count);
  const mod10 = absolute % 10;
  const mod100 = absolute % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}
