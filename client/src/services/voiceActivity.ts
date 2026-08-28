export type VoiceParticipantEvent = "join" | "leave";
export type VoiceToneKind = VoiceParticipantEvent | "mute" | "unmute";

type SpatialAudioContext = Pick<AudioContext, "currentTime" | "createOscillator" | "createGain" | "destination"> & {
  createStereoPanner?: () => StereoPannerNode;
};

export function getVoiceToneProfile(kind: VoiceToneKind): readonly [number, number, number] {
  return ({ join: [660, 880, 0.16], leave: [420, 280, 0.18], mute: [360, 240, 0.12], unmute: [520, 760, 0.14] } as const)[kind];
}

export function playVoiceToneOnContext(context: SpatialAudioContext, kind: VoiceToneKind, pan = 0): void {
  const [startFrequency, endFrequency, duration] = getVoiceToneProfile(kind);
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime;
  const safePan = Math.max(-1, Math.min(1, pan));
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(startFrequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(0.045, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration + 0.04);
  oscillator.connect(gain);

  const panner = context.createStereoPanner?.();
  if (panner) {
    panner.pan.setValueAtTime(Math.max(-1, safePan - 0.16), start);
    panner.pan.linearRampToValueAtTime(Math.min(1, safePan + 0.16), start + duration);
    gain.connect(panner);
    panner.connect(context.destination);
  } else {
    gain.connect(context.destination);
  }

  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

export function playVoiceTone(kind: VoiceToneKind, pan = 0): void {
  if (typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const play = () => {
    playVoiceToneOnContext(context, kind, pan);
    const duration = getVoiceToneProfile(kind)[2];
    window.setTimeout(() => { void context.close().catch(() => undefined); }, Math.ceil((duration + 0.15) * 1000));
  };
  void context.resume().then(play, play);
}

export function startDirectCallRingtone(): () => void {
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return () => undefined;
  const context = new AudioContextClass();
  const playBurst = () => {
    void context.resume().catch(() => undefined).finally(() => {
      playVoiceToneOnContext(context, "join", 0.12);
      window.setTimeout(() => playVoiceToneOnContext(context, "join", -0.12), 240);
    });
  };
  playBurst();
  const timer = window.setInterval(playBurst, 2600);
  return () => {
    window.clearInterval(timer);
    void context.close().catch(() => undefined);
  };
}

export function getVoiceParticipantEvents<T>(previousIds: ReadonlySet<T> | null, currentIds: ReadonlySet<T>): VoiceParticipantEvent[] {
  if (!previousIds) return [];
  const events: VoiceParticipantEvent[] = [];
  if (Array.from(currentIds).some((id) => !previousIds.has(id))) events.push("join");
  if (Array.from(previousIds).some((id) => !currentIds.has(id))) events.push("leave");
  return events;
}

export function getVoiceSwitchResetChannel(activeChannelId: number | null, nextChannelId: number): number | null {
  return activeChannelId !== null && activeChannelId !== nextChannelId ? activeChannelId : null;
}
