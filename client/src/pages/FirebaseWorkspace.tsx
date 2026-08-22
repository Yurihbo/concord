import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronDown, Compass, Hash, Headphones, Home as HomeIcon, LogOut, MessageCircle, Mic, MoreHorizontal, PhoneOff, Plus, Radio, Search, Send, Settings, Sparkles, UserPlus, Users, Video, Volume2, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FirebaseAuthPanel } from "@/components/FirebaseAuthPanel";
import { ConcordWebRTCService } from "@/services/webrtc";
import { FirebaseVoiceMesh } from "@/services/firebaseVoiceMesh";
import { FirebaseDirectCall } from "@/services/firebaseDirectCall";
import { playVoiceToneOnContext } from "@/services/voiceActivity";
import { subscribeToSignals } from "@/services/firebaseSignaling";
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";
import { hasFirebaseConfig, missingFirebaseConfigKeys } from "@/lib/firebase";
import {
  createCommunity,
  createFriendRequest,
  createVoiceRoom,
  getProfile,
  getProfiles,
  createDirectCall,
  updateDirectCall,
  subscribeToDirectCalls,
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
function currentUserId(user: { uid: string } | null): string { return user?.uid ?? ""; }

type CreationDialogProps = { target: "community" | "room"; value: string; error: string; pending: boolean; onChange: (value: string) => void; onClose: () => void; onSubmit: () => void };

function CreationDialog({ target, value, error, pending, onChange, onClose, onSubmit }: CreationDialogProps) {
  const title = target === "community" ? "Criar comunidade" : "Adicionar sala de voz";
  const label = target === "community" ? "Nome da comunidade" : "Nome da sala";
  return <div className="firebase-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="firebase-dialog" role="dialog" aria-modal="true" aria-labelledby="firebase-dialog-title"><span className="firebase-kicker">CONCORD / NOVO ESPAÇO</span><h2 id="firebase-dialog-title">{title}</h2><p>{target === "community" ? "Organize seus canais e convide pessoas para conversar." : "Crie até três salas de voz nesta comunidade."}</p><label htmlFor="firebase-creation-name">{label}<Input id="firebase-creation-name" autoFocus value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSubmit(); if (event.key === "Escape") onClose(); }} placeholder={target === "community" ? "Ex.: Equipe Concord" : "Ex.: Estúdio aberto"} /></label>{error && <div className="firebase-auth-error" role="alert">{error}</div>}<div className="firebase-dialog-actions"><Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button><Button className="primary-cta" onClick={onSubmit} disabled={pending || !value.trim()}>{pending ? "Salvando..." : target === "community" ? "Criar comunidade" : "Criar sala"}</Button></div></section></div>;
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

function ProfilePanel({ profile, email, onSave }: { profile: FirebaseProfile | null; email: string; onSave: (displayName: string) => void }) {
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  useEffect(() => { setDisplayName(profile?.displayName ?? ""); }, [profile?.displayName]);
  return <section className="workspace-panel"><div className="workspace-panel-heading"><div><span className="firebase-kicker">CONCORD / PERFIL</span><h1>Seu perfil</h1><p>Edite o nome que aparece para suas conexões.</p></div><Settings size={27} /></div><div className="profile-edit-card"><label>Nome de exibição<Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>E-mail<Input value={email} readOnly /></label><div className="profile-code"><span>Seu código público</span><strong>{profile?.publicId ?? "CON-00000000"}</strong></div><Button className="primary-cta" onClick={() => onSave(displayName.trim())} disabled={!displayName.trim()}>Salvar perfil</Button></div></section>;
}

function SettingsPanel({ onVoiceSettings }: { onVoiceSettings: () => void }) {
  return <section className="workspace-panel"><div className="workspace-panel-heading"><div><span className="firebase-kicker">CONCORD / CONFIGURAÇÕES</span><h1>Configurações</h1><p>Controle seu perfil e sua experiência de voz.</p></div><Settings size={27} /></div><div className="settings-grid"><button className="settings-card" onClick={onVoiceSettings}><Mic size={19} /><span><strong>Configuração de voz</strong><small>Reabrir permissão do microfone e revisar o dispositivo de entrada.</small></span><ChevronDown size={16} /></button><div className="settings-card static"><UserPlus size={19} /><span><strong>Privacidade</strong><small>Suas solicitações usam somente o código público da conta.</small></span></div></div></section>;
}

function ScreenPreview({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => { if (video.srcObject === stream) video.srcObject = null; };
  }, [stream]);
  return <div className="firebase-screen-preview" aria-label="Prévia do compartilhamento de tela"><video ref={videoRef} muted playsInline autoPlay /><span><Video size={12} /> Sua tela está sendo compartilhada</span></div>;
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
  const [rooms, setRooms] = useState<FirebaseVoiceRoom[]>([]);
  const [members, setMembers] = useState<FirebaseVoiceMember[]>([]);
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
  const meshRef = useRef<FirebaseVoiceMesh | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [voiceStream, setVoiceStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenPreviewStream, setScreenPreviewStream] = useState<MediaStream | null>(null);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [directFriendId, setDirectFriendId] = useState<string | null>(null);
  const [directMessages, setDirectMessages] = useState<import("@/services/firebaseStore").FirebaseDirectMessage[]>([]);
  const [directBody, setDirectBody] = useState("");
  const [directCallId, setDirectCallId] = useState<string | null>(null);
  const [directCallStatus, setDirectCallStatus] = useState<"idle" | "ringing" | "connected" | "ended">("idle");
  const [directLocalStream, setDirectLocalStream] = useState<MediaStream | null>(null);
  const [directRemoteStream, setDirectRemoteStream] = useState<MediaStream | null>(null);
  const [pendingDirectSignals, setPendingDirectSignals] = useState<import("@/services/firebaseStore").FirebaseSignal[]>([]);
  const directCallRef = useRef<FirebaseDirectCall | null>(null);

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
    return subscribeToChannelMessages(community.id, channel.id, setMessages, (error) => setNotice(error.message));
  }, [community, channel, directFriendId]);

  useEffect(() => {
    if (!directFriendId) { setDirectMessages([]); return; }
    return subscribeToDirectMessages(authUser?.uid ?? "", directFriendId, setDirectMessages, (error) => setNotice(error.message));
  }, [auth.user, directFriendId]);

  useEffect(() => {
    if (!community || !channel || channel.kind !== "voice") return;
    return subscribeToVoiceMembers(community.id, channel.id, setMembers, (error) => setNotice(error.message));
  }, [community, channel]);

  useEffect(() => {
    if (!community || !voiceRoomId || !auth.user || !meshRef.current) return;
    return subscribeToSignals(voiceRoomId, auth.user.uid, (signals) => { for (const signal of signals) void meshRef.current?.handleSignal(signal); }, (error) => setNotice(error.message));
  }, [auth.user, community, voiceRoomId]);

  useEffect(() => {
    if (!community || !voiceRoomId || !auth.user) return;
    void meshRef.current?.syncMembers(members);
    void voiceService.startMicrophoneMeter();
    const timer = window.setInterval(() => {
      const isSpeaking = !muted && voiceService.getMicrophoneLevel() > 0.045;
      setLocalSpeaking(isSpeaking);
      void setVoiceSpeaking(community.id, auth.user!.uid, isSpeaking).catch(() => undefined);
    }, 180);
    return () => { window.clearInterval(timer); setLocalSpeaking(false); };

  }, [auth.user, community, voiceRoomId, voiceService, muted]);

  useEffect(() => () => voiceService.dispose(), [voiceService]);

  useEffect(() => {
    if (!currentUserId) return;
    const ids = friendships.filter((item) => item.status === "accepted").flatMap((item) => [item.requesterId, item.addresseeId]).filter((uid) => uid !== currentUserId);
    if (!ids.length) { setFriendProfiles({}); return; }
    void getProfiles(ids).then((profiles) => setFriendProfiles(Object.fromEntries(profiles.map((item) => [item.uid, item]))));
  }, [friendships, currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    return subscribeToDirectCalls(currentUserId, (calls) => {
      const incoming = calls[0];
      if (!incoming) return;
      setDirectCallId(incoming.id); setDirectFriendId(incoming.callerId); setDirectCallStatus("ringing");
      setNotice("Chamada recebida. Abra a conversa para atender.");
    }, (error) => setNotice(error.message));
  }, [currentUserId]);

  useEffect(() => {
    if (!directCallId || !currentUserId) return;
    return subscribeToDirectCallSignals(directCallId, currentUserId, (signals) => setPendingDirectSignals(signals), (error) => setNotice(error.message));
  }, [directCallId, currentUserId]);

  useEffect(() => {
    if (!directCallRef.current || !pendingDirectSignals.length) return;
    const service = directCallRef.current;
    for (const signal of pendingDirectSignals) void service.handleSignal(signal);
    setPendingDirectSignals([]);
  }, [pendingDirectSignals]);

  useEffect(() => {
    if (!currentUserId) return;
    void setPresence(currentUserId, "online").catch(() => undefined);
    const onBeforeUnload = () => { void setPresence(currentUserId, "offline"); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
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
      const local = media === "screen" ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }) : await navigator.mediaDevices.getUserMedia({ audio: true });
      const callId = await createDirectCall(currentUser.uid, directFriendId, media);
      const service = new FirebaseDirectCall({ callId, userId: currentUser.uid, localStream: local, onRemoteStream: (stream) => { setDirectRemoteStream(stream); setDirectCallStatus("connected"); }, onError: (error) => setNotice(error.message) });
      directCallRef.current = service; setPendingDirectSignals([]); setDirectLocalStream(local); setDirectRemoteStream(null); setDirectCallId(callId); setDirectCallStatus("ringing");
      await service.start(directFriendId);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível iniciar a chamada individual."); }
  };

  const acceptDirectCall = async () => {
    if (!directCallId || !directFriendId) return;
    try {
      const local = await navigator.mediaDevices.getUserMedia({ audio: true });
      const service = new FirebaseDirectCall({ callId: directCallId, userId: currentUser.uid, localStream: local, onRemoteStream: () => setDirectCallStatus("connected"), onError: (error) => setNotice(error.message) });
      directCallRef.current = service; setDirectLocalStream(local); await updateDirectCall(directCallId, "connected"); setDirectCallStatus("connected");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível atender a chamada."); }
  };

  const endDirectCall = async () => {
    if (directCallId) await updateDirectCall(directCallId, "ended").catch(() => undefined);
    directCallRef.current?.stop(); directCallRef.current = null; directLocalStream?.getTracks().forEach((track) => track.stop()); directRemoteStream?.getTracks().forEach((track) => track.stop()); setDirectLocalStream(null); setDirectRemoteStream(null); setDirectCallId(null); setDirectCallStatus("ended");
  };

  const saveDisplayName = async (displayName: string) => {
    try { await saveProfile(currentUser, { displayName }); setProfile((current) => current ? { ...current, displayName } : current); setNotice("Perfil atualizado."); } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível atualizar o perfil."); }
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

  const playTone = (kind: "join" | "leave" | "mute" | "unmute") => {
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    void context.resume().catch(() => undefined).finally(() => playVoiceToneOnContext(context, kind));
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

  const toggleScreen = async () => {
    if (!meshRef.current) return;
    try { if (screenSharing) { meshRef.current.stopScreen(); setScreenSharing(false); setScreenPreviewStream(null); } else { const stream = await meshRef.current.shareScreen(); setScreenPreviewStream(stream); setScreenSharing(true); } }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível compartilhar a tela."); }
  };

  const toggleVoice = async (room: FirebaseVoiceRoom) => {
    if (!community) return;
    const isCurrentRoom = voiceRoomId === room.id;
    try {
      if (isCurrentRoom) { await removeVoiceMember(community.id, currentUser.uid); meshRef.current?.dispose(); meshRef.current = null; voiceService.dispose(); setVoiceStream(null); setVoiceRoomId(null); setMuted(false); setLocalSpeaking(false); setScreenSharing(false); setScreenPreviewStream(null); setRemoteStreams({}); playTone("leave"); setNotice("Você saiu da sala."); }
      else {
        if (voiceRoomId) await removeVoiceMember(community.id, currentUser.uid);
        meshRef.current?.dispose();
        const localStream = await voiceService.captureMicrophone();
        setVoiceStream(localStream);
        meshRef.current = new FirebaseVoiceMesh({ roomId: room.id, userId: currentUser.uid, localStream, onRemoteStream: (peerId, stream) => setRemoteStreams((current) => ({ ...current, [peerId]: stream })), onError: (error) => setNotice(error.message), onScreenShareEnded: () => { setScreenSharing(false); setScreenPreviewStream(null); } });
        await upsertVoiceMember(community.id, { uid: currentUser.uid, roomId: room.id, displayName: profile?.displayName ?? currentUser.displayName ?? "Conta Concord", avatarUrl: profile?.avatarUrl, isSpeaking: false, muted: false });
        setVoiceRoomId(room.id);
        setMuted(false);
        playTone("join");
        setNotice("Você entrou na sala de voz.");
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível atualizar a sala."); }
  };

  if (!hasFirebaseConfig()) return <main className="firebase-config-error"><div className="firebase-config-card"><span className="firebase-config-kicker">CONFIGURAÇÃO NECESSÁRIA</span><h1>Concord está pronto, mas o Firebase ainda não foi configurado.</h1><p>Adicione as variáveis públicas do Firebase em GitHub → Settings → Secrets and variables → Actions → Variables e execute o workflow novamente.</p><code>{missingFirebaseConfigKeys.join(", ") || "VITE_FIREBASE_*"}</code><p className="firebase-config-help">As credenciais administrativas não são necessárias no frontend. Depois de salvar as variáveis, faça um novo push ou use Run workflow.</p></div></main>;

  const activeFriend = directFriendId ? friendProfiles[directFriendId] : null;
  return <div className="app-shell firebase-original-shell">
    <aside className="server-rail">
      <div className="rail-brand"><div className="logo-mark logo-mark-sm" aria-label="Concord"><WandSparkles size={17} /></div></div><div className="rail-divider" />
      <button className={activePanel === "chat" ? "server-icon home-server selected" : "server-icon home-server"} aria-label="Início" onClick={() => setActivePanel("chat")}><HomeIcon size={18} /></button><button className={activePanel === "friends" ? "server-icon friends-server selected" : "server-icon friends-server"} aria-label="Amigos" onClick={() => setActivePanel("friends")}><Users size={18} /></button><div className="rail-divider" />
      {communities.map((item) => <button key={item.id} className={community?.id === item.id ? "server-icon community-icon selected" : "server-icon community-icon"} onClick={() => { setCommunity(item); setActivePanel("chat"); }} title={item.name}>{initials(item.name)}</button>)}
      <button className="server-icon add-server" onClick={() => openCreationDialog("community")} aria-label="Criar comunidade"><Plus size={19} /></button><div className="rail-bottom"><button className={activePanel === "settings" ? "server-icon settings-server selected" : "server-icon settings-server"} onClick={() => setActivePanel("settings")} aria-label="Configurações"><Settings size={17} /></button></div>
    </aside>

    <aside className="channel-sidebar">
      <div className="community-header"><div><strong>{community?.name ?? "Seu espaço"}</strong><span>Comunidade criativa</span></div><button className="desktop-more" aria-label="Mais opções"><ChevronDown size={17} /></button></div>
      <div className="channel-scroll">
        <button className="discover-link" onClick={() => setNotice("Exploração de comunidades estará disponível em breve.")}><Compass size={15} /> Explorar comunidades</button>
        <div className="channel-group dm-group"><div className="group-label"><span>MENSAGENS DIRETAS</span><Plus size={13} /></div>{friendships.filter((item) => item.status === "accepted").length ? friendships.filter((item) => item.status === "accepted").map((item) => <button key={item.id} className="channel-link dm-link" onClick={() => setDirectFriendId(item.requesterId === currentUser.uid ? item.addresseeId : item.requesterId)}><span className="avatar bg-blue-200 text-blue-900"><Users size={12} /></span><span>Conexão ativa</span></button>) : <div className="dm-status">Nenhuma amizade aceita ainda.</div>}</div>
        {!community ? <div className="dm-status">Crie uma comunidade para começar.</div> : <><div className="channel-group"><div className="group-label"><span>CANAIS DE TEXTO</span><Plus size={13} /></div>{channels.filter((item) => item.kind === "text").length ? channels.filter((item) => item.kind === "text").map((item) => <button key={item.id} className={channel?.id === item.id ? "channel-link active" : "channel-link"} onClick={() => { setDirectFriendId(null); setChannel(item); }}><Hash size={15} />{item.name}</button>) : <div className="dm-status">Nenhum canal de texto criado ainda.</div>}</div><div className="channel-group voice-channel-group"><div className="group-label"><span>SALAS DE VOZ · {rooms.length}/3</span><button type="button" className="sidebar-add-button" onClick={() => openCreationDialog("room")} aria-label="Adicionar sala de voz" title="Adicionar sala de voz"><Plus size={13} /></button></div>{rooms.length ? rooms.map((room) => <div key={room.id}><button className={channel?.id === room.id ? "channel-link voice-link active" : "channel-link voice-link"} onClick={() => { setDirectFriendId(null); setChannel({ id: room.id, communityId: room.communityId, name: room.name, kind: "voice" }); void toggleVoice(room); }}><Volume2 size={15} /><span>{room.name}</span>{voiceRoomId === room.id && <span className="channel-live" />}</button>{voiceRoomId === room.id && <div className="voice-members"><div>{members.length ? members.length + " conectado(s)" : "Conectando..."}</div><small className="voice-note">Presença sincronizada em tempo real.</small></div>}</div>) : <div className="dm-status">Nenhuma sala de voz criada. Use + para criar a primeira.</div>}</div></>}
        <div className="side-tip"><Sparkles size={14} /><p><strong>Seu espaço, seu ritmo.</strong><br />Convide pessoas para construir junto.</p></div>
      </div>
      {voiceRoomId && <div className="voice-sidebar-dock"><div className="voice-sidebar-dock-title"><Volume2 size={14} /><div><strong>{rooms.find((room) => room.id === voiceRoomId)?.name ?? "Sala de voz"}</strong><span>{members.length || 1} conectado(s)</span></div></div><div className="voice-sidebar-dock-actions"><button className={muted ? "is-active" : ""} onClick={toggleMute} aria-label={muted ? "Ativar microfone" : "Mutar microfone"}><Mic size={14} /></button><button className={screenSharing ? "is-active" : ""} onClick={() => void toggleScreen()} aria-label={screenSharing ? "Parar compartilhamento de tela" : "Compartilhar tela"}><Video size={14} /></button><button className="leave-call" onClick={() => { const room = rooms.find((item) => item.id === voiceRoomId); if (room) void toggleVoice(room); }} aria-label="Sair da call"><PhoneOff size={14} /></button></div></div>}
      <div className="user-panel"><button className="user-identity" onClick={() => setNotice("Perfil autenticado: " + (profile?.displayName ?? currentUser.displayName ?? "Conta Concord"))}><span className="avatar bg-slate-200 text-slate-900"><span>{initials(profile?.displayName ?? currentUser.displayName ?? "Conta")}</span><span className="online-dot" /></span><div className="user-meta"><strong>{profile?.displayName ?? currentUser.displayName ?? "Conta Concord"}</strong><span>{profile?.publicId ?? "CON-00000000"}</span></div></button><button className={muted ? "control-active" : ""} onClick={toggleMute} aria-label="Alternar microfone"><Mic size={15} /></button><button onClick={() => void auth.logout()} aria-label="Sair da conta"><MoreHorizontal size={16} /></button></div>
    </aside>

    <main className="content-area">
      <header className="content-header"><div className="mobile-nav-actions"><button aria-label="Abrir canais" onClick={() => setActivePanel("chat")}><Compass size={17} /></button><button aria-label="Abrir amigos" onClick={() => setActivePanel("friends")}><Users size={17} /></button><button aria-label="Abrir perfil" onClick={() => setActivePanel("profile")}><Settings size={17} /></button></div><div className="channel-title"><div className="title-symbol"><Hash size={18} /></div><div><h2>{directFriendId ? "Mensagem direta" : channel?.name ?? "geral"}</h2><span>{channel?.kind === "voice" ? "Sala de voz em tempo real." : "Um espaço para começar qualquer conversa."}</span></div></div><div className="header-actions"><button title="Notificações" onClick={() => setNotice("Você está em dia.")}><Bell size={17} /></button><button title="Abrir Amigos" onClick={() => { setActivePanel("friends"); setSocialOpen(false); }}><Search size={17} /></button><button title="Abrir ou recolher membros" onClick={() => setMembersOpen((open) => !open)}><Users size={17} /></button><div className="header-divider" /><button className="profile-chip" onClick={() => setActivePanel("profile")}><span className="avatar bg-amber-200 text-amber-900"><span>{initials(profile?.displayName ?? currentUser.displayName ?? "Conta")}</span><span className="online-dot" /></span><span>{profile?.displayName ?? currentUser.displayName ?? "Conta Concord"}</span><ChevronDown size={14} /></button></div></header>
      {notice && <div className="firebase-notice" role="status">{notice}</div>}
      {activePanel === "chat" ? <>
      {directFriendId ? <><section className="message-area"><div className="direct-chat-toolbar"><div className="direct-chat-identity"><span className="avatar bg-blue-200 text-blue-900">{initials(activeFriend?.displayName ?? "Amigo")}</span><div><strong>{activeFriend?.displayName ?? "Conversa direta"}</strong><small>{activeFriend?.presence === "online" ? "Online" : activeFriend?.presence === "away" ? "Ocupado" : "Indisponível"}</small></div></div><div className="direct-chat-actions"><button onClick={() => void startDirectCall("audio")} aria-label="Iniciar chamada de áudio"><Headphones size={16} /></button><button onClick={() => setSocialOpen(true)} aria-label="Convidar para o grupo"><UserPlus size={16} /></button><button onClick={() => void startDirectCall("screen")} aria-label="Compartilhar tela na conversa"><Video size={16} /></button>{directCallStatus === "ringing" && !directCallRef.current ? <button onClick={() => void acceptDirectCall()} aria-label="Atender chamada"><Headphones size={16} /></button> : null}{directCallStatus !== "idle" && directCallStatus !== "ended" ? <button onClick={() => void endDirectCall()} aria-label="Encerrar chamada"><PhoneOff size={16} /></button> : null}<button onClick={() => { if (directFriendId) void deleteDirect(directFriendId); }} aria-label="Apagar conversa"><X size={16} /></button></div></div>{directLocalStream && <div className="direct-media-preview"><ScreenPreview stream={directLocalStream} /><span className="direct-call-state">{directCallStatus === "connected" ? "Chamada conectada" : "Chamando..."}</span></div>}{directRemoteStream && <audio autoPlay ref={(element) => { if (element) element.srcObject = directRemoteStream; }} /> }<div className="channel-intro"><div className="intro-symbol"><MessageCircle size={27} /></div><h1>Conversa com {activeFriend?.displayName ?? "seu amigo"}</h1><p>Mensagens diretas com sua conexão.</p><div className="intro-rule" /></div><div className="message-list">{directMessages.length ? directMessages.map((item) => <article className="message-row" key={item.id}><span className="avatar bg-blue-200 text-blue-900">{initials(item.authorId)}</span><div className="message-copy"><div className="message-author"><strong>{item.authorId === currentUser.uid ? "Você" : item.authorId}</strong><span>@conexão</span><time>agora</time></div><p>{item.body}</p></div></article>) : <div className="empty-state">Nenhuma mensagem nesta conversa ainda.</div>}</div></section><div className="composer-wrap"><div className="composer"><Input value={directBody} onChange={(event) => setDirectBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void sendDirect(); }} placeholder="Mensagem direta" /><button className="send-button" onClick={() => void sendDirect()} aria-label="Enviar mensagem direta"><Send size={17} /></button></div></div></> : channel?.kind === "voice" ? <section className="message-area firebase-voice-original-stage"><div className="channel-intro"><div className="intro-symbol"><Headphones size={27} /></div><h1>{channel.name}</h1><p>{members.length} participante(s) sincronizado(s) pelo Firestore.</p><div className="intro-rule" /></div><div className="firebase-member-grid">{members.length ? members.map((member) => <div className={member.isSpeaking || (member.uid === currentUser.uid && localSpeaking) ? "firebase-member speaking" : "firebase-member"} key={member.uid}><span className={member.isSpeaking || (member.uid === currentUser.uid && localSpeaking) ? "avatar bg-blue-200 text-blue-900 speaking-avatar" : "avatar bg-blue-200 text-blue-900"}>{initials(member.displayName)}</span><strong>{member.displayName}</strong></div>) : <div className="empty-state">Ninguém na sala ainda.</div>}</div>{screenPreviewStream && <ScreenPreview stream={screenPreviewStream} />}<div className="call-actions firebase-voice-actions"><button className={muted ? "control-active" : ""} onClick={toggleMute} disabled={!voiceRoomId} aria-label="Mutar microfone"><Mic size={16} /></button><button className={screenSharing ? "control-active" : ""} onClick={() => void toggleScreen()} disabled={!voiceRoomId} aria-label="Compartilhar tela"><Video size={16} /></button><button className="disconnect" onClick={() => { const room = rooms.find((item) => item.id === channel.id); if (room) void toggleVoice(room); }} aria-label="Sair da sala"><PhoneOff size={16} /></button></div></section> : <><section className="message-area"><div className="channel-intro"><div className="intro-symbol"><Hash size={27} /></div><h1>Bem-vindo ao #{channel?.name ?? "geral"}</h1><p>Este é o começo do canal. Um bom lugar para dizer olá.</p><div className="intro-rule" /></div><div className="message-list">{messages.length ? messages.map((item) => <article className="message-row" key={item.id}><span className="avatar bg-blue-200 text-blue-900">{initials(item.authorId)}</span><div className="message-copy"><div className="message-author"><strong>{item.authorId === currentUser.uid ? "Você" : "Concord"}</strong><span>@concord</span><time>agora</time></div><p>{item.body}</p></div></article>) : <article className="message-row"><span className="avatar bg-blue-100 text-blue-900">CO</span><div className="message-copy"><div className="message-author"><strong>Concord</strong><span>@concord</span><time>agora</time></div><p>Bem-vindo ao Concord. Esta é a primeira mensagem deste canal.</p></div></article>}</div></section><div className="composer-wrap"><div className="composer"><button aria-label="Mais opções"><Plus size={19} /></button><Input value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void sendMessage(); }} placeholder={"Mensagem em #" + (channel?.name ?? "geral")} /><button onClick={() => void sendMessage()} className="send-button" aria-label="Enviar mensagem"><Send size={17} /></button></div><span className="composer-hint">Enter para enviar <span>•</span> Shift + Enter para nova linha</span></div></>}
      </> : activePanel === "friends" ? <FriendsPanel currentUid={currentUser.uid} searchValue={search} results={results} friendships={friendships} friendProfiles={friendProfiles} invites={invites} onOpenChat={(uid) => { setDirectFriendId(uid); setActivePanel("chat"); }} onSearchValueChange={setSearch} onSearch={() => void searchProfiles()} onAddFriend={(target) => void addFriend(target)} onRespondFriend={(request, status) => void respondFriend(request, status)} onRespondInvite={(invite, status) => void respondInvite(invite, status)} /> : activePanel === "profile" ? <ProfilePanel profile={profile} email={currentUser.email ?? ""} onSave={(name) => void saveDisplayName(name)} /> : <SettingsPanel onVoiceSettings={() => setNotice("Entre em uma sala para testar o microfone; a permissão será solicitada pelo navegador.")} />}
    </main>

    <aside className={membersOpen ? "member-sidebar" : "member-sidebar collapsed"}><div className="member-heading"><span>MEMBROS — {friendships.filter((item) => item.status === "accepted").length}</span><button onClick={() => setNotice("Membros sincronizados pelo Firebase.")} aria-label="Mais opções"><MoreHorizontal size={17} /></button></div><div className="member-group"><span className="member-role">CONEXÕES</span>{friendships.filter((item) => item.status === "accepted").map((item) => <button className="member-card" key={item.id} onClick={() => setDirectFriendId(item.requesterId === currentUser.uid ? item.addresseeId : item.requesterId)}><span className="avatar bg-blue-200 text-blue-900"><Users size={13} /></span><div><strong>{friendProfiles[item.requesterId === currentUser.uid ? item.addresseeId : item.requesterId]?.displayName ?? "Conexão"}</strong><span>{friendProfiles[item.requesterId === currentUser.uid ? item.addresseeId : item.requesterId]?.presence === "online" ? "Online" : friendProfiles[item.requesterId === currentUser.uid ? item.addresseeId : item.requesterId]?.presence === "away" ? "Ocupado" : "Indisponível"}</span></div></button>)}{!friendships.filter((item) => item.status === "accepted").length && <div className="empty-state">Nenhuma conexão aceita.</div>}</div>{voiceRoomId && <div className="call-dock"><div className="call-status"><span className="call-pulse" /><div><strong>{rooms.find((room) => room.id === voiceRoomId)?.name ?? "Sala de voz"}</strong><span>{members.length || 1} pessoa(s) na sala</span></div><button onClick={() => setNotice("Convite de sala disponível quando houver conexões.")} aria-label="Convidar"><UserPlus size={15} /></button></div><div className="call-actions"><button className={muted ? "control-active" : ""} onClick={toggleMute} aria-label="Mutar microfone"><Mic size={16} /></button><button className={screenSharing ? "control-active" : ""} onClick={() => void toggleScreen()} aria-label="Compartilhar tela"><Video size={16} /></button><button className="disconnect" onClick={() => { const room = rooms.find((item) => item.id === voiceRoomId); if (room) void toggleVoice(room); }} aria-label="Sair da call"><X size={16} /></button></div></div>}</aside>
    {creationTarget && <CreationDialog target={creationTarget} value={creationName} error={creationError} pending={creationPending} onChange={setCreationName} onClose={closeCreationDialog} onSubmit={() => void submitCreation()} />}
    {socialOpen && <SocialDialog currentPublicId={profile?.publicId ?? "CON-00000000"} searchValue={search} results={results} friendships={friendships} invites={invites} currentUid={currentUser.uid} community={community} onSearchValueChange={setSearch} onSearch={() => void searchProfiles()} onAddFriend={(target) => void addFriend(target)} onInvite={(targetUid) => void inviteFriend(targetUid)} onRespondInvite={(invite, status) => void respondInvite(invite, status)} onClose={() => setSocialOpen(false)} />}
  </div>;
}
