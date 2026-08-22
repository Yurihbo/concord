import type { FirebaseSignal } from "@/services/firebaseStore";
import { publishDirectCallSignal } from "@/services/firebaseStore";

type DirectCallOptions = { callId: string; userId: string; localStream: MediaStream; onRemoteStream: (stream: MediaStream) => void; onError?: (error: Error) => void };

export class FirebaseDirectCall {
  private readonly options: DirectCallOptions;
  private peer: RTCPeerConnection | null = null;

  constructor(options: DirectCallOptions) { this.options = options; }

  private ensurePeer(peerId: string): RTCPeerConnection {
    if (this.peer) return this.peer;
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    this.options.localStream.getTracks().forEach((track) => peer.addTrack(track, this.options.localStream));
    peer.ontrack = (event) => this.options.onRemoteStream(event.streams[0] ?? new MediaStream([event.track]));
    peer.onicecandidate = (event) => { if (event.candidate) void publishDirectCallSignal(this.options.callId, { from: this.options.userId, to: peerId, kind: "ice", payload: JSON.stringify({ candidate: event.candidate.toJSON() }) }).catch((reason) => this.options.onError?.(reason instanceof Error ? reason : new Error("Não foi possível enviar a sinalização da chamada."))); };
    peer.onconnectionstatechange = () => { if (["failed", "closed"].includes(peer.connectionState)) this.options.onError?.(new Error("A conexão da chamada foi encerrada.")); };
    this.peer = peer;
    return peer;
  }

  async start(peerId: string): Promise<void> {
    const peer = this.ensurePeer(peerId);
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await publishDirectCallSignal(this.options.callId, { from: this.options.userId, to: peerId, kind: "offer", payload: JSON.stringify({ sdp: offer }) });
    } catch (reason) { this.options.onError?.(reason instanceof Error ? reason : new Error("Não foi possível iniciar a chamada.")); }
  }

  async handleSignal(signal: FirebaseSignal): Promise<void> {
    const payload = JSON.parse(signal.payload) as { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    const peer = this.ensurePeer(signal.from);
    try {
      if (signal.kind === "offer" && payload.sdp) { await peer.setRemoteDescription(payload.sdp); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); await publishDirectCallSignal(this.options.callId, { from: this.options.userId, to: signal.from, kind: "answer", payload: JSON.stringify({ sdp: answer }) }); }
      else if (signal.kind === "answer" && payload.sdp) await peer.setRemoteDescription(payload.sdp);
      else if (signal.kind === "ice" && payload.candidate) await peer.addIceCandidate(payload.candidate);
    } catch (reason) { this.options.onError?.(reason instanceof Error ? reason : new Error("Não foi possível sincronizar a chamada individual.")); }
  }

  stop(): void { this.peer?.close(); this.peer = null; }
}
