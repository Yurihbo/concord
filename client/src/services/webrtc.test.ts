import { afterEach, describe, expect, it, vi } from "vitest";
import { ConcordWebRTCService } from "./webrtc";

describe("screen sharing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts screen capture without requiring a system audio track", async () => {
    let ended: (() => void) | undefined;
    const track = { kind: "video", addEventListener: vi.fn((_name: string, listener: () => void) => { ended = listener; }), stop: vi.fn() };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const getDisplayMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia } });
    const service = new ConcordWebRTCService();

    await expect(service.shareScreen()).resolves.toBe(stream);
    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true });
    expect(service.getState()).toBe("sharing");
    ended?.();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(service.getState()).toBe("idle");
  });

  it("preserves the rejection so the UI can treat cancellation separately", async () => {
    const cancellation = new DOMException("The user canceled", "AbortError");
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: vi.fn().mockRejectedValue(cancellation) } });
    const service = new ConcordWebRTCService();
    await expect(service.shareScreen()).rejects.toMatchObject({ name: "AbortError" });
  });
});
