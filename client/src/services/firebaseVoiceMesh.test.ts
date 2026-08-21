import { describe, expect, it, vi } from "vitest";
import { FirebaseVoiceMesh } from "./firebaseVoiceMesh";

const { publishSignal } = vi.hoisted(() => ({ publishSignal: vi.fn().mockResolvedValue("signal-1") }));
vi.mock("@/services/firebaseSignaling", () => ({ publishSignal }));

class FakePeer {
  connectionState = "new";
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
  onicecandidate: ((event: { candidate: null }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  addTrack = vi.fn();
  close = vi.fn();
  getSenders = () => [];
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer" }));
  setLocalDescription = vi.fn(async () => undefined);
  setRemoteDescription = vi.fn(async () => undefined);
  createAnswer = vi.fn(async () => ({ type: "answer", sdp: "answer" }));
  addIceCandidate = vi.fn(async () => undefined);
}

describe("FirebaseVoiceMesh", () => {
  it("cria peers para participantes ordenados e encerra recursos", async () => {
    const peers: FakePeer[] = [];
    vi.stubGlobal("RTCPeerConnection", class extends FakePeer { constructor() { super(); peers.push(this); } });
    const track = { kind: "audio", stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const mesh = new FirebaseVoiceMesh({ roomId: "room-1", userId: "user-a", localStream: stream, onRemoteStream: vi.fn() });

    await mesh.syncMembers([{ uid: "user-b", roomId: "room-1", displayName: "B", isSpeaking: false, muted: false }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(peers).toHaveLength(1);
    expect(peers[0].addTrack).toHaveBeenCalledWith(track, stream);
    expect(publishSignal).toHaveBeenCalledWith("room-1", expect.objectContaining({ kind: "offer", to: "user-b" }));

    mesh.dispose();
    expect(peers[0].close).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });
});
