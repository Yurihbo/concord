import type { FirebaseSignal } from "@/services/firebaseStore";
import { publishDirectCallSignal } from "@/services/firebaseStore";

type DirectCallOptions = {
  callId: string;
  userId: string;
  media: "audio" | "screen";
  localStream: MediaStream;
  onRemoteStream: (stream: MediaStream) => void;
  onRemoteScreenStream?: (stream: MediaStream) => void;
  onScreenShareEnded?: () => void;
  onRemoteScreenEnded?: () => void;
  onError?: (error: Error) => void;
};

/**
 * WebRTC adapter for one-to-one calls signaled through Firestore.
 * Call audio and screen audio are kept in different remote MediaStreams so
 * the viewer can adjust the screen volume without changing the call volume.
 */
export class FirebaseDirectCall {
  private readonly options: DirectCallOptions;
  private localStream: MediaStream;
  private peer: RTCPeerConnection | null = null;
  private peerId: string | null = null;
  private videoSender: RTCRtpSender | null = null;
  private screenAudioSender: RTCRtpSender | null = null;
  private videoTransceiver: RTCRtpTransceiver | null = null;
  private remoteSourceTracks = new Map<string, Map<string, MediaStreamTrack>>();
  private remoteScreenSourceIds = new Set<string>();
  private remoteScreenStreams = new Map<string, MediaStream>();
  private remoteCallSourceId: string | null = null;
  private remoteCallStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private stoppingScreen = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionReady = false;
  private offerQueue = Promise.resolve();
  private signalQueue = Promise.resolve();

  constructor(options: DirectCallOptions) {
    this.options = options;
    this.localStream = options.localStream;
    if (options.media === "screen") options.localStream.getVideoTracks()[0]?.addEventListener("ended", () => { void this.stopScreenShare(); }, { once: true });
  }

  private reportError(reason: unknown, fallback: string): void {
    this.options.onError?.(reason instanceof Error ? reason : new Error(fallback));
  }

  private rebuildRemoteStreams(): void {
    const callTracks = Array.from(this.remoteSourceTracks.entries()).filter(([sourceId]) => !this.remoteScreenSourceIds.has(sourceId)).flatMap(([, tracks]) => Array.from(tracks.values()).filter((track) => track.kind === "audio"));
    if (callTracks.length || !this.remoteCallStream) {
      const callStream = new MediaStream(callTracks);
      this.remoteCallStream = callStream;
      this.options.onRemoteStream(callStream);
    } else {
      this.options.onRemoteStream(this.remoteCallStream);
    }

    for (const sourceId of Array.from(this.remoteScreenSourceIds)) {
      const tracks = Array.from(this.remoteSourceTracks.get(sourceId)?.values() ?? []);
      if (!tracks.length) continue;
      const screenStream = new MediaStream(tracks);
      this.remoteScreenStreams.set(sourceId, screenStream);
      this.options.onRemoteScreenStream?.(screenStream);
    }
  }

  private emitRemoteTrack(event: RTCTrackEvent): void {
    const eventStream = event.streams[0];
    const incomingSourceId = eventStream?.id ?? `track-source-${event.track.id}`;
    let sourceId = incomingSourceId;

    if (event.track.kind === "video") {
      const pendingScreenSource = Array.from(this.remoteScreenSourceIds).find((candidate) => !(this.remoteSourceTracks.get(candidate)?.has("video")));
      sourceId = pendingScreenSource ?? incomingSourceId;
      this.remoteScreenSourceIds.add(sourceId);
      if (this.remoteCallStream === eventStream) this.remoteCallStream = null;
    } else if (this.remoteScreenSourceIds.size) {
      const screenSourceWithVideo = Array.from(this.remoteScreenSourceIds).find((candidate) => Array.from(this.remoteSourceTracks.get(candidate)?.values() ?? []).some((track) => track.kind === "video"));
      if (screenSourceWithVideo && screenSourceWithVideo !== incomingSourceId) sourceId = screenSourceWithVideo;
      else if (!this.remoteScreenSourceIds.has(incomingSourceId) && this.remoteCallSourceId === null) this.remoteCallSourceId = incomingSourceId;
    } else if (this.remoteCallSourceId === null) {
      this.remoteCallSourceId = incomingSourceId;
    } else if (incomingSourceId !== this.remoteCallSourceId) {
      this.remoteScreenSourceIds.add(incomingSourceId);
    }

    const sourceTracks = this.remoteSourceTracks.get(sourceId) ?? new Map<string, MediaStreamTrack>();
    sourceTracks.set(event.track.id, event.track);
    this.remoteSourceTracks.set(sourceId, sourceTracks);
    if (sourceId !== incomingSourceId && !eventStream) this.remoteSourceTracks.delete(incomingSourceId);

    if (event.track.kind !== "video" && eventStream && sourceId === this.remoteCallSourceId) {
      this.remoteCallStream = eventStream;
      this.options.onRemoteStream(eventStream);
      return;
    }
    this.rebuildRemoteStreams();

    if (event.track.kind === "video") {
      event.track.addEventListener("ended", () => {
        const tracks = this.remoteSourceTracks.get(sourceId);
        tracks?.delete(event.track.id);
        if (!tracks?.size) {
          this.remoteSourceTracks.delete(sourceId);
          this.remoteScreenSourceIds.delete(sourceId);
          this.remoteScreenStreams.delete(sourceId);
        }
        this.rebuildRemoteStreams();
        this.options.onRemoteScreenEnded?.();
      }, { once: true });
    }
  }

  private async flushPendingCandidates(peer: RTCPeerConnection): Promise<void> {
    if (!this.remoteDescriptionReady || !this.pendingCandidates.length) return;
    const candidates = this.pendingCandidates.splice(0);
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  }

  private clearRemoteScreen(): void {
    const hadScreen = this.remoteScreenSourceIds.size > 0;
    for (const sourceId of Array.from(this.remoteScreenSourceIds)) {
      this.remoteSourceTracks.delete(sourceId);
      this.remoteScreenStreams.delete(sourceId);
    }
    this.remoteScreenSourceIds.clear();
    this.rebuildRemoteStreams();
    if (hadScreen) this.options.onRemoteScreenEnded?.();
  }

  private async waitForStable(peer: RTCPeerConnection): Promise<void> {
    if (peer.signalingState === "stable" || typeof peer.signalingState === "undefined") return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        peer.removeEventListener("signalingstatechange", onStateChange);
        resolve();
      };
      const onStateChange = () => {
        if (peer.signalingState === "stable" || peer.signalingState === "closed") finish();
      };
      peer.addEventListener("signalingstatechange", onStateChange);
      globalThis.setTimeout(finish, 10_000);
      onStateChange();
    });
  }

  private publishOffer(peer: RTCPeerConnection, peerId: string): Promise<void> {
    const next = this.offerQueue.then(async () => {
      if (peer.signalingState === "closed" || peer.connectionState === "closed") return;
      await this.waitForStable(peer);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await publishDirectCallSignal(this.options.callId, {
        from: this.options.userId,
        to: peerId,
        kind: "offer",
        payload: JSON.stringify({ sdp: offer }),
      });
    });
    this.offerQueue = next.catch(() => undefined);
    return next;
  }

  private ensurePeer(peerId: string): RTCPeerConnection {
    if (this.peer) {
      this.peerId ??= peerId;
      return this.peer;
    }

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      iceCandidatePoolSize: 10,
    });
    this.peerId = peerId;
    this.localStream.getTracks().forEach((track) => peer.addTrack(track, this.localStream));
    this.videoSender = peer.getSenders().find((sender) => sender.track?.kind === "video") ?? null;
    this.videoTransceiver = peer.getTransceivers().find((transceiver) => transceiver.sender === this.videoSender) ?? null;
    if (this.options.media === "screen" && !this.videoSender) {
      this.videoTransceiver = peer.addTransceiver("video", { direction: "recvonly" });
      this.videoSender = this.videoTransceiver.sender;
    }
    peer.ontrack = (event) => this.emitRemoteTrack(event);
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      void publishDirectCallSignal(this.options.callId, {
        from: this.options.userId,
        to: peerId,
        kind: "ice",
        payload: JSON.stringify({ candidate: event.candidate.toJSON() }),
      }).catch((reason) => this.reportError(reason, "Não foi possível enviar a sinalização da chamada."));
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(peer.connectionState)) this.reportError(new Error("A conexão da chamada foi encerrada."), "A conexão da chamada foi encerrada.");
    };
    this.peer = peer;
    return peer;
  }

  async start(peerId: string): Promise<void> {
    const peer = this.ensurePeer(peerId);
    try {
      await this.publishOffer(peer, peerId);
    } catch (reason) {
      this.reportError(reason, "Não foi possível iniciar a chamada.");
      throw reason;
    }
  }

  async handleSignal(signal: FirebaseSignal): Promise<void> {
    const next = this.signalQueue.then(() => this.processSignal(signal));
    this.signalQueue = next.catch(() => undefined);
    return next;
  }

  private async processSignal(signal: FirebaseSignal): Promise<void> {
    const payload = JSON.parse(signal.payload) as { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    const peer = this.ensurePeer(signal.from);
    try {
      if (signal.kind === "offer" && payload.sdp) {
        if (peer.signalingState === "have-local-offer") await peer.setLocalDescription({ type: "rollback" });
        if (payload.sdp.sdp?.includes("m=video") && !this.videoTransceiver) {
          this.videoTransceiver = peer.addTransceiver("video", { direction: "recvonly" });
          this.videoSender = this.videoTransceiver.sender;
        }
        await peer.setRemoteDescription(payload.sdp);
        this.remoteDescriptionReady = true;
        await this.flushPendingCandidates(peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await publishDirectCallSignal(this.options.callId, {
          from: this.options.userId,
          to: signal.from,
          kind: "answer",
          payload: JSON.stringify({ sdp: answer }),
        });
      } else if (signal.kind === "answer" && payload.sdp) {
        await peer.setRemoteDescription(payload.sdp);
        this.remoteDescriptionReady = true;
        await this.flushPendingCandidates(peer);
      } else if (signal.kind === "ice" && payload.candidate) {
        if (!this.remoteDescriptionReady || !peer.remoteDescription) this.pendingCandidates.push(payload.candidate);
        else await peer.addIceCandidate(payload.candidate);
      } else if (signal.kind === "screen-close") {
        if (this.screenStream || this.videoSender?.track?.kind === "video" || this.screenAudioSender?.track) await this.stopScreenShare();
        this.clearRemoteScreen();
      }
    } catch (reason) {
      this.reportError(reason, "Não foi possível sincronizar a chamada individual.");
      throw reason;
    }
  }

  async replaceMicrophone(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    const audioTrack = stream.getAudioTracks()[0] ?? null;
    if (!this.peer) return;
    const sender = this.peer.getSenders().find((candidate) => candidate.track?.kind === "audio");
    if (sender) await sender.replaceTrack(audioTrack);
    else if (audioTrack) this.peer.addTrack(audioTrack, stream);
  }

  async shareScreen(): Promise<MediaStream> {
    if (!this.peer || !this.peerId) throw new Error("A chamada ainda não está conectada.");
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Este navegador não permite compartilhamento de tela.");
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const screenTrack = stream.getVideoTracks()[0];
    if (!screenTrack) throw new Error("Nenhuma tela foi selecionada.");
    try {
      if (!this.videoTransceiver) this.videoTransceiver = this.peer.addTransceiver("video", { direction: "sendrecv" });
      this.videoTransceiver.direction = "sendrecv";
      this.videoSender = this.videoTransceiver.sender;
      await this.videoSender.replaceTrack(screenTrack);
      const screenAudioTrack = stream.getAudioTracks?.()[0];
      if (screenAudioTrack) this.screenAudioSender = this.peer.addTrack(screenAudioTrack, stream);
      this.screenStream = stream;
      screenTrack.addEventListener("ended", () => { void this.stopScreenShare(); }, { once: true });
      await this.publishOffer(this.peer, this.peerId);
      return stream;
    } catch (reason) {
      stream.getTracks().forEach((track) => track.stop());
      this.reportError(reason, "Não foi possível compartilhar a tela.");
      throw reason;
    }
  }

  async closeScreenForEveryone(): Promise<void> {
    if (this.screenStream || this.videoSender?.track?.kind === "video" || this.screenAudioSender?.track) await this.stopScreenShare();
    this.clearRemoteScreen();
    if (this.peerId) await publishDirectCallSignal(this.options.callId, {
      from: this.options.userId,
      to: this.peerId,
      kind: "screen-close",
      payload: JSON.stringify({ reason: "closed-by-participant" }),
    });
  }

  async stopScreenShare(): Promise<void> {
    if (this.stoppingScreen) return;
    const stream = this.screenStream;
    const videoSender = this.videoSender;
    const screenAudioSender = this.screenAudioSender;
    if (!stream && videoSender?.track?.kind !== "video" && !screenAudioSender?.track) return;
    this.stoppingScreen = true;
    this.screenStream = null;
    stream?.getTracks().forEach((track) => { if (track.readyState !== "ended") track.stop(); });
    if (videoSender?.track?.kind === "video") {
      if (!stream && videoSender.track.readyState !== "ended") videoSender.track.stop();
      await videoSender.replaceTrack(null);
    }
    if (screenAudioSender?.track) await screenAudioSender.replaceTrack(null);
    this.screenAudioSender = null;
    if (this.peer && this.peerId && this.peer.connectionState !== "closed") await this.publishOffer(this.peer, this.peerId).catch((reason) => this.reportError(reason, "Não foi possível encerrar o compartilhamento da tela."));
    this.options.onScreenShareEnded?.();
    this.stoppingScreen = false;
  }

  stop(): void {
    this.stoppingScreen = true;
    const screenStream = this.screenStream;
    this.screenStream = null;
    screenStream?.getTracks().forEach((track) => { if (track.readyState !== "ended") track.stop(); });
    this.peer?.close();
    this.peer = null;
    this.peerId = null;
    this.videoSender = null;
    this.screenAudioSender = null;
    this.videoTransceiver = null;
    this.remoteSourceTracks.clear();
    this.remoteScreenSourceIds.clear();
    this.remoteScreenStreams.clear();
    this.remoteCallStream = null;
    this.remoteCallSourceId = null;
    this.pendingCandidates = [];
    this.remoteDescriptionReady = false;
    this.offerQueue = Promise.resolve();
    this.signalQueue = Promise.resolve();
    this.stoppingScreen = false;
  }
}
