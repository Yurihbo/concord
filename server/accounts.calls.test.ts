import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext {
  return {
    user: { id: 12, openId: "account-test", publicId: "CON-TEST12", email: "a@concord.test", name: "Account Test", avatarUrl: null, bio: null, loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("Concord account and call contracts", () => {
  it("exposes account search and call procedures", () => {
    const caller = appRouter.createCaller(context());
    expect(caller.accounts.search).toBeTypeOf("function");
    expect(caller.calls.start).toBeTypeOf("function");
    expect(caller.calls.update).toBeTypeOf("function");
  });

  it("returns the current user's public identity through auth.me", async () => {
    const result = await appRouter.createCaller(context()).auth.me();
    expect(result?.publicId).toBe("CON-TEST12");
  });
});
