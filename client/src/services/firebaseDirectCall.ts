import type { FirebaseSignal } from "@/services/firebaseStore";
import { publishDirectCallSignal } from "@/services/firebaseStore";

type DirectCallOptions = {
  callId: string;
  userId: string;
  media: "audio" | "screen";
  localStream: MediaStream;
  onRemoteStream: (stream: MediaStream) => void;
  onScreenShareEnded?: () => void;
  onRemoteScreenEnded?: () => void;
  onError?: (error: Error) => void;
};

/**
 * WebRTC adapter for one-to-one calls signaled through Firestore.
 *
 * Audio calls can be upgraded to screen sharing without creating another call.
 * The upgrade is a normal WebRTC renegotiation: the sender adds a video track,
 * publishes a new offer, and the other participant answers it.
 */
export class FirebaseDirectCall {
  private readonly options: DirectCallOptions;
  private peer: RTCPeerConnection | null = null;
  private peerId: string | null = null;
  private videoSender: RTCRtpSender | null = null;
  private videoTransceiver: RTCRtpTransceiver | null = null;
  private remoteStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private stoppingScreen = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionReady = false;

  constructor(options: DirectCallOptions) {
    this.options = options;
    if (options.media === "screen") options.localStream.getVideoTracks()[0]?.addEventListener("ended", () => { void this.stopScreenShare(); }, { once: true });
  }

  private reportError(reason: unknown, fallback: string): void {
    this.options.onError?.(reason instanceof Error ? reason : new Error(fallback));
  }

  private emitRemoteTrack(event: RTCTrackEvent): void {
    const stream = event.streams[0] ?? this.remoteStream ?? new MediaStream();
    this.remoteStream = stream;
    if (!event.streams[0] && !stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
    this.options.onRemoteStream(stream);

    if (event.track.kind === "video") {
      event.track.addEventListener("ended", () => {
        if (this.remoteStream === stream) {
          stream.removeTrack(event.track);
          this.options.onRemoteStream(stream);
        }
        this.options.onRemoteScreenEnded?.();
      }, { once: true });
    }
  }

  private async flushPendingCandidates(peer: RTCPeerConnection): Promise<void> {
    if (!this.remoteDescriptionReady || !this.pendingCandidates.length) return;
    const candidates = this.pendingCandidates.splice(0);
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  }

  private async publishOffer(peer: RTCPeerConnection, peerId: string): Promise<void> {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await publishDirectCallSignal(this.options.callId, {
      from: this.options.userId,
      to: peerId,
      kind: "offer",
      payload: JSON.stringify({ sdp: offer }),
    });
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
    this.options.localStream.getTracks().forEach((track) => peer.addTrack(track, this.options.localStream));
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
    const payload = JSON.parse(signal.payload) as { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    const peer = this.ensurePeer(signal.from);
    try {
      if (signal.kind === "offer" && payload.sdp) {
        if (payload.sdp.sdp?.includes("m=video") && !this.videoSender) {
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
      }
    } catch (reason) {
      this.reportError(reason, "Não foi possível sincronizar a chamada individual.");
      throw reason;
    }
  }

  async shareScreen(): Promise<MediaStream> {
    if (!this.peer || !this.peerId) throw new Error("A chamada ainda não está conectada.");
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Este navegador não permite compartilhamento de tela.");
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const screenTrack = stream.getVideoTracks()[0];
    if (!screenTrack) throw new Error("Nenhuma tela foi selecionada.");
    try {
      if (!this.videoTransceiver) this.videoTransceiver = this.peer.addTransceiver("video", { direction: "sendrecv" });
      this.videoTransceiver.direction = "sendrecv";
      this.videoSender = this.videoTransceiver.sender;
      await this.videoSender.replaceTrack(screenTrack);
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

  async stopScreenShare(): Promise<void> {
    if (this.stoppingScreen) return;
    const stream = this.screenStream;
    const sender = this.videoSender;
    if (!stream && sender?.track?.kind !== "video") return;
    this.stoppingScreen = true;
    this.screenStream = null;
    stream?.getTracks().forEach((track) => { if (track.readyState !== "ended") track.stop(); });
    if (sender?.track?.kind === "video") {
      const track = sender.track;
      if (!stream && track.readyState !== "ended") track.stop();
      await sender.replaceTrack(null);
    }
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
    this.videoTransceiver = null;
    this.remoteStream = null;
    this.pendingCandidates = [];
    this.remoteDescriptionReady = false;
    this.stoppingScreen = false;
  }
}
