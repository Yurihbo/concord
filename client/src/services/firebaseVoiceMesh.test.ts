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
  transceiver = { sender: { replaceTrack: vi.fn(async () => undefined) } };
  addTransceiver = vi.fn(() => this.transceiver);
  close = vi.fn();
  getSenders = () => [];
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer" }));
  setLocalDescription = vi.fn(async () => undefined);
  setRemoteDescription = vi.fn(async () => undefined);
  createAnswer = vi.fn(async () => ({ type: "answer", sdp: "answer" }));
  addIceCandidate = vi.fn(async () => undefined);
}

describe("FirebaseVoiceMesh", () => {
  it("encaminha um stream remoto recebido pelo peer para a camada de UI", async () => {
    const peers: FakePeer[] = [];
    vi.stubGlobal("RTCPeerConnection", class extends FakePeer { constructor() { super(); peers.push(this); } });
    const localTrack = { kind: "audio", stop: vi.fn() } as unknown as MediaStreamTrack;
    const localStream = { getTracks: () => [localTrack], getAudioTracks: () => [localTrack] } as unknown as MediaStream;
    const onRemoteStream = vi.fn();
    const mesh = new FirebaseVoiceMesh({ roomId: "room-1", userId: "user-a", localStream, onRemoteStream });
    await mesh.syncMembers([{ uid: "user-b", roomId: "room-1", displayName: "B", isSpeaking: false, muted: false }]);
    const remoteStream = {} as MediaStream;
    const remoteTrack = { kind: "audio", id: "remote-audio" } as unknown as MediaStreamTrack;
    peers[0].ontrack?.({ streams: [remoteStream], track: remoteTrack } as unknown as { streams: MediaStream[] });
    expect(onRemoteStream).toHaveBeenCalledWith("user-b", remoteStream);
    mesh.dispose();
  });

  it("encaminha uma track de vídeo remota como stream de tela", async () => {
    const peers: FakePeer[] = [];
    vi.stubGlobal("RTCPeerConnection", class extends FakePeer { constructor() { super(); peers.push(this); } });
    class FakeMediaStream {
      private readonly tracks: MediaStreamTrack[];
      constructor(tracks: MediaStreamTrack[] = []) { this.tracks = tracks; }
      getTracks() { return this.tracks; }
      getVideoTracks() { return this.tracks.filter((track) => track.kind === "video"); }
      getAudioTracks() { return this.tracks.filter((track) => track.kind === "audio"); }
    }
    vi.stubGlobal("MediaStream", FakeMediaStream);
    const audioTrack = { kind: "audio", id: "local-audio", stop: vi.fn() } as unknown as MediaStreamTrack;
    const screenTrack = { kind: "video", id: "remote-screen", addEventListener: vi.fn() } as unknown as MediaStreamTrack;
    const onRemoteScreenStream = vi.fn();
    const localStream = { getTracks: () => [audioTrack], getAudioTracks: () => [audioTrack] } as unknown as MediaStream;
    const mesh = new FirebaseVoiceMesh({ roomId: "room-screen", userId: "user-a", localStream, onRemoteStream: vi.fn(), onRemoteScreenStream });

    await mesh.syncMembers([{ uid: "user-b", roomId: "room-screen", displayName: "B", isSpeaking: false, muted: false }]);
    peers[0].ontrack?.({ streams: [], track: screenTrack } as unknown as { streams: MediaStream[] });

    expect(onRemoteScreenStream).toHaveBeenCalledTimes(1);
    expect(onRemoteScreenStream.mock.calls[0]?.[1].getVideoTracks()).toContain(screenTrack);
    mesh.dispose();
  });

  it("substitui a track de vídeo em todos os peers e a remove ao parar", async () => {
    const peers: FakePeer[] = [];
    vi.stubGlobal("RTCPeerConnection", class extends FakePeer { constructor() { super(); peers.push(this); } });
    const audioTrack = { kind: "audio", stop: vi.fn() } as unknown as MediaStreamTrack;
    const screenTrack = { kind: "video", stop: vi.fn(), addEventListener: vi.fn() } as unknown as MediaStreamTrack;
    const localStream = { getTracks: () => [audioTrack], getAudioTracks: () => [audioTrack] } as unknown as MediaStream;
    const screenStream = { getVideoTracks: () => [screenTrack], getTracks: () => [screenTrack] } as unknown as MediaStream;
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(screenStream) } });
    const mesh = new FirebaseVoiceMesh({ roomId: "room-1", userId: "user-a", localStream, onRemoteStream: vi.fn() });
    await mesh.syncMembers([{ uid: "user-b", roomId: "room-1", displayName: "B", isSpeaking: false, muted: false }]);
    await mesh.shareScreen();
    expect(peers[0].transceiver.sender.replaceTrack).toHaveBeenCalledWith(screenTrack);
    mesh.stopScreen();
    expect(peers[0].transceiver.sender.replaceTrack).toHaveBeenCalledWith(null);
    mesh.dispose();
  });

  it("cria peers para participantes ordenados e encerra recursos", async () => {
    const peers: FakePeer[] = [];
    vi.stubGlobal("RTCPeerConnection", class extends FakePeer { constructor() { super(); peers.push(this); } });
    const track = { kind: "audio", stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
    const mesh = new FirebaseVoiceMesh({ roomId: "room-1", userId: "user-a", localStream: stream, onRemoteStream: vi.fn() });

    await mesh.syncMembers([{ uid: "user-b", roomId: "room-1", displayName: "B", isSpeaking: false, muted: false }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(peers).toHaveLength(1);
    expect(peers[0].addTrack).toHaveBeenCalledWith(track, stream);
    expect(publishSignal).toHaveBeenCalledWith("room-1", expect.objectContaining({ kind: "offer", to: "user-b" }));
    expect(peers[0].addTransceiver).toHaveBeenCalledWith("video", { direction: "sendrecv" });

    mesh.dispose();
    expect(peers[0].close).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });
});
