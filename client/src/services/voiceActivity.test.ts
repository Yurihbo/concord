import { afterEach, describe, expect, it, vi } from "vitest";
import { getVoiceParticipantEvents, getVoiceSwitchResetChannel, getVoiceToneProfile, playVoiceToneOnContext, startDirectCallRingtone } from "./voiceActivity";

describe("voice participant activity events", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
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

  it("defines distinct tones for join, leave, mute and unmute", () => {
    const tones = ["join", "leave", "mute", "unmute"].map((kind) => getVoiceToneProfile(kind as "join" | "leave" | "mute" | "unmute"));
    expect(tones).toHaveLength(4);
    expect(new Set(tones.map((tone) => tone.join(":"))).size).toBe(4);
  });

  it("starts and stops the player for every tone event", () => {
    const start = vi.fn();
    const stop = vi.fn();
    const oscillator = { type: "", frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), start, stop };
    const gain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    const context = { currentTime: 0, destination: {}, createOscillator: vi.fn(() => oscillator), createGain: vi.fn(() => gain) } as unknown as AudioContext;
    for (const kind of ["join", "leave", "mute", "unmute"] as const) playVoiceToneOnContext(context, kind);
    expect(start).toHaveBeenCalledTimes(4);
    expect(stop).toHaveBeenCalledTimes(4);
  });

  it("starts a repeating incoming-call ringtone and stops it cleanly", async () => {
    vi.useFakeTimers();
    const oscillator = { type: "", frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const gain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    const context = { currentTime: 0, destination: {}, createOscillator: vi.fn(() => oscillator), createGain: vi.fn(() => gain), resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
    class FakeAudioContext { currentTime = context.currentTime; destination = context.destination; createOscillator = context.createOscillator; createGain = context.createGain; resume = context.resume; close = context.close; }
    vi.stubGlobal("window", { AudioContext: FakeAudioContext, setTimeout, setInterval, clearTimeout, clearInterval });
    const stop = startDirectCallRingtone();
    await vi.advanceTimersByTimeAsync(2600);
    expect(context.createOscillator).toHaveBeenCalled();
    stop();
    expect(context.close).toHaveBeenCalledTimes(1);
  });
});
