import type { FirebaseSignal, FirebaseVoiceMember } from "@/services/firebaseStore";
import { publishSignal } from "@/services/firebaseSignaling";

type SignalPayload = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

export type VoicePeerQuality = { ping: number | null; packetLoss: number | null; level: "excellent" | "good" | "fair" | "poor" | "unknown"; state: RTCPeerConnectionState };

type VoiceMeshOptions = {
  roomId: string;
  userId: string;
  sessionId?: string;
  localStream: MediaStream;
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onRemoteStreamEnded?: (peerId: string) => void;
  onRemoteScreenStream?: (peerId: string, stream: MediaStream) => void;
  onRemoteScreenEnded?: (peerId: string) => void;
  onPeerQuality?: (peerId: string, quality: VoicePeerQuality) => void;
  onError?: (error: Error) => void;
  onScreenShareEnded?: () => void;
};

export class FirebaseVoiceMesh {
  private readonly peers = new Map<string, RTCPeerConnection>();
  private readonly peerSessionIds = new Map<string, string>();
  private readonly screenSenders = new Map<string, RTCRtpSender>();
  private readonly screenAudioSenders = new Map<string, RTCRtpSender>();
  private readonly pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private readonly handledSignalIds = new Set<string>();
  private readonly qualityTimers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly previousStats = new Map<string, { timestamp: number; packetsLost: number; packetsReceived: number }>();
  private readonly remoteCallStreams = new Map<string, MediaStream>();
  private readonly remoteCallTracks = new Map<string, Map<string, MediaStreamTrack>>();
  private readonly remoteCallStreamIds = new Map<string, string>();
  private readonly remoteScreenTracks = new Map<string, Map<string, MediaStreamTrack>>();
  private readonly remoteScreenStreams = new Map<string, MediaStream>();
  private readonly offerQueues = new Map<string, Promise<void>>();
  private readonly options: VoiceMeshOptions;
  private readonly sessionId: string;
  private localStream: MediaStream;
  private screenStream: MediaStream | null = null;
  private stoppingScreen = false;

  constructor(options: VoiceMeshOptions) { this.options = options; this.sessionId = options.sessionId ?? "legacy"; this.localStream = options.localStream; }

  private reportError(reason: unknown, fallback: string): void {
    this.options.onError?.(reason instanceof Error ? reason : new Error(fallback));
  }

  private async measurePeerQuality(peerId: string, peer: RTCPeerConnection): Promise<void> {
    try {
      const reports = await peer.getStats();
      let ping: number | null = null;
      let remoteRoundTripTime: number | null = null;
      let packetsLost = 0;
      let packetsReceived = 0;
      reports.forEach((rawReport) => {
        const report = rawReport as Record<string, unknown>;
        if (report.type === "candidate-pair" && (report.state === "succeeded" || report.nominated === true) && typeof report.currentRoundTripTime === "number") ping = Math.round(report.currentRoundTripTime * 1000);
        if (report.type === "remote-inbound-rtp" && typeof report.roundTripTime === "number") remoteRoundTripTime = report.roundTripTime;
        if (report.type === "inbound-rtp" && (report.kind === "audio" || report.mediaType === "audio" || report.kind === "video" || report.mediaType === "video")) {
          packetsLost += typeof report.packetsLost === "number" ? report.packetsLost : 0;
          packetsReceived += typeof report.packetsReceived === "number" ? report.packetsReceived : 0;
        }
      });
      const previous = this.previousStats.get(peerId);
      const lostDelta = previous ? Math.max(0, packetsLost - previous.packetsLost) : 0;
      const receivedDelta = previous ? Math.max(0, packetsReceived - previous.packetsReceived) : 0;
      const totalDelta = lostDelta + receivedDelta;
      const packetLoss = totalDelta > 0 ? Math.round((lostDelta / totalDelta) * 1000) / 10 : null;
      this.previousStats.set(peerId, { timestamp: Date.now(), packetsLost, packetsReceived });
      const effectivePing = ping ?? (remoteRoundTripTime === null ? null : Math.round(remoteRoundTripTime * 1000));
      const loss = packetLoss ?? 0;
      const level = effectivePing === null ? "unknown" : effectivePing <= 80 && loss <= 1 ? "excellent" : effectivePing <= 160 && loss <= 3 ? "good" : effectivePing <= 300 && loss <= 8 ? "fair" : "poor";
      this.options.onPeerQuality?.(peerId, { ping: effectivePing, packetLoss, level, state: peer.connectionState });
    } catch (reason) {
      this.options.onPeerQuality?.(peerId, { ping: null, packetLoss: null, level: "unknown", state: peer.connectionState });
    }
  }

  private startPeerQualityMonitor(peerId: string, peer: RTCPeerConnection): void {
    const timer = setInterval(() => void this.measurePeerQuality(peerId, peer), 3000);
    this.qualityTimers.set(peerId, timer);
    void this.measurePeerQuality(peerId, peer);
  }

  private stopPeerQualityMonitor(peerId: string): void {
    const timer = this.qualityTimers.get(peerId);
    if (timer) clearInterval(timer);
    this.qualityTimers.delete(peerId);
    this.previousStats.delete(peerId);
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

  private closePeer(peerId: string, peer = this.peers.get(peerId)): void {
    if (this.peers.get(peerId) === peer) this.peers.delete(peerId);
    this.peerSessionIds.delete(peerId);
    this.offerQueues.delete(peerId);
    this.screenSenders.delete(peerId);
    this.screenAudioSenders.delete(peerId);
    this.pendingCandidates.delete(peerId);
    this.stopPeerQualityMonitor(peerId);
    const hadCallStream = this.remoteCallStreams.delete(peerId) || this.remoteCallStreamIds.delete(peerId) || this.remoteCallTracks.delete(peerId);
    if (hadCallStream) this.options.onRemoteStreamEnded?.(peerId);
    else this.remoteCallStreamIds.delete(peerId);
    this.clearRemoteScreen(peerId);
    if (peer && peer.connectionState !== "closed") peer.close();
  }

  private handleRemoteTrack(peerId: string, event: RTCTrackEvent): void {
    const eventStream = event.streams[0];
    const eventStreamId = eventStream?.id;
    const callStreamId = this.remoteCallStreamIds.get(peerId);
    const isScreenAudio = event.track.kind === "audio" && Boolean(eventStreamId && callStreamId && eventStreamId !== callStreamId);
    const isScreenTrack = event.track.kind === "video" || isScreenAudio;

    if (!isScreenTrack) {
      // Some browsers emit RTCTrackEvent with an empty streams array for a
      // recvonly/renegotiated audio track. Keep a per-peer audio stream so a
      // later track event cannot replace the first participant's audio.
      if (eventStream && !callStreamId) this.remoteCallStreamIds.set(peerId, eventStreamId ?? "");
      const tracks = this.remoteCallTracks.get(peerId) ?? new Map<string, MediaStreamTrack>();
      tracks.set(event.track.id, event.track);
      this.remoteCallTracks.set(peerId, tracks);
      const existing = this.remoteCallStreams.get(peerId);
      if (!existing && eventStream) {
        this.notifyCallStream(peerId, eventStream);
        return;
      }
      const stream = existing ?? new MediaStream([event.track]);
      if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
      this.notifyCallStream(peerId, stream);
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
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }], iceCandidatePoolSize: 10 });
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = true;
      peer.addTrack(track, this.localStream);
    });
    const screenTransceiver = peer.addTransceiver("video", { direction: "sendrecv" });
    this.screenSenders.set(peerId, screenTransceiver.sender);
    peer.ontrack = (event) => this.handleRemoteTrack(peerId, event);
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      void publishSignal(this.options.roomId, { from: this.options.userId, to: peerId, sessionId: this.sessionId, targetSessionId: this.peerSessionIds.get(peerId), kind: "ice", payload: JSON.stringify({ candidate: event.candidate.toJSON() }) }).catch((reason) => this.reportError(reason, "Não foi possível enviar a sinalização de voz."));
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(peer.connectionState) && this.peers.get(peerId) === peer) this.closePeer(peerId, peer);
    };
    this.peers.set(peerId, peer);
    this.startPeerQualityMonitor(peerId, peer);
    if (initiator) void this.createOffer(peerId, peer);
    return peer;
  }

  private async waitForStable(peer: RTCPeerConnection): Promise<void> {
    if (peer.signalingState === "stable" || typeof peer.signalingState === "undefined") return;
    await new Promise<void>((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        peer.removeEventListener("signalingstatechange", onStateChange);
        resolve();
      };
      const onStateChange = () => {
        if (peer.signalingState === "stable" || peer.signalingState === "closed") finish();
      };
      peer.addEventListener("signalingstatechange", onStateChange);
      timeout = setTimeout(finish, 10_000);
      onStateChange();
    });
  }

  private createOffer(peerId: string, peer: RTCPeerConnection): Promise<void> {
    const previous = this.offerQueues.get(peerId) ?? Promise.resolve();
    const next = previous.then(async () => {
      try {
        if (peer.signalingState === "closed" || peer.connectionState === "closed") return;
        await this.waitForStable(peer);
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await publishSignal(this.options.roomId, { from: this.options.userId, to: peerId, sessionId: this.sessionId, targetSessionId: this.peerSessionIds.get(peerId), kind: "offer", payload: JSON.stringify({ sdp: offer }) });
      } catch (reason) { this.reportError(reason, "Não foi possível iniciar a conexão de voz."); }
    });
    this.offerQueues.set(peerId, next);
    return next;
  }

  async syncMembers(members: FirebaseVoiceMember[]): Promise<void> {
    const others = members.filter((member) => member.uid !== this.options.userId);
    for (const member of others) {
      const nextSessionId = member.sessionId ?? "";
      const previousSessionId = this.peerSessionIds.get(member.uid);
      if (previousSessionId && nextSessionId && previousSessionId !== nextSessionId) this.closePeer(member.uid);
      this.peerSessionIds.set(member.uid, nextSessionId);
      this.createPeer(member.uid, this.options.userId < member.uid);
    }
    for (const [peerId, peer] of Array.from(this.peers.entries())) if (!others.some((member) => member.uid === peerId)) this.closePeer(peerId, peer);
  }

  private async flushPendingCandidates(peerId: string, peer: RTCPeerConnection): Promise<void> {
    if (!peer.remoteDescription) return;
    const candidates = this.pendingCandidates.get(peerId) ?? [];
    this.pendingCandidates.delete(peerId);
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  }

  async handleSignal(signal: FirebaseSignal): Promise<void> {
    if (signal.to !== this.options.userId || signal.from === this.options.userId || (signal.targetSessionId && signal.targetSessionId !== this.sessionId) || this.handledSignalIds.has(signal.id)) return;
    const knownSessionId = this.peerSessionIds.get(signal.from);
    if (knownSessionId && signal.sessionId && knownSessionId !== signal.sessionId) return;
    const payload = JSON.parse(signal.payload) as SignalPayload;
    if (signal.sessionId) this.peerSessionIds.set(signal.from, signal.sessionId);
    const peer = this.createPeer(signal.from, false);
    try {
      if (signal.kind === "offer" && payload.sdp) {
        if (peer.signalingState === "have-local-offer") await peer.setLocalDescription({ type: "rollback" });
        await peer.setRemoteDescription(payload.sdp);
        await this.flushPendingCandidates(signal.from, peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await publishSignal(this.options.roomId, { from: this.options.userId, to: signal.from, sessionId: this.sessionId, targetSessionId: signal.sessionId, kind: "answer", payload: JSON.stringify({ sdp: answer }) });
      } else if (signal.kind === "answer" && payload.sdp) {
        if (peer.signalingState !== "have-local-offer") return;
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
      this.handledSignalIds.add(signal.id);
    } catch (reason) { this.reportError(reason instanceof Error ? reason : new Error("Não foi possível sincronizar a chamada de voz."), "Não foi possível sincronizar a chamada de voz."); }
  }

  async replaceMicrophone(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    const audioTrack = stream.getAudioTracks()[0] ?? null;
    if (!audioTrack) throw new Error("Nenhum microfone ativo foi encontrado.");
    audioTrack.enabled = true;
    for (const [peerId, peer] of Array.from(this.peers.entries())) {
      const sender = peer.getSenders().find((candidate: RTCRtpSender) => candidate.track?.kind === "audio");
      if (sender) await sender.replaceTrack(audioTrack);
      else {
        peer.addTrack(audioTrack, stream);
        await this.createOffer(peerId, peer);
      }
    }
  }

  async shareScreen(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Este navegador não permite compartilhamento de tela.");
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const screenTrack = stream.getVideoTracks()[0];
    if (!screenTrack) throw new Error("Nenhuma tela foi selecionada.");
    try {
      for (const [peerId, peer] of Array.from(this.peers.entries())) {
        const sender = this.screenSenders.get(peerId);
        if (sender) {
          await sender.replaceTrack(screenTrack);
          sender.setStreams?.(stream);
        } else {
          const transceiver = peer.addTransceiver("video", { direction: "sendrecv" });
          this.screenSenders.set(peerId, transceiver.sender);
          await transceiver.sender.replaceTrack(screenTrack);
          transceiver.sender.setStreams?.(stream);
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
      sessionId: this.sessionId,
      targetSessionId: this.peerSessionIds.get(target),
      kind: "screen-close",
      payload: JSON.stringify({ ownerId, reason: "closed-by-participant" }),
    })));
    if (peerId) this.clearRemoteScreen(peerId);
  }

  dispose(): void {
    void this.stopScreen();
    for (const peer of Array.from(this.peers.values())) peer.close();
    this.peers.clear();
    this.peerSessionIds.clear();
    this.offerQueues.clear();
    this.screenSenders.clear();
    this.screenAudioSenders.clear();
    this.pendingCandidates.clear();
    this.handledSignalIds.clear();
    for (const peerId of Array.from(this.qualityTimers.keys())) this.stopPeerQualityMonitor(peerId);
    this.remoteCallStreams.clear();
    this.remoteCallTracks.clear();
    this.remoteCallStreamIds.clear();
    this.remoteScreenTracks.clear();
    this.remoteScreenStreams.clear();
    this.localStream.getTracks().forEach((track) => track.stop());
  }
}
