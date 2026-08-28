import type { FirebaseSignal, FirebaseVoiceMember } from "@/services/firebaseStore";
import { publishSignal } from "@/services/firebaseSignaling";

type SignalPayload = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

type VoiceMeshOptions = {
  roomId: string;
  userId: string;
  localStream: MediaStream;
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onRemoteScreenStream?: (peerId: string, stream: MediaStream) => void;
  onRemoteScreenEnded?: (peerId: string) => void;
  onError?: (error: Error) => void;
  onScreenShareEnded?: () => void;
};

export class FirebaseVoiceMesh {
  private readonly peers = new Map<string, RTCPeerConnection>();
  private readonly screenSenders = new Map<string, RTCRtpSender>();
  private readonly screenAudioSenders = new Map<string, RTCRtpSender>();
  private readonly pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private readonly remoteCallStreams = new Map<string, MediaStream>();
  private readonly remoteCallStreamIds = new Map<string, string>();
  private readonly remoteScreenTracks = new Map<string, Map<string, MediaStreamTrack>>();
  private readonly remoteScreenStreams = new Map<string, MediaStream>();
  private readonly options: VoiceMeshOptions;
  private screenStream: MediaStream | null = null;
  private stoppingScreen = false;

  constructor(options: VoiceMeshOptions) { this.options = options; }

  private reportError(reason: unknown, fallback: string): void {
    this.options.onError?.(reason instanceof Error ? reason : new Error(fallback));
  }

  private notifyCallStream(peerId: string, stream: MediaStream): void {
    this.remoteCallStreams.set(peerId, stream);
    this.options.onRemoteStream(peerId, stream);
  }

  private notifyScreenStream(peerId: string): void {
    const tracks = Array.from(this.remoteScreenTracks.get(peerId)?.values() ?? []);
    if (!tracks.length) return;
    const stream = new MediaStream(tracks);
    this.remoteScreenStreams.set(peerId, stream);
    this.options.onRemoteScreenStream?.(peerId, stream);
  }

  private clearRemoteScreen(peerId: string): void {
    const hadScreen = this.remoteScreenTracks.has(peerId) || this.remoteScreenStreams.has(peerId);
    this.remoteScreenTracks.delete(peerId);
    this.remoteScreenStreams.delete(peerId);
    if (hadScreen) this.options.onRemoteScreenEnded?.(peerId);
  }

  private handleRemoteTrack(peerId: string, event: RTCTrackEvent): void {
    const eventStream = event.streams[0];
    const eventStreamId = eventStream?.id;
    const callStreamId = this.remoteCallStreamIds.get(peerId);
    const isScreenAudio = event.track.kind === "audio" && Boolean(eventStreamId && callStreamId && eventStreamId !== callStreamId);
    const isScreenTrack = event.track.kind === "video" || isScreenAudio;

    if (!isScreenTrack) {
      if (eventStream && !callStreamId) this.remoteCallStreamIds.set(peerId, eventStreamId ?? "");
      const existing = this.remoteCallStreams.get(peerId);
      if (existing && !eventStream && !existing.getTracks().some((track) => track.id === event.track.id)) existing.addTrack(event.track);
      this.notifyCallStream(peerId, eventStream ?? existing ?? new MediaStream([event.track]));
      return;
    }

    const tracks = this.remoteScreenTracks.get(peerId) ?? new Map<string, MediaStreamTrack>();
    tracks.set(event.track.id, event.track);
    this.remoteScreenTracks.set(peerId, tracks);
    this.notifyScreenStream(peerId);
    if (event.track.kind === "video") {
      event.track.addEventListener("ended", () => {
        this.remoteScreenTracks.delete(peerId);
        this.remoteScreenStreams.delete(peerId);
        this.options.onRemoteScreenEnded?.(peerId);
      }, { once: true });
    }
  }

  private createPeer(peerId: string, initiator: boolean): RTCPeerConnection {
    const existing = this.peers.get(peerId);
    if (existing) return existing;
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    this.options.localStream.getAudioTracks().forEach((track) => peer.addTrack(track, this.options.localStream));
    const screenTransceiver = peer.addTransceiver("video", { direction: "sendrecv" });
    this.screenSenders.set(peerId, screenTransceiver.sender);
    peer.ontrack = (event) => this.handleRemoteTrack(peerId, event);
    peer.onicecandidate = (event) => {
      if (event.candidate) void publishSignal(this.options.roomId, { from: this.options.userId, to: peerId, kind: "ice", payload: JSON.stringify({ candidate: event.candidate.toJSON() }) });
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(peer.connectionState)) {
        this.peers.delete(peerId);
        this.screenSenders.delete(peerId);
        this.screenAudioSenders.delete(peerId);
        this.pendingCandidates.delete(peerId);
        this.remoteCallStreams.delete(peerId);
        this.remoteCallStreamIds.delete(peerId);
        this.clearRemoteScreen(peerId);
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
    } catch (reason) { this.reportError(reason, "Não foi possível iniciar a conexão de voz."); }
  }

  async syncMembers(members: FirebaseVoiceMember[]): Promise<void> {
    const others = members.filter((member) => member.uid !== this.options.userId);
    for (const member of others) this.createPeer(member.uid, this.options.userId < member.uid);
    for (const [peerId, peer] of Array.from(this.peers.entries())) if (!others.some((member) => member.uid === peerId)) {
      peer.close();
      this.peers.delete(peerId);
      this.screenSenders.delete(peerId);
      this.screenAudioSenders.delete(peerId);
      this.pendingCandidates.delete(peerId);
      this.remoteCallStreams.delete(peerId);
      this.remoteCallStreamIds.delete(peerId);
      this.clearRemoteScreen(peerId);
    }
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
      } else if (signal.kind === "screen-close") {
        const ownerId = (JSON.parse(signal.payload) as { ownerId?: string }).ownerId ?? signal.from;
        if (ownerId === this.options.userId && this.screenStream) await this.closeScreenForEveryone();
        else this.clearRemoteScreen(ownerId);
      }
    } catch (reason) { this.reportError(reason instanceof Error ? reason : new Error("Não foi possível sincronizar a chamada de voz."), "Não foi possível sincronizar a chamada de voz."); }
  }

  async shareScreen(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Este navegador não permite compartilhamento de tela.");
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const screenTrack = stream.getVideoTracks()[0];
    if (!screenTrack) throw new Error("Nenhuma tela foi selecionada.");
    try {
      for (const [peerId, peer] of Array.from(this.peers.entries())) {
        const sender = this.screenSenders.get(peerId);
        if (sender) await sender.replaceTrack(screenTrack);
        else {
          const transceiver = peer.addTransceiver("video", { direction: "sendrecv" });
          this.screenSenders.set(peerId, transceiver.sender);
          await transceiver.sender.replaceTrack(screenTrack);
        }
        const screenAudioTrack = stream.getAudioTracks?.()[0];
        if (screenAudioTrack) this.screenAudioSenders.set(peerId, peer.addTrack(screenAudioTrack, stream));
      }
      this.screenStream = stream;
      screenTrack.addEventListener("ended", () => { void this.stopScreen(); }, { once: true });
      await Promise.all(Array.from(this.peers.entries()).map(([peerId, peer]) => this.createOffer(peerId, peer)));
      return stream;
    } catch (reason) {
      stream.getTracks().forEach((track) => track.stop());
      this.reportError(reason, "Não foi possível compartilhar a tela.");
      throw reason;
    }
  }

  async stopScreen(): Promise<void> {
    if (this.stoppingScreen) return;
    const stream = this.screenStream;
    if (!stream && !this.screenAudioSenders.size) return;
    this.stoppingScreen = true;
    this.screenStream = null;
    stream?.getTracks().forEach((track) => { if (track.readyState !== "ended") track.stop(); });
    for (const [peerId, peer] of Array.from(this.peers.entries())) {
      const sender = this.screenSenders.get(peerId);
      if (sender) await sender.replaceTrack(null);
      const audioSender = this.screenAudioSenders.get(peerId);
      if (audioSender?.track) await audioSender.replaceTrack(null);
      this.screenAudioSenders.delete(peerId);
      await this.createOffer(peerId, peer);
    }
    this.options.onScreenShareEnded?.();
    this.stoppingScreen = false;
  }

  async closeScreenForEveryone(peerId?: string): Promise<void> {
    const ownerId = this.screenStream ? this.options.userId : peerId;
    if (!ownerId) return;
    if (ownerId === this.options.userId && this.screenStream) await this.stopScreen();
    const targets = peerId ? [peerId] : Array.from(this.peers.keys());
    await Promise.all(targets.map((target) => publishSignal(this.options.roomId, {
      from: this.options.userId,
      to: target,
      kind: "screen-close",
      payload: JSON.stringify({ ownerId, reason: "closed-by-participant" }),
    })));
    if (peerId) this.clearRemoteScreen(peerId);
  }

  dispose(): void {
    void this.stopScreen();
    for (const peer of Array.from(this.peers.values())) peer.close();
    this.peers.clear();
    this.screenSenders.clear();
    this.screenAudioSenders.clear();
    this.pendingCandidates.clear();
    this.remoteCallStreams.clear();
    this.remoteCallStreamIds.clear();
    this.remoteScreenTracks.clear();
    this.remoteScreenStreams.clear();
    this.options.localStream.getTracks().forEach((track) => track.stop());
  }
}
