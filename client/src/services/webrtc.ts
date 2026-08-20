export type MediaCaptureOptions = { audio?: boolean; video?: boolean };
export type CallState = "idle" | "requesting" | "connected" | "sharing" | "error";

export async function listAudioDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  return (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput");
}

export class ConcordWebRTCService {
  private peer: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private state: CallState = "idle";
  private onStateChange?: (state: CallState) => void;

  setStateListener(listener: (state: CallState) => void): void { this.onStateChange = listener; }
  getState(): CallState { return this.state; }
  private updateState(state: CallState): void { this.state = state; this.onStateChange?.(state); }

  async captureMicrophone(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador não permite acesso ao microfone.");
    this.updateState("requesting");
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.updateState("connected");
      return this.localStream;
    } catch (error) { this.updateState("error"); throw error; }
  }

  async shareScreen(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Compartilhamento de tela não é suportado neste navegador.");
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    this.updateState("sharing");
    return this.screenStream;
  }

  createPeer(onTrack: (event: RTCTrackEvent) => void): RTCPeerConnection {
    this.peer?.close();
    this.peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    this.peer.ontrack = onTrack;
    return this.peer;
  }

  async createOffer(): Promise<string> {
    if (!this.peer) throw new Error("A conexão WebRTC ainda não foi criada.");
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    return JSON.stringify(offer);
  }

  async applyAnswer(payload: string): Promise<void> {
    if (!this.peer) throw new Error("A conexão WebRTC ainda não foi criada.");
    await this.peer.setRemoteDescription(JSON.parse(payload) as RTCSessionDescriptionInit);
  }

  async applyOffer(payload: string): Promise<string> {
    if (!this.peer) throw new Error("A conexão WebRTC ainda não foi criada.");
    await this.peer.setRemoteDescription(JSON.parse(payload) as RTCSessionDescriptionInit);
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    return JSON.stringify(answer);
  }

  async addIceCandidate(payload: string): Promise<void> {
    if (!this.peer) throw new Error("A conexão WebRTC ainda não foi criada.");
    await this.peer.addIceCandidate(JSON.parse(payload) as RTCIceCandidateInit);
  }

  onIceCandidate(callback: (payload: string) => void): void {
    if (!this.peer) throw new Error("A conexão WebRTC ainda não foi criada.");
    this.peer.onicecandidate = (event) => { if (event.candidate) callback(JSON.stringify(event.candidate)); };
  }

  addLocalTracks(): void {
    if (!this.peer) throw new Error("A conexão WebRTC ainda não foi criada.");
    for (const stream of [this.localStream, this.screenStream]) stream?.getTracks().forEach((track) => this.peer?.addTrack(track, stream));
  }

  toggleMicrophone(enabled: boolean): void { this.localStream?.getAudioTracks().forEach((track) => { track.enabled = enabled; }); }

  stopScreenShare(): void {
    this.screenStream?.getTracks().forEach((track) => track.stop());
    this.screenStream = null;
    this.updateState(this.localStream ? "connected" : "idle");
  }

  dispose(): void {
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.screenStream?.getTracks().forEach((track) => track.stop());
    this.peer?.close();
    this.peer = null;
    this.localStream = null;
    this.screenStream = null;
    this.updateState("idle");
  }
}
