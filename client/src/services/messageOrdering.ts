type FirestoreTimestampLike = {
  toMillis?: () => number;
  seconds?: number;
  nanoseconds?: number;
};

export function timestampMillis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (!value || typeof value !== "object") return null;
  const timestamp = value as FirestoreTimestampLike;
  if (typeof timestamp.toMillis === "function") {
    const millis = timestamp.toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  if (typeof timestamp.seconds === "number") {
    return timestamp.seconds * 1000 + (typeof timestamp.nanoseconds === "number" ? timestamp.nanoseconds / 1_000_000 : 0);
  }
  return null;
}

export function sortMessagesByCreatedAt<T extends { id: string; createdAt?: unknown }>(messages: T[]): T[] {
  return [...messages].sort((left, right) => {
    const leftTime = timestampMillis(left.createdAt) ?? Number.POSITIVE_INFINITY;
    const rightTime = timestampMillis(right.createdAt) ?? Number.POSITIVE_INFINITY;
    return leftTime - rightTime || left.id.localeCompare(right.id);
  });
}
