import { describe, expect, it, vi } from "vitest";
import { FirebaseDirectCall } from "./firebaseDirectCall";

const { publishDirectCallSignal } = vi.hoisted(() => ({ publishDirectCallSignal: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/services/firebaseStore", () => ({ publishDirectCallSignal }));

class FakePeer {
  connectionState = "new";
  remoteDescription: RTCSessionDescriptionInit | null = null;
  ontrack: ((event: { streams: MediaStream[]; track: MediaStreamTrack }) => void) | null = null;
  onicecandidate: ((event: { candidate: { toJSON: () => object } | null }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  addTrack = vi.fn();
  addTransceiver = vi.fn(() => ({ sender: {} }));
  addIceCandidate = vi.fn(async () => undefined);
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" }));
  createAnswer = vi.fn(async () => ({ type: "answer", sdp: "answer-sdp" }));
  setLocalDescription = vi.fn(async () => undefined);
  setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => { this.remoteDescription = description; });
  close = vi.fn();
}

function localStream(): MediaStream {
  const track = { kind: "audio", id: "local-audio" } as unknown as MediaStreamTrack;
  return { getTracks: () => [track], getVideoTracks: () => [] } as unknown as MediaStream;
}

describe("FirebaseDirectCall", () => {
  it("encaminha o stream remoto recebido para a interface", async () => {
    let peer: FakePeer | undefined;
    vi.stubGlobal("RTCPeerConnection", class extends FakePeer { constructor() { super(); peer = this; } });
    const onRemoteStream = vi.fn();
    const call = new FirebaseDirectCall({ callId: "call-1", userId: "user-a", media: "audio", localStream: localStream(), onRemoteStream });

    await call.start("user-b");
    const remoteStream = {} as MediaStream;
    const remoteTrack = { kind: "audio", id: "remote-audio" } as unknown as MediaStreamTrack;
    peer?.ontrack?.({ streams: [remoteStream], track: remoteTrack });

    expect(onRemoteStream).toHaveBeenCalledWith(remoteStream);
    expect(publishDirectCallSignal).toHaveBeenCalledWith("call-1", expect.objectContaining({ kind: "offer", to: "user-b" }));
    call.stop();
  });

  it("guarda candidatos ICE que chegam antes da descrição remota", async () => {
    let peer: FakePeer | undefined;
    vi.stubGlobal("RTCPeerConnection", class extends FakePeer { constructor() { super(); peer = this; } });
    const call = new FirebaseDirectCall({ callId: "call-2", userId: "user-b", media: "screen", localStream: localStream(), onRemoteStream: vi.fn() });
    const candidate = { candidate: "candidate:1 1 UDP 1 127.0.0.1 1234 typ host" };

    await call.handleSignal({ id: "ice-1", from: "user-a", to: "user-b", kind: "ice", payload: JSON.stringify({ candidate }) });
    expect(peer?.addIceCandidate).not.toHaveBeenCalled();

    await call.handleSignal({ id: "offer-1", from: "user-a", to: "user-b", kind: "offer", payload: JSON.stringify({ sdp: { type: "offer", sdp: "offer-sdp" } }) });
    expect(peer?.addIceCandidate).toHaveBeenCalledWith(candidate);
    expect(peer?.addTransceiver).toHaveBeenCalledWith("video", { direction: "recvonly" });
    expect(publishDirectCallSignal).toHaveBeenCalledWith("call-2", expect.objectContaining({ kind: "answer", to: "user-a" }));
    call.stop();
  });
});
