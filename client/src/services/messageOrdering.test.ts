import { describe, expect, it } from "vitest";
import { sortMessagesByCreatedAt, timestampMillis } from "./messageOrdering";

describe("messageOrdering", () => {
  it("converte formatos comuns de timestamp", () => {
    expect(timestampMillis("2026-08-28T10:00:00.000Z")).toBe(Date.parse("2026-08-28T10:00:00.000Z"));
    expect(timestampMillis({ seconds: 10, nanoseconds: 500_000_000 })).toBe(10_500);
    expect(timestampMillis({ toMillis: () => 42 })).toBe(42);
  });

  it("mantém a mensagem mais nova na parte inferior", () => {
    const messages = [
      { id: "new", body: "segunda", createdAt: { seconds: 20 } },
      { id: "old", body: "primeira", createdAt: { seconds: 10 } },
      { id: "pending", body: "enviando", createdAt: undefined },
    ];
    expect(sortMessagesByCreatedAt(messages).map((message) => message.id)).toEqual(["old", "new", "pending"]);
  });

  it("usa o id como desempate estável", () => {
    const messages = [
      { id: "b", createdAt: "2026-08-28T10:00:00.000Z" },
      { id: "a", createdAt: "2026-08-28T10:00:00.000Z" },
    ];
    expect(sortMessagesByCreatedAt(messages).map((message) => message.id)).toEqual(["a", "b"]);
  });
});
