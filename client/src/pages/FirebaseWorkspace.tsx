import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Bell, ChevronDown, Compass, GripVertical, Hash, Headphones, Home as HomeIcon, LogOut, MessageCircle, Mic, MoreHorizontal, PhoneOff, Plus, Radio, Search, Send, Settings, Signal, Sparkles, Upload, UserPlus, Users, Video, Volume2, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FirebaseAuthPanel } from "@/components/FirebaseAuthPanel";
import { ConcordWebRTCService } from "@/services/webrtc";
import { FirebaseVoiceMesh } from "@/services/firebaseVoiceMesh";
import { FirebaseDirectCall } from "@/services/firebaseDirectCall";
import { getVoiceParticipantEvents, playVoiceTone, startDirectCallRingtone } from "@/services/voiceActivity";
import { subscribeToSignals } from "@/services/firebaseSignaling";
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";
import { hasFirebaseConfig, missingFirebaseConfigKeys } from "@/lib/firebase";
import {
  createCommunity,
  createFriendRequest,
  createVoiceRoom,
  countVoiceMembers,
  getProfile,
  getProfiles,
  subscribeToProfiles,
  createDirectCall,
  updateDirectCall,
  subscribeToDirectCalls,
  subscribeToDirectCall,
  subscribeToDirectCallSignals,
  setPresence,
  deleteDirectConversation,
  listCommunities,
  listCommunityChannels,
  listFriendships,
  respondToFriendRequest,
  subscribeToFriendships,
  listVoiceRooms,
  removeVoiceMember,
  subscribeToVoiceRooms,
  saveProfile,
  uploadProfileAvatar,
  searchProfilesByPublicId,
  sendChannelMessage,
  sendDirectMessage,
  subscribeToDirectMessages,
  setVoiceSpeaking,
  subscribeToChannelMessages,
  subscribeToVoiceMembers,
  subscribeToCommunityInvites,
  createCommunityInvite,
  respondToCommunityInvite,
  upsertVoiceMember,
  waitForOfflineMessages,
  type FirebaseChannel,
  type FirebaseCommunity,
  type FirebaseFriendship,
  type FirebaseMessage,
  type FirebaseProfile,
  type FirebaseVoiceMember,
  type FirebaseVoiceRoom,
  type FirebaseCommunityInvite,
} from "@/services/firebaseStore";

function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "CO"; }
function hasVideoTrack(stream: MediaStream | null): stream is MediaStream { return Boolean(stream?.getVideoTracks().length); }
function currentUserId(user: { uid: string } | null): string { return user?.uid ?? ""; }

type PeerQuality = { ping: number | null; level: "excellent" | "good" | "fair" | "poor" | "unknown"; packetLoss: number | null; state: RTCPeerConnectionState };

function qualityLabel(quality: PeerQuality | undefined): string {
  if (!quality || quality.level === "unknown") return "Conectando";
  if (quality.level === "excellent") return "Excelente";
  if (quality.level === "good") return "Boa";
  if (quality.level === "fair") return "Instável";
  return "Fraca";
}

async function captureDirectStream(media: "audio" | "screen"): Promise<MediaStream> {
  if (media === "audio") return navigator.mediaDevices.getUserMedia({ audio: true });
  const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  try {
    const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
    return new MediaStream([...microphone.getAudioTracks(), ...screen.getTracks()]);
  } catch (error) {
    screen.getTracks().forEach((track) => track.stop());
    throw error;
  }
}

type CreationDialogProps = { target: "community" | "room"; value: string; error: string; pending: boolean; onChange: (value: string) => void; onClose: () => void; onSubmit: () => void };

function CreationDialog({ target, value, error, pending, onChange, onClose, onSubmit }: CreationDialogProps) {
  const title = target === "community" ? "Criar comunidade" : "Adicionar sala de voz";
  const label = target === "community" ? "Nome da comunidade" : "Nome da sala";
  return <div className="firebase-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="firebase-dialog" role="dialog" aria-modal="true" aria-labelledby="firebase-dialog-title"><span className="firebase-kicker">CONCORD / NOVO ESPAÇO</span><h2 id="firebase-dialog-title">{title}</h2><p>{target === "community" ? "Organize seus canais e convide pessoas para conversar." : "Crie salas de voz para chamadas em grupo com até oito participantes."}</p><label htmlFor="firebase-creation-name">{label}<Input id="firebase-creation-name" autoFocus value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSubmit(); if (event.key === "Escape") onClose(); }} placeholder={target === "community" ? "Ex.: Equipe Concord" : "Ex.: Estúdio aberto"} /></label>{error && <div className="firebase-auth-error" role="alert">{error}</div>}<div className="firebase-dialog-actions"><Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button><Button className="primary-cta" onClick={onSubmit} disabled={pending || !value.trim()}>{pending ? "Salvando..." : target === "community" ? "Criar comunidade" : "Criar sala"}</Button></div></section></div>;
}

type SocialDialogProps = { currentPublicId: string; searchValue: string; results: FirebaseProfile[]; friendships: FirebaseFriendship[]; invites: FirebaseCommunityInvite[]; currentUid: string; community: FirebaseCommunity | null; onSearchValueChange: (value: string) => void; onSearch: () => void; onAddFriend: (target: FirebaseProfile) => void; onInvite: (targetUid: string) => void; onRespondInvite: (invite: FirebaseCommunityInvite, status: "accepted" | "declined") => void; onClose: () => void };

function SocialDialog({ currentPublicId, searchValue, results, friendships, invites, currentUid, community, onSearchValueChange, onSearch, onAddFriend, onInvite, onRespondInvite, onClose }: SocialDialogProps) {
  const accepted = friendships.filter((item) => item.status === "accepted");
  return <div className="firebase-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="firebase-dialog firebase-social-dialog" role="dialog" aria-modal="true" aria-labelledby="firebase-social-title"><span className="firebase-kicker">CONCORD / CONEXÕES</span><h2 id="firebase-social-title">Amigos e convites</h2><p>Seu código público: <strong>{currentPublicId}</strong> <button className="inline-copy" onClick={() => void navigator.clipboard?.writeText(currentPublicId)}>Copiar</button></p><div className="firebase-social-search"><Input value={searchValue} onChange={(event) => onSearchValueChange(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") onSearch(); }} placeholder="Cole um código CON-XXXXXXXX" /><Button className="primary-cta" onClick={onSearch}>Buscar</Button></div>{results.length > 0 && <div className="firebase-social-results">{results.map((target) => <div className="firebase-social-row" key={target.uid}><span><strong>{target.displayName}</strong><small>{target.publicId ?? target.uid}</small></span><Button onClick={() => onAddFriend(target)}>Adicionar</Button></div>)}</div>}{community && accepted.length > 0 && <div className="firebase-social-section"><span className="member-role">CONVIDAR PARA {community.name.toUpperCase()}</span>{accepted.map((friendship) => { const targetUid = friendship.requesterId === currentUid ? friendship.addresseeId : friendship.requesterId; return <div className="firebase-social-row" key={friendship.id}><span><strong>Conexão ativa</strong><small>{targetUid}</small></span><Button variant="outline" onClick={() => onInvite(targetUid)}>Convidar</Button></div>; })}</div>}{invites.filter((invite) => invite.status === "pending").length > 0 && <div className="firebase-social-section"><span className="member-role">CONVITES RECEBIDOS</span>{invites.filter((invite) => invite.status === "pending").map((invite) => <div className="firebase-social-row" key={invite.id}><span><strong>{invite.communityName ?? "Comunidade"}</strong><small>Convite para entrar</small></span><div><Button onClick={() => onRespondInvite(invite, "accepted")}>Aceitar</Button><Button variant="outline" onClick={() => onRespondInvite(invite, "declined")}>Recusar</Button></div></div>)}</div>}<div className="firebase-dialog-actions"><Button variant="outline" onClick={onClose}>Fechar</Button></div></section></div>;
}

type FriendsPanelProps = { currentUid: string; searchValue: string; results: FirebaseProfile[]; friendships: FirebaseFriendship[]; friendProfiles: Record<string, FirebaseProfile>; invites: FirebaseCommunityInvite[]; onSearchValueChange: (value: string) => void; onSearch: () => void; onAddFriend: (target: FirebaseProfile) => void; onOpenChat: (uid: string) => void; onRespondFriend: (request: FirebaseFriendship, status: "accepted" | "declined") => void; onRespondInvite: (invite: FirebaseCommunityInvite, status: "accepted" | "declined") => void };

function FriendsPanel({ currentUid, searchValue, results, friendships, friendProfiles, invites, onSearchValueChange, onSearch, onAddFriend, onOpenChat, onRespondFriend, onRespondInvite }: FriendsPanelProps) {
  const pending = friendships.filter((item) => item.status === "pending" && item.addresseeId === currentUid);
  const accepted = friendships.filter((item) => item.status === "accepted");
  return <section className="workspace-panel"><div className="workspace-panel-heading"><div><span className="firebase-kicker">CONCORD / SOCIAL</span><h1>Amigos</h1><p>Encontre pessoas pelo código público e gerencie suas conexões.</p></div><Users size={27} /></div><div className="friends-search-row"><Input value={searchValue} onChange={(event) => onSearchValueChange(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") onSearch(); }} placeholder="CON-XXXXXXXX" /><Button className="primary-cta" onClick={onSearch}>Buscar</Button></div>{results.length > 0 && <div className="friends-section"><h2>Resultados</h2>{results.map((target) => <div className="friends-list-row" key={target.uid}><div><strong>{target.displayName}</strong><small>{target.publicId ?? target.uid}</small></div><Button onClick={() => onAddFriend(target)}>Enviar solicitação</Button></div>)}</div>}<div className="friends-section"><h2>Solicitações recebidas <span>{pending.length}</span></h2>{pending.length ? pending.map((request) => <div className="friends-list-row" key={request.id}><div><strong>Nova solicitação</strong><small>{request.requesterId}</small></div><div className="friends-actions"><Button onClick={() => onRespondFriend(request, "accepted")}>Aceitar</Button><Button variant="outline" onClick={() => onRespondFriend(request, "declined")}>Recusar</Button></div></div>) : <p className="workspace-muted">Nenhuma solicitação pendente.</p>}</div><div className="friends-section"><h2>Amigos <span>{accepted.length}</span></h2>{accepted.length ? accepted.map((friendship) => <div className="friends-list-row" key={friendship.id}><div><strong>{friendProfiles[friendship.requesterId === currentUid ? friendship.addresseeId : friendship.requesterId]?.displayName ?? "Conexão"}</strong><small>{friendProfiles[friendship.requesterId === currentUid ? friendship.addresseeId : friendship.requesterId]?.publicId ?? "Código indisponível"}</small></div><div className="friends-actions"><span className={`presence-dot ${friendProfiles[friendship.requesterId === currentUid ? friendship.addresseeId : friendship.requesterId]?.presence ?? "offline"}`} title="Status" /><Button onClick={() => onOpenChat(friendship.requesterId === currentUid ? friendship.addresseeId : friendship.requesterId)}>Abrir conversa</Button></div></div>) : <p className="workspace-muted">Sua lista de amigos aparecerá aqui após o aceite.</p>}</div><div className="friends-section"><h2>Convites de comunidades <span>{invites.filter((invite) => invite.status === "pending").length}</span></h2>{invites.filter((invite) => invite.status === "pending").map((invite) => <div className="friends-list-row" key={invite.id}><div><strong>{invite.communityName ?? "Comunidade"}</strong><small>Convite recebido</small></div><div className="friends-actions"><Button onClick={() => onRespondInvite(invite, "accepted")}>Aceitar</Button><Button variant="outline" onClick={() => onRespondInvite(invite, "declined")}>Recusar</Button></div></div>)}</div></section>;
}

const presetAvatars = [
  { name: "Calic Fary", url: "/assets/calic-fary.png" },
  { name: "Draco Mage", url: "/assets/draco-mage.png" },
  { name: "Druid Elf", url: "/assets/druid-elf.png" },
  { name: "Human Mage", url: "/assets/human-mage.png" },
  { name: "Thief Khajit", url: "/assets/thief-khajit.png" },
  { name: "Warrior Orc", url: "/assets/warrior-orc.png" },
];

function ProfilePanel({ profile, email, onSave, onUpload }: { profile: FirebaseProfile | null; email: string; onSave: (displayName: string, avatarUrl: string) => void; onUpload: (file: File) => Promise<string> }) {
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? presetAvatars[0].url);
  useEffect(() => { setDisplayName(profile?.displayName ?? ""); }, [profile?.displayName]);
  useEffect(() => { if (profile?.avatarUrl) setAvatarUrl(profile.avatarUrl); }, [profile?.avatarUrl]);
  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setAvatarUrl(previewUrl);
    try {
      const uploadedUrl = await onUpload(file);
      setAvatarUrl(uploadedUrl);
      URL.revokeObjectURL(previewUrl);
    } catch {
      setAvatarUrl(profile?.avatarUrl ?? presetAvatars[0].url);
    }
    event.target.value = "";
  };
  return <section className="workspace-panel"><div className="workspace-panel-heading"><div><span className="firebase-kicker">CONCORD / PERFIL</span><h1>Seu perfil</h1><p>Personalize o nome e a imagem que aparecem para suas conexões.</p></div><Settings size={27} /></div><div className="profile-edit-card"><div className="profile-avatar-preview"><div className="profile-avatar-image">{avatarUrl ? <img src={avatarUrl} alt="Prévia do avatar" /> : <span>{initials(displayName || "Conta")}</span>}</div><div><strong>Imagem do perfil</strong><span>Escolha um avatar pronto ou envie sua própria imagem.</span></div></div><div className="profile-avatar-section"><span className="profile-field-label">Avatares prontos</span><div className="avatar-preset-grid">{presetAvatars.map((avatar) => <button type="button" className={avatarUrl === avatar.url ? "avatar-preset selected" : "avatar-preset"} key={avatar.url} onClick={() => setAvatarUrl(avatar.url)} aria-label={`Usar avatar ${avatar.name}`}><img src={avatar.url} alt={avatar.name} /></button>)}</div><label className="avatar-upload-button"><Upload size={15} /> Enviar imagem própria<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={chooseFile} /></label></div><label>Nome de exibição<Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} /></label><label>E-mail<Input value={email} readOnly /></label><div className="profile-code"><span>Seu código público</span><strong>{profile?.publicId ?? "CON-00000000"}</strong></div><Button className="primary-cta" onClick={() => onSave(displayName.trim(), avatarUrl)} disabled={!displayName.trim()}>Salvar perfil</Button></div></section>;
}

function SettingsPanel({ onVoiceSettings }: { onVoiceSettings: () => void }) {
  return <section className="workspace-panel"><div className="workspace-panel-heading"><div><span className="firebase-kicker">CONCORD / CONFIGURAÇÕES</span><h1>Configurações</h1><p>Controle seu perfil e sua experiência de voz.</p></div><Settings size={27} /></div><div className="settings-grid"><button className="settings-card" onClick={onVoiceSettings}><Mic size={19} /><span><strong>Configuração de voz</strong><small>Reabrir permissão do microfone e revisar o dispositivo de entrada.</small></span><ChevronDown size={16} /></button><div className="settings-card static"><UserPlus size={19} /><span><strong>Privacidade</strong><small>Suas solicitações usam somente o código público da conta.</small></span></div></div></section>;
}

function ScreenPreview({ stream, label = "Sua tela está sendo compartilhada", muted = true, volume = 1 }: { stream: MediaStream; label?: string; muted?: boolean; volume?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => { if (video.srcObject === stream) video.srcObject = null; };
  }, [stream]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = volume;
  }, [muted, volume]);
  return <div className="firebase-screen-preview" aria-label={label}><video ref={videoRef} muted={muted} playsInline autoPlay /><span><Video size={12} /> {label}</span></div>;
}

type ScreenViewMode = "mini" | "medium" | "full";

function DraggableScreenPanel({ stream, title, label, volume, muted = true, onVolumeChange, onClose }: { stream: MediaStream; title: string; label: string; volume?: number; muted?: boolean; onVolumeChange?: (value: number) => void; onClose?: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ScreenViewMode>("mini");
  const dragOffset = useRef({ x: 0, y: 0 });
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      const maxLeft = Math.max(12, window.innerWidth - panel.offsetWidth - 12);
      const maxTop = Math.max(12, window.innerHeight - panel.offsetHeight - 12);
      setPosition({
        left: Math.min(Math.max(12, event.clientX - dragOffset.current.x), maxLeft),
        top: Math.min(Math.max(12, event.clientY - dragOffset.current.y), maxTop),
      });
    };
    const stop = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
  }, [dragging]);

  const startDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (!panel) return;
    const bounds = panel.getBoundingClientRect();
    dragOffset.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    setPosition({ left: bounds.left, top: bounds.top });
    setDragging(true);
    event.preventDefault();
  };

  const modeLabels: Record<ScreenViewMode, string> = { mini: "Mini", medium: "Médio", full: "Tela cheia" };
  const panelStyle = viewMode === "full" ? { inset: 0, left: 0, top: 0, right: 0, bottom: 0 } : position ? { left: position.left, top: position.top, right: "auto" } : undefined;
  return <div ref={panelRef} className={`${dragging ? "direct-screen-float is-dragging" : "direct-screen-float"} direct-screen-view-${viewMode}`} style={panelStyle}><div className="direct-screen-float-bar" onPointerDown={startDragging}><div className="direct-screen-float-title"><GripVertical size={15} aria-hidden="true" /><span><strong>{title}</strong><small>{label}</small></span></div>{onClose && <button type="button" aria-label="Fechar compartilhamento de tela" onPointerDown={(event) => event.stopPropagation()} onClick={onClose}><X size={15} /></button>}</div><div className="direct-screen-view-controls" role="group" aria-label="Modo de visualização"><span>Visualização</span>{(Object.keys(modeLabels) as ScreenViewMode[]).map((mode) => <button key={mode} type="button" className={viewMode === mode ? "is-active" : ""} onPointerDown={(event) => event.stopPropagation()} onClick={() => setViewMode(mode)}>{modeLabels[mode]}</button>)}</div><ScreenPreview stream={stream} label={label} muted={muted} volume={volume ?? 1} />{onVolumeChange && <label className="direct-screen-volume"><Volume2 size={14} /><span>Volume da tela</span><input type="range" min="0" max="1" step="0.05" value={volume ?? 1} onChange={(event) => onVolumeChange(Number(event.target.value))} aria-label="Volume do áudio da tela compartilhada" /><output>{Math.round((volume ?? 1) * 100)}%</output></label>}</div>;
}

function RemoteAudio({ stream, peerId, unlockVersion, onBlocked }: { stream: MediaStream; peerId: string; unlockVersion: number; onBlocked: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = stream;
    void audio.play().catch(() => onBlocked());
    return () => { if (audio.srcObject === stream) audio.srcObject = null; };
  }, [stream, unlockVersion, onBlocked]);
  return <audio ref={audioRef} autoPlay playsInline aria-label={`Áudio de ${peerId}`} />;
}

function VoiceScreenPanel({ currentUid, members, screenStreams, viewers, onToggleViewer }: { currentUid: string; members: FirebaseVoiceMember[]; screenStreams: Record<string, MediaStream>; viewers: Set<string>; onToggleViewer: (peerId: string) => void }) {
  const broadcasters = members.filter((member) => member.screenSharing && member.uid !== currentUid);
  if (!broadcasters.length) return null;
  return <section className="voice-screen-panel" aria-label="Transmissões de tela"><div className="voice-screen-panel-heading"><div><span className="firebase-kicker">TRANSMISSÃO AO VIVO</span><strong>{broadcasters.length === 1 ? "Uma pessoa está compartilhando a tela" : `${broadcasters.length} pessoas estão compartilhando a tela`}</strong></div><Video size={18} /></div>{broadcasters.map((member) => { const viewing = viewers.has(member.uid); const hasStream = Boolean(screenStreams[member.uid]); return <article className="voice-screen-card" key={member.uid}><div className="voice-screen-card-heading"><div><strong>{member.displayName}</strong><small>{hasStream ? "Tela disponível no painel flutuante" : "Conectando à tela..."}</small></div><Button variant="outline" onClick={() => onToggleViewer(member.uid)}>{viewing ? "Ocultar tela" : "Exibir tela"}</Button></div></article>; })}</section>;
}

export default function FirebaseWorkspace() {
  const auth = useFirebaseAuth();
  const authUser = auth.user;
  const currentUserId = authUser?.uid ?? "";
  const [profile, setProfile] = useState<FirebaseProfile | null>(null);
  const [communities, setCommunities] = useState<FirebaseCommunity[]>([]);
  const [community, setCommunity] = useState<FirebaseCommunity | null>(null);
  const [channels, setChannels] = useState<FirebaseChannel[]>([]);
  const [channel, setChannel] = useState<FirebaseChannel | null>(null);
  const [messages, setMessages] = useState<FirebaseMessage[]>([]);
  const [channelUnread, setChannelUnread] = useState<Record<string, number>>({});
  const channelSeenMessageIds = useRef<Map<string, Set<string>>>(new Map());
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [voiceAudioBlocked, setVoiceAudioBlocked] = useState(false);
  const [voiceAudioUnlockVersion, setVoiceAudioUnlockVersion] = useState(0);
  const [rooms, setRooms] = useState<FirebaseVoiceRoom[]>([]);
  const [members, setMembers] = useState<FirebaseVoiceMember[]>([]);
  const voiceRosterIdsRef = useRef<Set<string> | null>(null);
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<FirebaseProfile[]>([]);
  const [friendships, setFriendships] = useState<FirebaseFriendship[]>([]);
  const [friendProfiles, setFriendProfiles] = useState<Record<string, FirebaseProfile>>({});
  const [invites, setInvites] = useState<FirebaseCommunityInvite[]>([]);
  const [socialOpen, setSocialOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"chat" | "friends" | "profile" | "settings">("chat");
  const [membersOpen, setMembersOpen] = useState(true);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [creationTarget, setCreationTarget] = useState<"community" | "room" | null>(null);
  const [creationName, setCreationName] = useState("");
  const [creationError, setCreationError] = useState("");
  const [creationPending, setCreationPending] = useState(false);
  const [voiceService] = useState(() => new ConcordWebRTCService());
  const [voiceRoomId, setVoiceRoomId] = useState<string | null>(null);
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const meshRef = useRef<FirebaseVoiceMesh | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Record<string, MediaStream>>({});
  const [peerQualities, setPeerQualities] = useState<Record<string, PeerQuality>>({});
  const [screenVolumes, setScreenVolumes] = useState<Record<string, number>>({});
  const [voiceStream, setVoiceStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenPreviewStream, setScreenPreviewStream] = useState<MediaStream | null>(null);
  const [screenViewerIds, setScreenViewerIds] = useState<Set<string>>(() => new Set());
  const previousScreenBroadcasters = useRef<Set<string>>(new Set());
  const leavingVoiceRef = useRef(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const speakingStateRef = useRef(false);
  const [directFriendId, setDirectFriendId] = useState<string | null>(null);
  const [directMessages, setDirectMessages] = useState<import("@/services/firebaseStore").FirebaseDirectMessage[]>([]);
  const [directBody, setDirectBody] = useState("");
  const [directCallId, setDirectCallId] = useState<string | null>(null);
  const [directCallStatus, setDirectCallStatus] = useState<"idle" | "ringing" | "connected" | "ended">("idle");
  const [directCallDirection, setDirectCallDirection] = useState<"incoming" | "outgoing" | null>(null);
  const [directCallMedia, setDirectCallMedia] = useState<"audio" | "screen">("audio");
  const [directLocalStream, setDirectLocalStream] = useState<MediaStream | null>(null);
  const [directScreenStream, setDirectScreenStream] = useState<MediaStream | null>(null);
  const [directScreenSharing, setDirectScreenSharing] = useState(false);
  const [directRemoteStream, setDirectRemoteStream] = useState<MediaStream | null>(null);
  const [directRemoteScreenStream, setDirectRemoteScreenStream] = useState<MediaStream | null>(null);
  const [directVolume, setDirectVolume] = useState(1);
  const [directScreenVolume, setDirectScreenVolume] = useState(1);
  const [directAudioBlocked, setDirectAudioBlocked] = useState(false);
  const directAudioRef = useRef<HTMLAudioElement>(null);
  const [pendingDirectSignals, setPendingDirectSignals] = useState<import("@/services/firebaseStore").FirebaseSignal[]>([]);
  const handledDirectSignalIds = useRef<Set<string>>(new Set());
  const directCallRef = useRef<FirebaseDirectCall | null>(null);
  const ringtoneStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!auth.user) return;
    let cancelled = false;
    void Promise.all([getProfile(auth.user.uid), listCommunities(auth.user.uid), listFriendships(auth.user.uid)]).then(([nextProfile, nextCommunities, nextFriendships]) => {
      if (cancelled) return;
      setProfile(nextProfile);
      setCommunities(nextCommunities);
      setFriendships(nextFriendships);
      setCommunity(nextCommunities[0] ?? null);
    }).catch((error) => setNotice(error instanceof Error ? error.message : "Não foi possível carregar seu espaço."));
    return () => { cancelled = true; };
  }, [auth.user]);

  useEffect(() => {
    if (!auth.user) return;
    return subscribeToFriendships(auth.user.uid, setFriendships, (error) => setNotice(error.message));
  }, [auth.user]);

  useEffect(() => {
    if (!auth.user) return;
    return subscribeToCommunityInvites(auth.user.uid, setInvites, (error) => setNotice(error.message));
  }, [auth.user]);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); setNotice("Conexão restaurada. Mensagens pendentes serão sincronizadas."); void waitForOfflineMessages().then(() => setNotice("Mensagens pendentes sincronizadas."), () => setNotice("A conexão voltou; algumas mensagens ainda estão sincronizando.")); };
    const handleOffline = () => { setIsOnline(false); setNotice("Você está offline. Mensagens de texto serão mantidas e sincronizadas quando a conexão voltar."); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, []);

  useEffect(() => {
    if (!community) return;
    void Promise.all([listCommunityChannels(community.id), listVoiceRooms(community.id)]).then(([nextChannels, nextRooms]) => {
      setChannels(nextChannels);
      setRooms(nextRooms);
      setChannel(nextChannels.find((item) => item.kind === "text") ?? nextChannels[0] ?? null);
    }).catch((error) => setNotice(error instanceof Error ? error.message : "Não foi possível carregar a comunidade."));
    return subscribeToVoiceRooms(community.id, setRooms, (error) => setNotice(error.message));
  }, [community]);

  useEffect(() => {
    if (!community || !channel || channel.kind !== "text" || directFriendId) return;
    const channelId = channel.id;
    return subscribeToChannelMessages(community.id, channelId, (nextMessages) => {
      setMessages(nextMessages);
      const existingSeen = channelSeenMessageIds.current.get(channelId);
      if (!existingSeen) {
        channelSeenMessageIds.current.set(channelId, new Set(nextMessages.map((message) => message.id)));
        return;
      }
      const freshMessages = nextMessages.filter((message) => !existingSeen.has(message.id));
      nextMessages.forEach((message) => existingSeen.add(message.id));
      const incoming = freshMessages.filter((message) => message.authorId !== currentUserId);
      if (!incoming.length) return;
      const channelIsVisible = activePanel === "chat" && channel?.id === channelId && document.visibilityState === "visible";
      if (channelIsVisible) {
        setChannelUnread((current) => current[channelId] ? { ...current, [channelId]: 0 } : current);
        return;
      }
      setChannelUnread((current) => ({ ...current, [channelId]: (current[channelId] ?? 0) + incoming.length }));
      const firstAuthor = incoming[0]?.authorName ?? "Um participante";
      setNotice(`${firstAuthor} enviou ${incoming.length === 1 ? "uma nova mensagem" : `${incoming.length} novas mensagens`} em #${channel?.name ?? "geral"}.`);
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState === "hidden") {
        new Notification(`Nova mensagem em #${channel?.name ?? "geral"}`, { body: incoming.length === 1 ? `${firstAuthor}: ${incoming[0]?.body ?? "Novo conteúdo"}` : `${incoming.length} novas mensagens recebidas.` });
      }
    }, (error) => setNotice(error.message));
  }, [activePanel, channel, community, currentUserId]);

  useEffect(() => {
    if (!directFriendId) { setDirectMessages([]); return; }
    return subscribeToDirectMessages(authUser?.uid ?? "", directFriendId, setDirectMessages, (error) => setNotice(error.message));
  }, [auth.user, directFriendId]);

  useEffect(() => {
    if (!community || !channel || channel.kind !== "voice") { setMembers([]); voiceRosterIdsRef.current = null; return; }
    return subscribeToVoiceMembers(community.id, channel.id, (nextMembers) => {
      setMembers(nextMembers);
      const remoteIds = new Set(nextMembers.filter((member) => member.uid !== currentUserId).map((member) => member.uid));
      const previousIds = voiceRosterIdsRef.current;
      voiceRosterIdsRef.current = remoteIds;
      if (!previousIds) return;
      for (const event of getVoiceParticipantEvents(previousIds, remoteIds)) {
        const changedId = event === "join" ? Array.from(remoteIds).find((id) => !previousIds.has(id)) : Array.from(previousIds).find((id) => !remoteIds.has(id));
        const index = changedId ? Array.from(remoteIds.size ? remoteIds : previousIds).indexOf(changedId) : 0;
        playTone(event, ((index % 3) - 1) * 0.22);
      }
    }, (error) => setNotice(error.message));
  }, [community, channel, currentUserId]);


  useEffect(() => {
    if (activePanel !== "chat" || channel?.kind !== "text") return;
    setChannelUnread((current) => current[channel.id] ? { ...current, [channel.id]: 0 } : current);
  }, [activePanel, channel]);

  useEffect(() => {
    if (!community || !voiceRoomId || !voiceSessionId || !auth.user || !meshRef.current) return;
    return subscribeToSignals(voiceRoomId, auth.user.uid, voiceSessionId, (signals) => { for (const signal of signals) void meshRef.current?.handleSignal(signal); }, (error) => setNotice(error.message));
  }, [auth.user, community, voiceRoomId, voiceSessionId]);

  useEffect(() => {
    if (!currentUserId) return;
    const memberIds = new Set(members.map((member) => member.uid));
    setPeerQualities((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([uid]) => memberIds.has(uid)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [currentUserId, members]);

  useEffect(() => {
    if (!community || !voiceRoomId || !auth.user) return;
    void meshRef.current?.syncMembers(members);
    void voiceService.startMicrophoneMeter();
    const timer = window.setInterval(() => {
      const isSpeaking = !muted && voiceService.getMicrophoneLevel() > 0.045;
      setLocalSpeaking(isSpeaking);
      if (speakingStateRef.current === isSpeaking) return;
      speakingStateRef.current = isSpeaking;
      void setVoiceSpeaking(community.id, auth.user!.uid, isSpeaking).catch(() => undefined);
    }, 180);
    return () => {
      window.clearInterval(timer);
      if (speakingStateRef.current) {
        speakingStateRef.current = false;
        void setVoiceSpeaking(community.id, auth.user!.uid, false).catch(() => undefined);
      }
      setLocalSpeaking(false);
    };

  }, [auth.user, community, voiceRoomId, voiceService, muted]);

  useEffect(() => {
    const activeBroadcasters = new Set(members.filter((member) => member.screenSharing && member.uid !== currentUserId).map((member) => member.uid));
    const previous = previousScreenBroadcasters.current;
    setScreenViewerIds((current) => {
      const next = new Set(Array.from(current).filter((uid) => activeBroadcasters.has(uid)));
      activeBroadcasters.forEach((uid) => { if (!previous.has(uid)) next.add(uid); });
      return next.size === current.size && Array.from(next).every((uid) => current.has(uid)) ? current : next;
    });
    previousScreenBroadcasters.current = activeBroadcasters;
  }, [members, currentUserId]);

  useEffect(() => () => voiceService.dispose(), [voiceService]);

  useEffect(() => {
    if (!currentUserId) return;
    const ids = friendships.filter((item) => item.status === "accepted").flatMap((item) => [item.requesterId, item.addresseeId]).filter((uid) => uid !== currentUserId);
    setFriendProfiles({});
    return subscribeToProfiles(ids, (profiles) => setFriendProfiles(Object.fromEntries(profiles.map((item) => [item.uid, item]))), (error) => setNotice(error.message));
  }, [friendships, currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    return subscribeToDirectCalls(currentUserId, (calls) => {
      const incoming = calls[0];
      if (!incoming) return;
      if (directCallRef.current && directCallId !== incoming.id) {
        directCallRef.current.stop();
        directCallRef.current = null;
        directLocalStream?.getTracks().forEach((track) => track.stop());
        directScreenStream?.getTracks().forEach((track) => track.stop());
        directRemoteStream?.getTracks().forEach((track) => track.stop());
        setDirectLocalStream(null);
        setDirectScreenStream(null);
        setDirectScreenSharing(false);
        setDirectRemoteStream(null);
        setDirectRemoteScreenStream(null);
        setDirectScreenVolume(1);
      }
      setDirectCallId(incoming.id); setDirectFriendId(incoming.callerId); setDirectCallDirection("incoming"); setDirectCallMedia(incoming.media); setDirectAudioBlocked(false); setDirectCallStatus("ringing");
      if (!ringtoneStopRef.current) ringtoneStopRef.current = startDirectCallRingtone();
      setNotice("Chamada recebida. Abra a conversa para atender.");
    }, (error) => setNotice(error.message));
  }, [currentUserId, directCallId, directLocalStream, directRemoteStream]);

  useEffect(() => {
    handledDirectSignalIds.current.clear();
    setPendingDirectSignals([]);
    if (!directCallId || !currentUserId) return;
    return subscribeToDirectCallSignals(directCallId, currentUserId, (signals) => {
      setPendingDirectSignals(signals.filter((signal) => !handledDirectSignalIds.current.has(signal.id)));
    }, (error) => setNotice(error.message));
  }, [directCallId, currentUserId]);

  useEffect(() => {
    const audio = directAudioRef.current;
    if (!audio) return;
    audio.srcObject = directRemoteStream;
    audio.volume = directVolume;
    if (!directRemoteStream) {
      setDirectAudioBlocked(false);
      return;
    }
    void audio.play().then(() => setDirectAudioBlocked(false)).catch(() => setDirectAudioBlocked(true));
    return () => {
      if (audio.srcObject === directRemoteStream) audio.srcObject = null;
    };
  }, [directRemoteStream, directVolume]);

  useEffect(() => {
    if (!directCallId) return;
    return subscribeToDirectCall(directCallId, (call) => {
      if (!call || call.status === "ended" || call.status === "declined") {
        stopDirectCallRingtone();
        directCallRef.current?.stop();
        directCallRef.current = null;
        directLocalStream?.getTracks().forEach((track) => track.stop());
        directScreenStream?.getTracks().forEach((track) => track.stop());
        directRemoteStream?.getTracks().forEach((track) => track.stop());
        setDirectLocalStream(null);
        setDirectScreenStream(null);
        setDirectScreenSharing(false);
        setDirectRemoteStream(null);
        setDirectRemoteScreenStream(null);
        setDirectVolume(1);
        setDirectScreenVolume(1);
        setDirectAudioBlocked(false);
        setDirectCallId(null);
        setDirectFriendId(null);
        setDirectCallDirection(null);
        setDirectCallStatus("ended");
        setPendingDirectSignals([]);
        handledDirectSignalIds.current.clear();
        if (call?.status === "declined") setNotice("A chamada foi recusada.");
        return;
      }
      if (call.status === "connected") {
        stopDirectCallRingtone();
        setDirectCallStatus("connected");
      }
    }, (error) => setNotice(error.message));
  }, [directCallId, directLocalStream, directRemoteStream]);

  useEffect(() => {
    const service = directCallRef.current;
    if (!service || !pendingDirectSignals.length) return;
    const signals = pendingDirectSignals;
    setPendingDirectSignals([]);
    for (const signal of signals) {
      handledDirectSignalIds.current.add(signal.id);
      void service.handleSignal(signal);
    }
  }, [pendingDirectSignals]);

  useEffect(() => {
    if (!currentUserId) return;
    const updatePresence = () => {
      const next = document.visibilityState === "visible" ? "online" : "away";
      void setPresence(currentUserId, next).catch(() => undefined);
    };
    const onPageHide = () => { void setPresence(currentUserId, "offline").catch(() => undefined); };
    updatePresence();
    document.addEventListener("visibilitychange", updatePresence);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", updatePresence);
      window.removeEventListener("pagehide", onPageHide);
      void setPresence(currentUserId, "offline").catch(() => undefined);
    };
  }, [currentUserId]);

  const acceptedFriendIds = useMemo(() => new Set(friendships.filter((item) => item.status === "accepted").map((item) => item.requesterId === auth.user?.uid ? item.addresseeId : item.requesterId)), [friendships, auth.user?.uid]);

  if (auth.loading) return <div className="loading-screen"><span>Preparando seu espaço Firebase...</span></div>;
  if (!authUser) return <FirebaseAuthPanel />;
  const currentUser = authUser;

  const sendDirect = async () => {
    if (!directFriendId || !directBody.trim()) return;
    try { await sendDirectMessage(currentUser.uid, directFriendId, currentUser.uid, directBody.trim()); setDirectBody(""); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível enviar a mensagem direta."); }
  };

  const sendMessage = async () => {
    if (!community || !channel || channel.kind !== "text" || !body.trim()) return;
    setLoading(true);
    try { await sendChannelMessage(community.id, channel.id, currentUser.uid, body.trim()); setBody(""); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível enviar a mensagem."); }
    finally { setLoading(false); }
  };

  const respondFriend = async (request: FirebaseFriendship, status: "accepted" | "declined") => {
    try { await respondToFriendRequest(request.id, currentUser.uid, status); setNotice(status === "accepted" ? "Amizade aceita." : "Solicitação recusada."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível responder à solicitação."); }
  };

  const searchProfiles = async () => {
    const code = search.trim().toUpperCase();
    if (!code) return;
    try { const found = await searchProfilesByPublicId(code); setResults(found); if (!found.length) setNotice("Nenhuma conta encontrada com esse código."); } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível buscar a conta."); }
  };

  const inviteFriend = async (targetUid: string) => {
    if (!community) { setNotice("Selecione uma comunidade antes de enviar o convite."); return; }
    try { await createCommunityInvite(community.id, community.name, currentUser.uid, targetUid); setNotice("Convite enviado."); } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível enviar o convite."); }
  };

  const respondInvite = async (invite: FirebaseCommunityInvite, status: "accepted" | "declined") => {
    try { await respondToCommunityInvite(invite.id, currentUser.uid, status); if (status === "accepted") { const joined = communities.find((item) => item.id === invite.communityId); if (!joined) setCommunities((current) => [...current, { id: invite.communityId, name: invite.communityName ?? "Comunidade", ownerId: invite.inviterId }]); setNotice("Convite aceito."); } } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível responder ao convite."); }
  };

  const startDirectCall = async (media: "audio" | "screen") => {
    if (!directFriendId) return;
    try {
      const local = await captureDirectStream(media);
      const callId = await createDirectCall(currentUser.uid, directFriendId, media);
      const service = new FirebaseDirectCall({ callId, userId: currentUser.uid, media, localStream: local, onRemoteStream: (stream) => { setDirectRemoteStream(new MediaStream(stream.getTracks())); setDirectCallStatus("connected"); }, onRemoteScreenStream: (stream) => { setDirectRemoteScreenStream(new MediaStream(stream.getTracks())); }, onRemoteScreenEnded: () => setDirectRemoteScreenStream(null), onScreenShareEnded: () => { setDirectScreenStream(null); setDirectScreenSharing(false); }, onError: (error) => setNotice(error.message) });
      directCallRef.current = service; setPendingDirectSignals([]); setDirectLocalStream(local); setDirectScreenStream(media === "screen" ? local : null); setDirectScreenSharing(media === "screen"); setDirectRemoteStream(null); setDirectRemoteScreenStream(null); setDirectScreenVolume(1); setDirectAudioBlocked(false); setDirectCallId(callId); setDirectCallDirection("outgoing"); setDirectCallStatus("ringing");
      playTone("join", -0.18);
      await service.start(directFriendId);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível iniciar a chamada individual."); }
  };

  const stopDirectCallRingtone = () => { ringtoneStopRef.current?.(); ringtoneStopRef.current = null; };

  const toggleDirectScreen = async () => {
    const service = directCallRef.current;
    if (!service || (directCallStatus !== "ringing" && directCallStatus !== "connected")) return;
    try {
      if (directScreenSharing) {
        await service.stopScreenShare();
        setDirectScreenStream(null);
        setDirectScreenSharing(false);
        setNotice("Compartilhamento de tela encerrado. A chamada continua ativa.");
      } else {
        const stream = await service.shareScreen();
        setDirectScreenStream(stream);
        setDirectScreenSharing(true);
        setNotice("Sua tela está sendo compartilhada nesta chamada.");
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível atualizar o compartilhamento de tela."); }
  };

  const closeDirectScreenForEveryone = async () => {
    const service = directCallRef.current;
    if (!service) return;
    try {
      await service.closeScreenForEveryone();
      setDirectScreenStream(null);
      setDirectScreenSharing(false);
      setNotice("Compartilhamento de tela fechado para os dois participantes. A chamada continua ativa.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível fechar o compartilhamento para os dois participantes."); }
  };

  const acceptDirectCall = async () => {
    if (!directCallId || !directFriendId) return;
    stopDirectCallRingtone();
    try {
      const local = await captureDirectStream("audio");
      const service = new FirebaseDirectCall({ callId: directCallId, userId: currentUser.uid, media: directCallMedia, localStream: local, onRemoteStream: (stream) => { setDirectRemoteStream(new MediaStream(stream.getTracks())); setDirectCallStatus("connected"); }, onRemoteScreenStream: (stream) => { setDirectRemoteScreenStream(new MediaStream(stream.getTracks())); }, onRemoteScreenEnded: () => setDirectRemoteScreenStream(null), onScreenShareEnded: () => { setDirectScreenStream(null); setDirectScreenSharing(false); }, onError: (error) => setNotice(error.message) });
      directCallRef.current = service;
      setDirectLocalStream(local);
      setDirectScreenStream(null);
      setDirectScreenSharing(false);
      setDirectRemoteStream(null);
      setDirectRemoteScreenStream(null);
      setDirectScreenVolume(1);
      setDirectAudioBlocked(false);
      const signalsToHandle = pendingDirectSignals;
      setPendingDirectSignals([]);
      for (const signal of signalsToHandle) {
        handledDirectSignalIds.current.add(signal.id);
        await service.handleSignal(signal);
      }
      await updateDirectCall(directCallId, "connected");
      playTone("join", 0.18);
      setDirectCallStatus("connected");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível atender a chamada."); }
  };

  const rejectDirectCall = async () => {
    stopDirectCallRingtone();
    if (directCallId) await updateDirectCall(directCallId, "declined").catch(() => undefined);
      setDirectCallId(null); setDirectFriendId(null); setDirectCallDirection(null); setDirectCallStatus("ended"); playTone("leave", 0); setNotice("Chamada recusada.");
  };

  const endDirectCall = async () => {
    stopDirectCallRingtone();
    try { if (directCallId) await updateDirectCall(directCallId, "ended"); }
    catch (error) { setNotice(error instanceof Error ? `Chamada encerrada localmente; o Firestore não confirmou a saída: ${error.message}` : "Chamada encerrada localmente; o Firestore não confirmou a saída."); }
    finally {
      playTone("leave", 0);
      directCallRef.current?.stop(); directCallRef.current = null;
      directLocalStream?.getTracks().forEach((track) => track.stop());
      directScreenStream?.getTracks().forEach((track) => track.stop());
      directRemoteStream?.getTracks().forEach((track) => track.stop());
      directRemoteScreenStream?.getTracks().forEach((track) => track.stop());
      setDirectLocalStream(null); setDirectScreenStream(null); setDirectScreenSharing(false); setDirectRemoteStream(null); setDirectRemoteScreenStream(null); setDirectVolume(1); setDirectScreenVolume(1); setDirectAudioBlocked(false); setDirectCallId(null); setDirectCallDirection(null); setDirectCallMedia("audio"); setDirectCallStatus("ended"); setPendingDirectSignals([]); handledDirectSignalIds.current.clear();
    }
  };

  const enableDirectAudio = async () => {
    try {
      await directAudioRef.current?.play();
      setDirectAudioBlocked(false);
      setNotice("Áudio da chamada ativado.");
    } catch {
      setDirectAudioBlocked(true);
      setNotice("O navegador bloqueou o áudio. Clique novamente em Ativar áudio.");
    }
  };

  const enableVoiceNotifications = async () => {
    if (typeof Notification === "undefined") { setNotice("Este navegador não oferece notificações do sistema."); return; }
    if (Notification.permission === "granted") { setNotice("Notificações de novas mensagens já estão ativadas."); return; }
    const permission = await Notification.requestPermission();
    setNotice(permission === "granted" ? "Notificações de novas mensagens ativadas." : "As notificações continuam desativadas.");
  };

  const saveDisplayName = async (displayName: string, avatarUrl: string) => {
    try { await saveProfile(currentUser, { displayName, avatarUrl }); setProfile((current) => current ? { ...current, displayName, avatarUrl } : current); setNotice("Perfil atualizado."); } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível atualizar o perfil."); }
  };

  const uploadAvatar = async (file: File): Promise<string> => {
    try { const avatarUrl = await uploadProfileAvatar(currentUser.uid, file); setNotice("Imagem enviada. Salve o perfil para confirmar a alteração."); return avatarUrl; } catch (error) { const message = error instanceof Error ? error.message : "Não foi possível enviar a imagem."; setNotice(message); throw error; }
  };

  const deleteDirect = async (friendUid: string) => {
    try { await deleteDirectConversation(currentUser.uid, friendUid); setDirectFriendId(null); setNotice("Conversa apagada."); } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível apagar a conversa."); }
  };

  const addFriend = async (target: FirebaseProfile) => {
    try {
      await createFriendRequest(currentUser.uid, target.uid);
      setNotice("Solicitação enviada para " + (target.publicId ?? target.displayName) + ".");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível enviar a solicitação."); }
  };

  const openCreationDialog = (target: "community" | "room") => {
    if (target === "room" && !community) { setNotice("Crie ou selecione uma comunidade antes de adicionar uma sala."); return; }
    setCreationTarget(target);
    setCreationName("");
    setCreationError("");
  };

  const closeCreationDialog = () => { setCreationTarget(null); setCreationName(""); setCreationError(""); };

  const submitCreation = async () => {
    const name = creationName.trim();
    if (!creationTarget || !name || creationPending) return;
    setCreationError("");
    setCreationPending(true);
    try {
      if (creationTarget === "community") {
        const id = await createCommunity(currentUser.uid, name);
        const created = { id, name, ownerId: currentUser.uid };
        setCommunities((current) => [...current, created]);
        setCommunity(created);
        setNotice("Comunidade criada com o canal #geral.");
      } else if (community) {
        await createVoiceRoom(community.id, name);
        setNotice("Sala de voz criada.");
      }
      closeCreationDialog();
    } catch (error) { const message = error instanceof Error ? error.message : "Não foi possível concluir a criação."; setCreationError(message); setNotice(message); }
    finally { setCreationPending(false); }
  };

  const playTone = (kind: "join" | "leave" | "mute" | "unmute", pan = 0) => {
    playVoiceTone(kind, pan);
  };


  const toggleMute = async () => {
    if (!community || !voiceRoomId || !voiceStream) return;
    const nextMuted = !muted;
    voiceStream.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    await upsertVoiceMember(community.id, { uid: currentUser.uid, roomId: voiceRoomId, displayName: profile?.displayName ?? currentUser.displayName ?? "Conta Concord", avatarUrl: profile?.avatarUrl, isSpeaking: false, muted: nextMuted });
    setMuted(nextMuted);
    if (nextMuted) setLocalSpeaking(false);
    playTone(nextMuted ? "mute" : "unmute");
  };

  const updateOwnScreenState = async (sharing: boolean) => {
    if (!community || !voiceRoomId) return;
    try { await upsertVoiceMember(community.id, { uid: currentUser.uid, roomId: voiceRoomId, displayName: profile?.displayName ?? currentUser.displayName ?? "Conta Concord", avatarUrl: profile?.avatarUrl, isSpeaking: false, muted, screenSharing: sharing }); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível sincronizar o compartilhamento."); }
  };

  const toggleScreenViewer = (peerId: string) => {
    setScreenViewerIds((current) => {
      const next = new Set(current);
      if (next.has(peerId)) next.delete(peerId); else next.add(peerId);
      return next;
    });
  };

  const toggleScreen = async () => {
    if (!meshRef.current || !voiceRoomId) return;
    try {
      if (screenSharing) { meshRef.current.stopScreen(); setScreenSharing(false); setScreenPreviewStream(null); await updateOwnScreenState(false); }
      else { const stream = await meshRef.current.shareScreen(); setScreenPreviewStream(stream); setScreenSharing(true); await updateOwnScreenState(true); }
    }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível compartilhar a tela."); }
  };

  const closeGroupScreen = async (ownerId?: string) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    try {
      await mesh.closeScreenForEveryone(ownerId);
      if (!ownerId || ownerId === currentUser.uid) { setScreenSharing(false); setScreenPreviewStream(null); }
      setNotice(ownerId ? "Compartilhamento de tela fechado para todos os participantes." : "Seu compartilhamento de tela foi fechado para todos. A chamada continua ativa.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível fechar o compartilhamento de tela."); }
  };

  const leaveVoiceRoom = async () => {
    if (!community || !voiceRoomId) return;
    leavingVoiceRef.current = true;
    const activeRoomId = voiceRoomId;
    try { await removeVoiceMember(community.id, currentUser.uid); } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível registrar sua saída."); }
    meshRef.current?.dispose(); meshRef.current = null;
    voiceService.dispose();
    voiceStream?.getTracks().forEach((track) => track.stop());
    screenPreviewStream?.getTracks().forEach((track) => track.stop());
    setVoiceStream(null); setVoiceRoomId(null); setVoiceSessionId(null); setMuted(false); setLocalSpeaking(false); setScreenSharing(false); setScreenPreviewStream(null); setScreenViewerIds(new Set()); setRemoteStreams({}); setRemoteScreenStreams({}); setPeerQualities({}); setScreenVolumes({}); setVoiceAudioBlocked(false); setVoiceAudioUnlockVersion(0); previousScreenBroadcasters.current = new Set();
    leavingVoiceRef.current = false;
    playTone("leave");
    setNotice(`Você saiu da sala ${rooms.find((room) => room.id === activeRoomId)?.name ?? "de voz"}.`);
  };

  const toggleVoice = async (room: FirebaseVoiceRoom) => {
    if (!community) return;
    const isCurrentRoom = voiceRoomId === room.id;
    try {
      if (isCurrentRoom) { await leaveVoiceRoom(); }
      else {
        if (voiceRoomId) await leaveVoiceRoom();
        const roomMemberCount = await countVoiceMembers(community.id, room.id);
        if (roomMemberCount >= 8) { setNotice("Esta sala já atingiu o limite de 8 participantes."); return; }
        meshRef.current?.dispose();
        const localStream = await voiceService.captureMicrophone();
        const sessionId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setVoiceStream(localStream);
        setVoiceSessionId(sessionId);
        setPeerQualities({});
        setVoiceAudioBlocked(false);
        setVoiceAudioUnlockVersion(0);
        meshRef.current = new FirebaseVoiceMesh({ roomId: room.id, userId: currentUser.uid, sessionId, localStream, onRemoteStream: (peerId, stream) => setRemoteStreams((current) => ({ ...current, [peerId]: stream })), onRemoteScreenStream: (peerId, stream) => { setRemoteScreenStreams((current) => ({ ...current, [peerId]: new MediaStream(stream.getTracks()) })); setScreenVolumes((current) => ({ [peerId]: current[peerId] ?? 1, ...current })); }, onRemoteScreenEnded: (peerId) => { setRemoteScreenStreams((current) => { const next = { ...current }; delete next[peerId]; return next; }); setScreenVolumes((current) => { const next = { ...current }; delete next[peerId]; return next; }); setScreenViewerIds((current) => { const next = new Set(current); next.delete(peerId); return next; }); }, onPeerQuality: (peerId, quality) => setPeerQualities((current) => ({ ...current, [peerId]: quality })), onError: (error) => setNotice(error.message), onScreenShareEnded: () => { setScreenSharing(false); setScreenPreviewStream(null); if (!leavingVoiceRef.current) void updateOwnScreenState(false); } });
        await upsertVoiceMember(community.id, { uid: currentUser.uid, roomId: room.id, sessionId, displayName: profile?.displayName ?? currentUser.displayName ?? "Conta Concord", avatarUrl: profile?.avatarUrl, isSpeaking: false, muted: false, screenSharing: false });
        setVoiceRoomId(room.id);
        setMuted(false);
        playTone("join");
        setNotice("Você entrou na sala de voz.");
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível atualizar a sala."); }
  };

  if (!hasFirebaseConfig()) return <main className="firebase-config-error"><div className="firebase-config-card"><span className="firebase-config-kicker">CONFIGURAÇÃO NECESSÁRIA</span><h1>Concord está pronto, mas o Firebase ainda não foi configurado.</h1><p>Adicione as variáveis públicas do Firebase em GitHub → Settings → Secrets and variables → Actions → Variables e execute o workflow novamente.</p><code>{missingFirebaseConfigKeys.join(", ") || "VITE_FIREBASE_*"}</code><p className="firebase-config-help">As credenciais administrativas não são necessárias no frontend. Depois de salvar as variáveis, faça um novo push ou use Run workflow.</p></div></main>;

  const activeFriend = directFriendId ? friendProfiles[directFriendId] : null;
  const activeVoiceRoom = channel?.kind === "voice" ? rooms.find((room) => room.id === channel.id) ?? null : null;
  return <div className="app-shell firebase-original-shell">
    <aside className="server-rail">
      <div className="rail-brand"><div className="logo-mark logo-mark-sm" aria-label="Concord"><img src="/assets/favicon.png" alt="" /></div></div><div className="rail-divider" />
      <button className={activePanel === "chat" ? "server-icon home-server selected" : "server-icon home-server"} aria-label="Início" onClick={() => setActivePanel("chat")}><HomeIcon size={18} /></button><button className={activePanel === "friends" ? "server-icon friends-server selected" : "server-icon friends-server"} aria-label="Amigos" onClick={() => setActivePanel("friends")}><Users size={18} /></button><div className="rail-divider" />
      {communities.map((item) => <button key={item.id} className={community?.id === item.id ? "server-icon community-icon selected" : "server-icon community-icon"} onClick={() => { setCommunity(item); setActivePanel("chat"); }} title={item.name}>{initials(item.name)}</button>)}
      <button className="server-icon add-server" onClick={() => openCreationDialog("community")} aria-label="Criar comunidade"><Plus size={19} /></button><div className="rail-bottom"><button className={activePanel === "settings" ? "server-icon settings-server selected" : "server-icon settings-server"} onClick={() => setActivePanel("settings")} aria-label="Configurações"><Settings size={17} /></button></div>
    </aside>

    <aside className="channel-sidebar">
      <div className="community-header"><div><strong>{community?.name ?? "Seu espaço"}</strong><span>Comunidade criativa</span></div><button className="desktop-more" aria-label="Mais opções"><ChevronDown size={17} /></button></div>
      <div className="channel-scroll">
        <button className="discover-link" onClick={() => setNotice("Exploração de comunidades estará disponível em breve.")}><Compass size={15} /> Explorar comunidades</button>
        <div className="channel-group dm-group"><div className="group-label"><span>MENSAGENS DIRETAS</span><Plus size={13} /></div>{friendships.filter((item) => item.status === "accepted").length ? friendships.filter((item) => item.status === "accepted").map((item) => <button key={item.id} className="channel-link dm-link" onClick={() => setDirectFriendId(item.requesterId === currentUser.uid ? item.addresseeId : item.requesterId)}><span className="avatar bg-blue-200 text-blue-900"><Users size={12} /></span><span>Conexão ativa</span></button>) : <div className="dm-status">Nenhuma amizade aceita ainda.</div>}</div>
        {!community ? <div className="dm-status">Crie uma comunidade para começar.</div> : <><div className="channel-group"><div className="group-label"><span>CANAIS DE TEXTO</span><Plus size={13} /></div>{channels.filter((item) => item.kind === "text").length ? channels.filter((item) => item.kind === "text").map((item) => <button key={item.id} className={channel?.id === item.id ? "channel-link active" : "channel-link"} onClick={() => { setDirectFriendId(null); setChannel(item); }}><Hash size={15} />{item.name}{channelUnread[item.id] ? <span className="voice-unread" aria-label={`${channelUnread[item.id]} mensagens não lidas`}>{channelUnread[item.id] > 99 ? "99+" : channelUnread[item.id]}</span> : null}</button>) : <div className="dm-status">Nenhum canal de texto criado ainda.</div>}</div><div className="channel-group voice-channel-group"><div className="group-label"><span>SALAS DE VOZ · {rooms.length}</span><button type="button" className="sidebar-add-button" onClick={() => openCreationDialog("room")} aria-label="Adicionar sala de voz" title="Adicionar sala de voz"><Plus size={13} /></button></div>{rooms.length ? rooms.map((room) => <div key={room.id}><button className={channel?.id === room.id ? "channel-link voice-link active" : "channel-link voice-link"} onClick={() => { setDirectFriendId(null); setChannel({ id: room.id, communityId: room.communityId, name: room.name, kind: "voice" }); void toggleVoice(room); }}><Volume2 size={15} /><span>{room.name}</span>{voiceRoomId === room.id && <span className="channel-live" />}</button>{voiceRoomId === room.id && <div className="voice-members"><div>{members.length ? members.length + " conectado(s)" : "Conectando..."}</div><small className="voice-note">Presença sincronizada em tempo real.</small></div>}</div>) : <div className="dm-status">Nenhuma sala de voz criada. Use + para criar a primeira.</div>}</div></>}
        <div className="side-tip"><Sparkles size={14} /><p><strong>Seu espaço, seu ritmo.</strong><br />Convide pessoas para construir junto.</p></div>
      </div>
      {voiceRoomId && <div className="voice-sidebar-dock"><div className="voice-sidebar-dock-title"><Volume2 size={14} /><div><strong>{rooms.find((room) => room.id === voiceRoomId)?.name ?? "Sala de voz"}</strong><span>{members.length || 1} conectado(s)</span></div></div><div className="voice-sidebar-dock-actions"><button className={muted ? "is-active" : ""} onClick={toggleMute} aria-label={muted ? "Ativar microfone" : "Mutar microfone"}><Mic size={14} /></button><button className={screenSharing ? "is-active" : ""} onClick={() => void toggleScreen()} aria-label={screenSharing ? "Parar compartilhamento de tela" : "Compartilhar tela"}><Video size={14} /></button><button className="leave-call" onClick={() => void leaveVoiceRoom()} aria-label="Sair da call"><PhoneOff size={14} /></button></div></div>}
      <div className="user-panel"><button className="user-identity" onClick={() => setActivePanel("profile")} aria-label="Abrir perfil"><span className="avatar bg-slate-200 text-slate-900"><span>{initials(profile?.displayName ?? currentUser.displayName ?? "Conta")}</span><span className="online-dot" /></span><div className="user-meta"><strong>{profile?.displayName ?? currentUser.displayName ?? "Conta Concord"}</strong><span>{profile?.publicId ?? "CON-00000000"}</span></div></button><button className={muted ? "control-active" : ""} onClick={toggleMute} aria-label="Alternar microfone"><Mic size={15} /></button><button onClick={() => void auth.logout()} aria-label="Sair da conta"><MoreHorizontal size={16} /></button></div>
    </aside>

    <main className="content-area">
      <header className="content-header"><div className="mobile-nav-actions"><button aria-label="Abrir canais" onClick={() => setActivePanel("chat")}><Compass size={17} /></button><button aria-label="Abrir amigos" onClick={() => setActivePanel("friends")}><Users size={17} /></button><button aria-label="Abrir perfil" onClick={() => setActivePanel("profile")}><Settings size={17} /></button></div><div className="channel-title"><div className="title-symbol"><Hash size={18} /></div><div><h2>{directFriendId ? "Mensagem direta" : channel?.name ?? "geral"}</h2><span>{channel?.kind === "voice" ? `Sala de voz em tempo real${isOnline ? "." : " · Offline — mensagens serão sincronizadas depois."}` : "Um espaço para começar qualquer conversa."}</span></div></div><div className="header-actions"><button title="Ativar notificações de mensagens" onClick={() => void enableVoiceNotifications()} aria-label="Ativar notificações de mensagens"><Bell size={17} />{Object.values(channelUnread).reduce((total, count) => total + count, 0) > 0 && <span className="header-unread-dot" />}</button><button title="Abrir Amigos" onClick={() => { setActivePanel("friends"); setSocialOpen(false); }}><Search size={17} /></button><button title="Abrir ou recolher membros" onClick={() => setMembersOpen((open) => !open)}><Users size={17} /></button><div className="header-divider" /><button className="profile-chip" onClick={() => setActivePanel("profile")}><span className="avatar profile-avatar-shell">{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{initials(profile?.displayName ?? currentUser.displayName ?? "Conta")}</span>}<span className="online-dot" /></span><span>{profile?.displayName ?? currentUser.displayName ?? "Conta Concord"}</span><ChevronDown size={14} /></button></div></header>
      {notice && <div className="firebase-notice" role="status">{notice}</div>}
      {activePanel === "chat" ? <>
      {directFriendId ? <><section className="message-area"><div className="direct-chat-toolbar"><div className="direct-chat-identity"><span className="avatar bg-blue-200 text-blue-900">{initials(activeFriend?.displayName ?? "Amigo")}</span><div><strong>{activeFriend?.displayName ?? "Conversa direta"}</strong><small>{activeFriend?.presence === "online" ? "Online" : activeFriend?.presence === "away" ? "Ocupado" : "Indisponível"}</small></div></div><div className="direct-chat-actions"><div className="direct-call-actions" role="group" aria-label="Controles da chamada"><button className="direct-call-button" onClick={() => void startDirectCall("audio")} disabled={directCallStatus !== "idle" && directCallStatus !== "ended"} aria-label="Iniciar chamada de áudio" title="Chamada de áudio"><Headphones size={16} /><span>Áudio</span></button><button className={directScreenSharing ? "direct-call-button direct-call-screen-active" : "direct-call-button"} onClick={() => void toggleDirectScreen()} disabled={directCallStatus === "idle" || directCallStatus === "ended" || (directCallStatus === "ringing" && !directCallRef.current)} aria-label={directScreenSharing ? "Parar compartilhamento de tela" : "Compartilhar tela na chamada"} title={directScreenSharing ? "Parar compartilhamento" : "Compartilhar tela"}><Video size={16} /><span>{directScreenSharing ? "Parar tela" : "Tela"}</span></button>{directCallStatus !== "idle" && directCallStatus !== "ended" ? <button className="direct-call-button direct-call-end" onClick={() => void endDirectCall()} aria-label="Encerrar chamada" title="Encerrar chamada"><PhoneOff size={16} /><span>Encerrar</span></button> : null}</div><div className="direct-utility-actions"><button onClick={() => setSocialOpen(true)} aria-label="Convidar para o grupo" title="Convidar"><UserPlus size={16} /></button><button onClick={() => { if (directFriendId) void deleteDirect(directFriendId); }} aria-label="Apagar conversa" title="Apagar conversa"><X size={16} /></button></div></div></div>{hasVideoTrack(directScreenStream) && <DraggableScreenPanel stream={directScreenStream} title="Sua tela" label="Você está compartilhando a tela" onClose={() => void closeDirectScreenForEveryone()} />}{hasVideoTrack(directRemoteScreenStream) && <DraggableScreenPanel stream={directRemoteScreenStream} title={activeFriend?.displayName ?? "Seu amigo"} label={`Tela de ${activeFriend?.displayName ?? "seu amigo"}`} volume={directScreenVolume} muted={false} onVolumeChange={setDirectScreenVolume} onClose={() => void closeDirectScreenForEveryone()} />}<audio ref={directAudioRef} autoPlay playsInline aria-label="Áudio remoto da chamada" />{directRemoteStream && directAudioBlocked && <button className="direct-audio-unlock" onClick={() => void enableDirectAudio()}><Volume2 size={15} /> Ativar áudio</button>}<div className="channel-intro"><div className="intro-symbol"><MessageCircle size={27} /></div><h1>Conversa com {activeFriend?.displayName ?? "seu amigo"}</h1><p>Mensagens diretas com sua conexão.</p><div className="intro-rule" /></div><div className="message-list">{directMessages.length ? directMessages.map((item) => <article className="message-row" key={item.id}><span className="avatar bg-blue-200 text-blue-900">{initials(item.authorId)}</span><div className="message-copy"><div className="message-author"><strong>{item.authorId === currentUser.uid ? "Você" : item.authorId}</strong><span>@conexão</span><time>agora</time></div><p>{item.body}</p></div></article>) : <div className="empty-state">Nenhuma mensagem nesta conversa ainda.</div>}</div></section><div className="composer-wrap"><div className="composer"><Input value={directBody} onChange={(event) => setDirectBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void sendDirect(); }} placeholder="Mensagem direta" /><button className="send-button" onClick={() => void sendDirect()} aria-label="Enviar mensagem direta"><Send size={17} /></button></div></div></> : channel?.kind === "voice" ? <section className="message-area firebase-voice-original-stage"><div className="channel-intro"><div className="intro-symbol"><Headphones size={27} /></div><h1>{channel.name}</h1><p>{members.length}/8 participante(s) sincronizado(s) pelo Firestore.</p><div className="intro-rule" /></div><div className="firebase-member-grid">{members.length ? members.map((member) => { const quality = peerQualities[member.uid]; return <div className={member.isSpeaking || (member.uid === currentUser.uid && localSpeaking) ? "firebase-member speaking call-member-speaking" : "firebase-member"} key={member.uid} title={member.isSpeaking || (member.uid === currentUser.uid && localSpeaking) ? `${member.displayName} está falando agora` : member.displayName}><span className={member.isSpeaking || (member.uid === currentUser.uid && localSpeaking) ? "avatar bg-blue-200 text-blue-900 speaking-avatar" : "avatar bg-blue-200 text-blue-900"}>{initials(member.displayName)}</span><strong>{member.displayName}</strong>{member.isSpeaking || (member.uid === currentUser.uid && localSpeaking) ? <span className="talking-label">Falando</span> : null}<span className={`voice-quality voice-quality-${quality?.level ?? "unknown"}`} title={`${qualityLabel(quality)}${quality?.ping !== null && quality?.ping !== undefined ? ` · ${quality.ping} ms` : ""}`}><Signal size={13} /><span>{quality?.ping !== null && quality?.ping !== undefined ? `${quality.ping} ms` : "--"}</span></span></div>; }) : <div className="empty-state">Ninguém na sala ainda.</div>}</div>{Object.entries(remoteStreams).map(([peerId, stream]) => <RemoteAudio key={peerId} peerId={peerId} stream={stream} unlockVersion={voiceAudioUnlockVersion} onBlocked={() => setVoiceAudioBlocked(true)} />)}{voiceAudioBlocked && <button className="voice-audio-unlock" type="button" onClick={() => { setVoiceAudioBlocked(false); setVoiceAudioUnlockVersion((current) => current + 1); }}><Volume2 size={15} /> Ativar áudio dos participantes</button>}{screenPreviewStream && <DraggableScreenPanel stream={screenPreviewStream} title="Sua tela" label="Você está compartilhando a tela" onClose={() => void closeGroupScreen()} />}{members.filter((member) => member.screenSharing && member.uid !== currentUser.uid && screenViewerIds.has(member.uid) && hasVideoTrack(remoteScreenStreams[member.uid] ?? null)).map((member) => <DraggableScreenPanel key={member.uid} stream={remoteScreenStreams[member.uid]!} title={member.displayName} label={`Tela de ${member.displayName}`} volume={screenVolumes[member.uid] ?? 1} muted={false} onVolumeChange={(value) => setScreenVolumes((current) => ({ ...current, [member.uid]: value }))} onClose={() => void closeGroupScreen(member.uid)} />)}<VoiceScreenPanel currentUid={currentUser.uid} members={members} screenStreams={remoteScreenStreams} viewers={screenViewerIds} onToggleViewer={toggleScreenViewer} /><div className="voice-chat-redirect"><MessageCircle size={16} /><span>O chat desta sala foi unificado com o canal Geral da comunidade.</span><button type="button" onClick={() => { const general = channels.find((item) => item.kind === "text"); if (general) setChannel(general); }}>Abrir Geral</button></div>{voiceRoomId ? <div className="call-actions firebase-voice-actions"><button className={muted ? "control-active" : ""} onClick={toggleMute} aria-label="Mutar microfone"><Mic size={16} /></button><button className={screenSharing ? "control-active" : ""} onClick={() => void toggleScreen()} aria-label="Compartilhar tela"><Video size={16} /></button><button className="disconnect" onClick={() => void leaveVoiceRoom()} aria-label="Sair da sala"><PhoneOff size={16} /></button></div> : <div className="call-actions firebase-voice-actions"><button className="join-call-button" onClick={() => activeVoiceRoom && void toggleVoice(activeVoiceRoom)} disabled={!activeVoiceRoom}><Headphones size={16} /> Entrar na chamada</button></div>}</section> : <><section className="message-area"><div className="channel-intro"><div className="intro-symbol"><Hash size={27} /></div><h1>Bem-vindo ao #{channel?.name ?? "geral"}</h1><p>Este é o começo do canal. Um bom lugar para dizer olá.</p><div className="intro-rule" /></div><div className="message-list">{messages.length ? messages.map((item) => <article className="message-row" key={item.id}><span className="avatar bg-blue-200 text-blue-900">{initials(item.authorId)}</span><div className="message-copy"><div className="message-author"><strong>{item.authorId === currentUser.uid ? "Você" : "Concord"}</strong><span>@concord</span><time>agora</time></div><p>{item.body}</p></div></article>) : <article className="message-row"><span className="avatar bg-blue-100 text-blue-900">CO</span><div className="message-copy"><div className="message-author"><strong>Concord</strong><span>@concord</span><time>agora</time></div><p>Bem-vindo ao Concord. Esta é a primeira mensagem deste canal.</p></div></article>}</div></section><div className="composer-wrap"><div className="composer"><button aria-label="Mais opções"><Plus size={19} /></button><Input value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void sendMessage(); }} placeholder={"Mensagem em #" + (channel?.name ?? "geral")} /><button onClick={() => void sendMessage()} className="send-button" aria-label="Enviar mensagem"><Send size={17} /></button></div><span className="composer-hint">Enter para enviar <span>•</span> Shift + Enter para nova linha</span></div></>}
      </> : activePanel === "friends" ? <FriendsPanel currentUid={currentUser.uid} searchValue={search} results={results} friendships={friendships} friendProfiles={friendProfiles} invites={invites} onOpenChat={(uid) => { setDirectFriendId(uid); setActivePanel("chat"); }} onSearchValueChange={setSearch} onSearch={() => void searchProfiles()} onAddFriend={(target) => void addFriend(target)} onRespondFriend={(request, status) => void respondFriend(request, status)} onRespondInvite={(invite, status) => void respondInvite(invite, status)} /> : activePanel === "profile" ? <ProfilePanel profile={profile} email={currentUser.email ?? ""} onSave={(name, avatarUrl) => void saveDisplayName(name, avatarUrl)} onUpload={uploadAvatar} /> : <SettingsPanel onVoiceSettings={() => setNotice("Entre em uma sala para testar o microfone; a permissão será solicitada pelo navegador.")} />}
    </main>

    <aside className={membersOpen ? "member-sidebar" : "member-sidebar collapsed"}><div className="member-heading"><span>{voiceRoomId ? "NA CHAMADA" : "CONEXÕES"} — {voiceRoomId ? members.length : friendships.filter((item) => item.status === "accepted").length}</span><button onClick={() => setNotice("Membros sincronizados pelo Firebase.")} aria-label="Mais opções"><MoreHorizontal size={17} /></button></div><div className="member-group"><span className="member-role">{voiceRoomId ? "PARTICIPANTES DA SALA" : "CONEXÕES"}</span>{voiceRoomId ? (members.length ? members.map((member) => <div className="member-card call-member-card" key={member.uid}><span className="avatar bg-blue-200 text-blue-900">{initials(member.displayName)}</span><div><strong>{member.displayName}{member.uid === currentUser.uid ? " (Você)" : ""}</strong><span>{member.isSpeaking ? "Falando agora" : member.muted ? "Microfone mutado" : "Na chamada"}</span></div></div>) : <div className="empty-state">Ninguém entrou na chamada ainda.</div>) : <>{friendships.filter((item) => item.status === "accepted").map((item) => <button className="member-card" key={item.id} onClick={() => setDirectFriendId(item.requesterId === currentUser.uid ? item.addresseeId : item.requesterId)}><span className="avatar bg-blue-200 text-blue-900"><Users size={13} /></span><div><strong>{friendProfiles[item.requesterId === currentUser.uid ? item.addresseeId : item.requesterId]?.displayName ?? "Conexão"}</strong><span>{friendProfiles[item.requesterId === currentUser.uid ? item.addresseeId : item.requesterId]?.presence === "online" ? "Online" : friendProfiles[item.requesterId === currentUser.uid ? item.addresseeId : item.requesterId]?.presence === "away" ? "Ocupado" : "Indisponível"}</span></div></button>)}{!friendships.filter((item) => item.status === "accepted").length && <div className="empty-state">Nenhuma conexão aceita.</div>}</>}</div>{voiceRoomId && <div className="call-dock"><div className="call-status"><span className="call-pulse" /><div><strong>{rooms.find((room) => room.id === voiceRoomId)?.name ?? "Sala de voz"}</strong><span>{members.length || 1}/8 pessoa(s) na sala</span></div><button onClick={() => setNotice("Convite de sala disponível quando houver conexões.")} aria-label="Convidar"><UserPlus size={15} /></button></div><div className="call-actions"><button className={muted ? "control-active" : ""} onClick={toggleMute} aria-label="Mutar microfone"><Mic size={16} /></button><button className={screenSharing ? "control-active" : ""} onClick={() => void toggleScreen()} aria-label="Compartilhar tela"><Video size={16} /></button><button className="disconnect" onClick={() => void leaveVoiceRoom()} aria-label="Sair da call"><X size={16} /></button></div></div>}</aside>
    {directCallStatus === "ringing" && directCallDirection === "incoming" && directCallId && <div className="firebase-dialog-backdrop incoming-call-backdrop" role="presentation"><section className="firebase-dialog incoming-call-dialog" role="dialog" aria-modal="true" aria-labelledby="incoming-call-title"><div className="incoming-call-glow" aria-hidden="true" /><span className="firebase-kicker">CONCORD / CHAMADA RECEBIDA</span><div className="incoming-call-avatar-wrap"><div className="incoming-call-avatar avatar bg-blue-200 text-blue-900">{initials(activeFriend?.displayName ?? "Amigo")}</div><span className="incoming-call-wave incoming-call-wave-one" /><span className="incoming-call-wave incoming-call-wave-two" /></div><span className="incoming-call-label"><Headphones size={13} /> Chamada de áudio</span><h2 id="incoming-call-title">{activeFriend?.displayName ?? "Seu amigo"} está ligando</h2><p>Atenda para iniciar uma conversa em tempo real.</p><div className="incoming-call-actions"><Button className="incoming-call-reject" onClick={() => void rejectDirectCall()}><PhoneOff size={16} /> Recusar</Button><Button className="incoming-call-accept" onClick={() => void acceptDirectCall()}><Headphones size={16} /> Atender</Button></div></section></div>}
    {creationTarget && <CreationDialog target={creationTarget} value={creationName} error={creationError} pending={creationPending} onChange={setCreationName} onClose={closeCreationDialog} onSubmit={() => void submitCreation()} />}
    {socialOpen && <SocialDialog currentPublicId={profile?.publicId ?? "CON-00000000"} searchValue={search} results={results} friendships={friendships} invites={invites} currentUid={currentUser.uid} community={community} onSearchValueChange={setSearch} onSearch={() => void searchProfiles()} onAddFriend={(target) => void addFriend(target)} onInvite={(targetUid) => void inviteFriend(targetUid)} onRespondInvite={(invite, status) => void respondInvite(invite, status)} onClose={() => setSocialOpen(false)} />}
  </div>;
}
