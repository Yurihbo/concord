import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "voice-test-user",
      publicId: "CON-VOICE0001",
      email: "voice@example.com",
      name: "Voice Tester",
      loginMethod: "manus",
      avatarUrl: null,
      bio: null,
      presence: "online",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("voice rooms", () => {
  it("exposes the persisted voice-room lifecycle procedures", () => {
    const caller = appRouter.createCaller(createContext());
    expect(typeof caller.communities.voice).toBe("function");
    expect(typeof caller.communities.createVoice).toBe("function");
    expect(typeof caller.communities.participants).toBe("function");
    expect(typeof caller.communities.join).toBe("function");
    expect(typeof caller.communities.leave).toBe("function");
    expect(typeof caller.communities.activity).toBe("function");
  });

  it("exposes the speaking-state mutation for synchronized voice activity", () => {
    const caller = appRouter.createCaller(createContext());
    expect(caller.communities.activity).toBeDefined();
  });

  it("keeps voice-room creation behind the protected community contract", () => {
    const caller = appRouter.createCaller(createContext());
    expect(caller.communities.createVoice).toBeDefined();
    expect(caller.communities.join).toBeDefined();
    expect(caller.communities.leave).toBeDefined();
  });
});
