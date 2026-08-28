import type { FirebaseSignal } from "@/services/firebaseStore";
import { publishDirectCallSignal } from "@/services/firebaseStore";

type DirectCallOptions = {
  callId: string;
  userId: string;
  localStream: MediaStream;
  onRemoteStream: (stream: MediaStream) => void;
  onError?: (error: Error) => void;
};

/**
 * WebRTC adapter for one-to-one calls signaled through Firestore.
 *
 * The adapter deliberately keeps ICE candidates until the remote description
 * exists. Firestore and WebRTC are asynchronous independently, so a candidate
 * can arrive before the offer/answer and must not be discarded.
 */
export class FirebaseDirectCall {
  private readonly options: DirectCallOptions;
  private peer: RTCPeerConnection | null = null;
  private remoteStream: MediaStream | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionReady = false;

  constructor(options: DirectCallOptions) {
    this.options = options;
  }

  private reportError(reason: unknown, fallback: string): void {
    this.options.onError?.(reason instanceof Error ? reason : new Error(fallback));
  }

  private emitRemoteTrack(event: RTCTrackEvent): void {
    const stream = event.streams[0] ?? this.remoteStream ?? new MediaStream();
    this.remoteStream = stream;
    if (!event.streams[0] && !stream.getTracks().some((track) => track.id === event.track.id)) {
      stream.addTrack(event.track);
    }
    this.options.onRemoteStream(stream);
  }

  private async flushPendingCandidates(peer: RTCPeerConnection): Promise<void> {
    if (!this.remoteDescriptionReady || !this.pendingCandidates.length) return;
    const candidates = this.pendingCandidates.splice(0);
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  }

  private ensurePeer(peerId: string): RTCPeerConnection {
    if (this.peer) return this.peer;

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      iceCandidatePoolSize: 10,
    });
    this.options.localStream.getTracks().forEach((track) => peer.addTrack(track, this.options.localStream));
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
      if (["failed", "closed"].includes(peer.connectionState)) {
        this.reportError(new Error("A conexão da chamada foi encerrada."), "A conexão da chamada foi encerrada.");
      }
    };
    this.peer = peer;
    return peer;
  }

  async start(peerId: string): Promise<void> {
    const peer = this.ensurePeer(peerId);
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await publishDirectCallSignal(this.options.callId, {
        from: this.options.userId,
        to: peerId,
        kind: "offer",
        payload: JSON.stringify({ sdp: offer }),
      });
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

  stop(): void {
    this.peer?.close();
    this.peer = null;
    this.remoteStream = null;
    this.pendingCandidates = [];
    this.remoteDescriptionReady = false;
  }
}
