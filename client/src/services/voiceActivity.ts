export type VoiceParticipantEvent = "join" | "leave";
export type VoiceToneKind = VoiceParticipantEvent | "mute" | "unmute";

export function getVoiceToneProfile(kind: VoiceToneKind): readonly [number, number, number] {
  return ({ join: [660, 880, 0.16], leave: [420, 280, 0.18], mute: [360, 240, 0.12], unmute: [520, 760, 0.14] } as const)[kind];
}

export function playVoiceToneOnContext(context: Pick<AudioContext, "currentTime" | "createOscillator" | "createGain" | "destination">, kind: VoiceToneKind): void {
  const [startFrequency, endFrequency, duration] = getVoiceToneProfile(kind);
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(startFrequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(0.045, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration + 0.04);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

export function startDirectCallRingtone(): () => void {
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return () => undefined;
  const context = new AudioContextClass();
  const playBurst = () => {
    void context.resume().catch(() => undefined).finally(() => {
      playVoiceToneOnContext(context, "join");
      window.setTimeout(() => playVoiceToneOnContext(context, "join"), 240);
    });
  };
  playBurst();
  const timer = window.setInterval(playBurst, 2600);
  return () => {
    window.clearInterval(timer);
    void context.close().catch(() => undefined);
  };
}

export function getVoiceParticipantEvents(previousIds: ReadonlySet<number> | null, currentIds: ReadonlySet<number>): VoiceParticipantEvent[] {
  if (!previousIds) return [];
  const events: VoiceParticipantEvent[] = [];
  if (Array.from(currentIds).some((id) => !previousIds.has(id))) events.push("join");
  if (Array.from(previousIds).some((id) => !currentIds.has(id))) events.push("leave");
  return events;
}

export function getVoiceSwitchResetChannel(activeChannelId: number | null, nextChannelId: number): number | null {
  return activeChannelId !== null && activeChannelId !== nextChannelId ? activeChannelId : null;
}
