export type VoiceParticipantEvent = "join" | "leave";

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
