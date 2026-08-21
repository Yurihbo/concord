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
  private readonly options: VoiceMeshOptions;
  private screenStream: MediaStream | null = null;

  constructor(options: VoiceMeshOptions) { this.options = options; }

  private createPeer(peerId: string, initiator: boolean): RTCPeerConnection {
    const existing = this.peers.get(peerId);
    if (existing) return existing;
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    this.options.localStream.getTracks().forEach((track) => peer.addTrack(track, this.options.localStream));
    peer.ontrack = (event) => this.options.onRemoteStream(peerId, event.streams[0] ?? new MediaStream([event.track]));
    peer.onicecandidate = (event) => {
      if (event.candidate) void publishSignal(this.options.roomId, { from: this.options.userId, to: peerId, kind: "ice", payload: JSON.stringify({ candidate: event.candidate.toJSON() }) });
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(peer.connectionState)) this.peers.delete(peerId);
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
    for (const [peerId, peer] of Array.from(this.peers.entries())) if (!others.some((member) => member.uid === peerId)) { peer.close(); this.peers.delete(peerId); }
  }

  async handleSignal(signal: FirebaseSignal): Promise<void> {
    if (signal.to !== this.options.userId || signal.from === this.options.userId) return;
    const payload = JSON.parse(signal.payload) as SignalPayload;
    const peer = this.createPeer(signal.from, signal.kind !== "answer");
    try {
      if (signal.kind === "offer" && payload.sdp) {
        await peer.setRemoteDescription(payload.sdp);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await publishSignal(this.options.roomId, { from: this.options.userId, to: signal.from, kind: "answer", payload: JSON.stringify({ sdp: answer }) });
      } else if (signal.kind === "answer" && payload.sdp) {
        await peer.setRemoteDescription(payload.sdp);
      } else if (signal.kind === "ice" && payload.candidate) {
        await peer.addIceCandidate(payload.candidate);
      }
    } catch (reason) { this.options.onError?.(reason instanceof Error ? reason : new Error("Não foi possível sincronizar a chamada de voz.")); }
  }

  async shareScreen(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Este navegador não permite compartilhamento de tela.");
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const screenTrack = this.screenStream.getVideoTracks()[0];
    for (const peer of Array.from(this.peers.values())) {
      const sender = peer.getSenders().find((item: RTCRtpSender) => item.track?.kind === "video");
      if (sender) await sender.replaceTrack(screenTrack);
      else peer.addTrack(screenTrack, this.screenStream);
    }
    screenTrack.addEventListener("ended", () => this.stopScreen());
    return this.screenStream;
  }

  stopScreen(): void {
    const hadScreen = Boolean(this.screenStream);
    this.screenStream?.getTracks().forEach((track) => track.stop());
    this.screenStream = null;
    if (hadScreen) this.options.onScreenShareEnded?.();
  }

  dispose(): void {
    this.stopScreen();
    for (const peer of Array.from(this.peers.values())) peer.close();
    this.peers.clear();
    this.options.localStream.getTracks().forEach((track) => track.stop());
  }
}
