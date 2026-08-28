import { publishSignal } from "@/services/firebaseSignaling";
import type { FirebaseSignal, FirebaseVoiceMember } from "@/services/firebaseStore";

type SignalPayload = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

type VoiceMeshOptions = {
  roomId: string;
  userId: string;
  localStream: MediaStream;
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onError?: (error: Error) => void;
  onScreenShareEnded?: () => void;
};

export class FirebaseVoiceMesh {
  private readonly peers = new Map<string, RTCPeerConnection>();
  private readonly screenSenders = new Map<string, RTCRtpSender>();
  private readonly pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private readonly remoteStreams = new Map<string, MediaStream>();
  private readonly options: VoiceMeshOptions;
  private screenStream: MediaStream | null = null;

  constructor(options: VoiceMeshOptions) { this.options = options; }

  private createPeer(peerId: string, initiator: boolean): RTCPeerConnection {
    const existing = this.peers.get(peerId);
    if (existing) return existing;
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    this.options.localStream.getAudioTracks().forEach((track) => peer.addTrack(track, this.options.localStream));
    const screenTransceiver = peer.addTransceiver("video", { direction: "sendrecv" });
    this.screenSenders.set(peerId, screenTransceiver.sender);
    peer.ontrack = (event) => {
      const stream = event.streams[0] ?? this.remoteStreams.get(peerId) ?? new MediaStream();
      if (!event.streams[0] && !stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
      this.remoteStreams.set(peerId, stream);
      this.options.onRemoteStream(peerId, stream);
    };
    peer.onicecandidate = (event) => {
      if (event.candidate) void publishSignal(this.options.roomId, { from: this.options.userId, to: peerId, kind: "ice", payload: JSON.stringify({ candidate: event.candidate.toJSON() }) });
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(peer.connectionState)) {
        this.peers.delete(peerId);
        this.screenSenders.delete(peerId);
        this.pendingCandidates.delete(peerId);
        this.remoteStreams.delete(peerId);
      }
    };
    this.peers.set(peerId, peer);
    if (initiator) void this.createOffer(peerId, peer);
    return peer;
  }

  private async createOffer(peerId: string, peer: RTCPeerConnection): Promise<void> {
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await publishSignal(this.options.roomId, { from: this.options.userId, to: peerId, kind: "offer", payload: JSON.stringify({ sdp: offer }) });
    } catch (reason) { this.options.onError?.(reason instanceof Error ? reason : new Error("Não foi possível iniciar a conexão de voz.")); }
  }

  async syncMembers(members: FirebaseVoiceMember[]): Promise<void> {
    const others = members.filter((member) => member.uid !== this.options.userId);
    for (const member of others) this.createPeer(member.uid, this.options.userId < member.uid);
    for (const [peerId, peer] of Array.from(this.peers.entries())) if (!others.some((member) => member.uid === peerId)) { peer.close(); this.peers.delete(peerId); this.screenSenders.delete(peerId); this.pendingCandidates.delete(peerId); this.remoteStreams.delete(peerId); }
  }

  private async flushPendingCandidates(peerId: string, peer: RTCPeerConnection): Promise<void> {
    if (!peer.remoteDescription) return;
    const candidates = this.pendingCandidates.get(peerId) ?? [];
    this.pendingCandidates.delete(peerId);
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  }

  async handleSignal(signal: FirebaseSignal): Promise<void> {
    if (signal.to !== this.options.userId || signal.from === this.options.userId) return;
    const payload = JSON.parse(signal.payload) as SignalPayload;
    const peer = this.createPeer(signal.from, false);
    try {
      if (signal.kind === "offer" && payload.sdp) {
        await peer.setRemoteDescription(payload.sdp);
        await this.flushPendingCandidates(signal.from, peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await publishSignal(this.options.roomId, { from: this.options.userId, to: signal.from, kind: "answer", payload: JSON.stringify({ sdp: answer }) });
      } else if (signal.kind === "answer" && payload.sdp) {
        await peer.setRemoteDescription(payload.sdp);
        await this.flushPendingCandidates(signal.from, peer);
      } else if (signal.kind === "ice" && payload.candidate) {
        if (!peer.remoteDescription) this.pendingCandidates.set(signal.from, [...(this.pendingCandidates.get(signal.from) ?? []), payload.candidate]);
        else await peer.addIceCandidate(payload.candidate);
      }
    } catch (reason) { this.options.onError?.(reason instanceof Error ? reason : new Error("Não foi possível sincronizar a chamada de voz.")); }
  }

  async shareScreen(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Este navegador não permite compartilhamento de tela.");
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const screenTrack = this.screenStream.getVideoTracks()[0];
    for (const [peerId, peer] of Array.from(this.peers.entries())) {
      const sender = this.screenSenders.get(peerId);
      if (sender) await sender.replaceTrack(screenTrack);
      else { const transceiver = peer.addTransceiver("video", { direction: "sendrecv" }); this.screenSenders.set(peerId, transceiver.sender); await transceiver.sender.replaceTrack(screenTrack); }
    }
    screenTrack.addEventListener("ended", () => this.stopScreen());
    return this.screenStream;
  }

  stopScreen(): void {
    const hadScreen = Boolean(this.screenStream);
    this.screenStream?.getTracks().forEach((track) => track.stop());
    for (const sender of Array.from(this.screenSenders.values())) void sender.replaceTrack(null).catch(() => undefined);
    this.screenStream = null;
    if (hadScreen) this.options.onScreenShareEnded?.();
  }

  dispose(): void {
    this.stopScreen();
    for (const peer of Array.from(this.peers.values())) peer.close();
    this.peers.clear();
    this.screenSenders.clear();
    this.pendingCandidates.clear();
    this.remoteStreams.clear();
    this.options.localStream.getTracks().forEach((track) => track.stop());
  }
}
