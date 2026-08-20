import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext {
  return {
    user: { id: 1, openId: "preview-user", publicId: "CON-PREVIEW01", name: "Preview User", email: "preview@example.com", loginMethod: "manus", avatarUrl: null, presence: "online", bio: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("call history and preview contracts", () => {
  it("exposes persisted call history and signaling procedures", () => {
    const caller = appRouter.createCaller(context());
    expect(caller.calls.list).toBeTypeOf("function");
    expect(caller.calls.signal).toBeTypeOf("function");
    expect(caller.calls.signals).toBeTypeOf("function");
    expect(caller.calls.presence).toBeTypeOf("function");
  });

  it("keeps media lifecycle controls in the protected call router", () => {
    const caller = appRouter.createCaller(context());
    expect(caller.calls.start).toBeTypeOf("function");
    expect(caller.calls.update).toBeTypeOf("function");
  });
});
