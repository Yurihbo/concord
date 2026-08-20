import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "concord-test-user",
      email: "concord@example.com",
      name: "Concord Tester",
      loginMethod: "manus",
      avatarUrl: null,
      bio: null,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("Concord feature contracts", () => {
  it("returns the authenticated user through auth.me", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.auth.me();
    expect(result?.openId).toBe("concord-test-user");
    expect(result?.name).toBe("Concord Tester");
  });

  it("rejects an attempt to add yourself as a friend", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.friends.request({ addresseeId: 7 })).rejects.toThrow("Cannot add yourself");
  });
});
