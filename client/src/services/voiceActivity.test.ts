import { describe, expect, it } from "vitest";
import { getVoiceParticipantEvents, getVoiceSwitchResetChannel } from "./voiceActivity";

describe("voice participant activity events", () => {
  it("does not emit a sound on the first roster snapshot", () => {
    expect(getVoiceParticipantEvents(null, new Set([7]))).toEqual([]);
  });

  it("emits join when a participant appears", () => {
    expect(getVoiceParticipantEvents(new Set([7]), new Set([7, 8]))).toEqual(["join"]);
  });

  it("emits leave when a participant disappears", () => {
    expect(getVoiceParticipantEvents(new Set([7, 8]), new Set([7]))).toEqual(["leave"]);
  });

  it("emits both events when participants change in both directions", () => {
    expect(getVoiceParticipantEvents(new Set([7, 8]), new Set([7, 9]))).toEqual(["join", "leave"]);
  });

  it("resets the previous channel when switching rooms", () => {
    expect(getVoiceSwitchResetChannel(12, 13)).toBe(12);
    expect(getVoiceSwitchResetChannel(12, 12)).toBeNull();
    expect(getVoiceSwitchResetChannel(null, 13)).toBeNull();
  });
});
