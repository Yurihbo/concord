import { describe, expect, it } from "vitest";
import { isSignalForVoiceSession } from "./firebaseSignaling";

describe("isSignalForVoiceSession", () => {
  it("aceita sinais sem targetSessionId durante a sincronização inicial do roster", () => {
    expect(isSignalForVoiceSession({}, "session-local")).toBe(true);
  });

  it("aceita somente sinais explicitamente destinados à sessão atual", () => {
    expect(isSignalForVoiceSession({ targetSessionId: "session-local" }, "session-local")).toBe(true);
    expect(isSignalForVoiceSession({ targetSessionId: "session-old" }, "session-local")).toBe(false);
  });
});
