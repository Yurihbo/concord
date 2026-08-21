import { useEffect, useMemo, useRef, useState } from "react";
import { Headphones, LogOut, MessageCircle, Mic, Plus, Radio, Search, Send, Users, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FirebaseAuthPanel } from "@/components/FirebaseAuthPanel";
import { ConcordWebRTCService } from "@/services/webrtc";
import { FirebaseVoiceMesh } from "@/services/firebaseVoiceMesh";
import { playVoiceToneOnContext } from "@/services/voiceActivity";
import { subscribeToSignals } from "@/services/firebaseSignaling";
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";
import { hasFirebaseConfig, missingFirebaseConfigKeys } from "@/lib/firebase";
import {
  createCommunity,
  createFriendRequest,
  createVoiceRoom,
  getProfile,
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
  upsertVoiceMember,
  type FirebaseChannel,
  type FirebaseCommunity,
  type FirebaseFriendship,
  type FirebaseMessage,
  type FirebaseProfile,
  type FirebaseVoiceMember,
  type FirebaseVoiceRoom,
} from "@/services/firebaseStore";

function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "CO"; }
function currentUserId(user: { uid: string } | null): string { return user?.uid ?? ""; }

export default function FirebaseWorkspace() {
  const auth = useFirebaseAuth();
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
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceService] = useState(() => new ConcordWebRTCService());
  const [voiceRoomId, setVoiceRoomId] = useState<string | null>(null);
  const meshRef = useRef<FirebaseVoiceMesh | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [voiceStream, setVoiceStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [directFriendId, setDirectFriendId] = useState<string | null>(null);
  const [directMessages, setDirectMessages] = useState<import("@/services/firebaseStore").FirebaseDirectMessage[]>([]);
  const [directBody, setDirectBody] = useState("");

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
    return subscribeToDirectMessages(currentUserId(auth.user), directFriendId, setDirectMessages, (error) => setNotice(error.message));
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
    voiceService.startMicrophoneMeter();
    const timer = window.setInterval(() => {
      const isSpeaking = voiceService.getMicrophoneLevel() > 0.08;
      void setVoiceSpeaking(community.id, auth.user!.uid, isSpeaking).catch(() => undefined);
    }, 180);
    return () => { window.clearInterval(timer); };
  }, [auth.user, community, voiceRoomId, voiceService]);

  useEffect(() => () => voiceService.dispose(), [voiceService]);

  const acceptedFriendIds = useMemo(() => new Set(friendships.filter((item) => item.status === "accepted").map((item) => item.requesterId === auth.user?.uid ? item.addresseeId : item.requesterId)), [friendships, auth.user?.uid]);

  if (auth.loading) return <div className="loading-screen"><span>Preparando seu espaço Firebase...</span></div>;
  if (!auth.user) return <FirebaseAuthPanel />;
  const currentUser = auth.user;

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

  const addFriend = async (target: FirebaseProfile) => {
    try {
      await createFriendRequest(currentUser.uid, target.uid);
      setNotice("Solicitação enviada.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível enviar a solicitação."); }
  };

  const createNewCommunity = async () => {
    const name = window.prompt("Nome da comunidade");
    if (!name?.trim()) return;
    try {
      const id = await createCommunity(currentUser.uid, name.trim());
      const created = { id, name: name.trim(), ownerId: currentUser.uid };
      setCommunities((current) => [...current, created]);
      setCommunity(created);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível criar a comunidade."); }
  };

  const createNewRoom = async () => {
    if (!community) return;
    const name = window.prompt("Nome da sala de voz");
    if (!name?.trim()) return;
    try { await createVoiceRoom(community.id, name.trim()); setNotice("Sala criada."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível criar a sala."); }
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
    playTone(nextMuted ? "mute" : "unmute");
  };

  const toggleScreen = async () => {
    if (!meshRef.current) return;
    try { if (screenSharing) { meshRef.current.stopScreen(); setScreenSharing(false); } else { await meshRef.current.shareScreen(); setScreenSharing(true); } }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível compartilhar a tela."); }
  };

  const toggleVoice = async (room: FirebaseVoiceRoom) => {
    if (!community) return;
    const existing = members.find((member) => member.uid === currentUser.uid && member.roomId === room.id);
    try {
      if (existing) { await removeVoiceMember(community.id, currentUser.uid); meshRef.current?.dispose(); meshRef.current = null; voiceService.dispose(); setVoiceStream(null); setVoiceRoomId(null); setMuted(false); setScreenSharing(false); playTone("leave"); setNotice("Você saiu da sala."); }
      else {
        const localStream = await voiceService.captureMicrophone();
        setVoiceStream(localStream);
        meshRef.current = new FirebaseVoiceMesh({ roomId: room.id, userId: currentUser.uid, localStream, onRemoteStream: (peerId, stream) => setRemoteStreams((current) => ({ ...current, [peerId]: stream })), onError: (error) => setNotice(error.message) });
        await upsertVoiceMember(community.id, { uid: currentUser.uid, roomId: room.id, displayName: profile?.displayName ?? currentUser.displayName ?? "Conta Concord", avatarUrl: profile?.avatarUrl, isSpeaking: false, muted: false });
        setVoiceRoomId(room.id);
        setMuted(false);
        playTone("join");
        setNotice("Você entrou na sala de voz.");
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível atualizar a sala."); }
  };

  if (!hasFirebaseConfig()) return <main className="firebase-config-error"><div className="firebase-config-card"><span className="firebase-config-kicker">CONFIGURAÇÃO NECESSÁRIA</span><h1>Concord está pronto, mas o Firebase ainda não foi configurado.</h1><p>Adicione as variáveis públicas do Firebase em GitHub → Settings → Secrets and variables → Actions → Variables e execute o workflow novamente.</p><code>{missingFirebaseConfigKeys.join(", ") || "VITE_FIREBASE_*"}</code><p className="firebase-config-help">As credenciais administrativas não são necessárias no frontend. Depois de salvar as variáveis, faça um novo push ou use Run workflow.</p></div></main>;

  return <main className="firebase-workspace"><aside className="firebase-sidebar"><div className="firebase-brand">CONCORD</div><div className="firebase-community-list">{communities.map((item) => <button key={item.id} className={community?.id === item.id ? "firebase-community active" : "firebase-community"} onClick={() => setCommunity(item)}>{initials(item.name)}</button>)}<button className="firebase-community add" onClick={createNewCommunity} aria-label="Criar comunidade"><Plus size={17} /></button></div><div className="firebase-sidebar-user"><span className="firebase-avatar">{initials(profile?.displayName ?? currentUser.displayName ?? "Conta")}</span><div><strong>{profile?.displayName ?? currentUser.displayName ?? "Conta Concord"}</strong><small>{profile?.publicId ?? "CON-00000000"}</small></div><button onClick={() => void auth.logout()} aria-label="Sair"><LogOut size={15} /></button></div></aside><aside className="firebase-channel-sidebar"><header><strong>{community?.name ?? "Seu espaço"}</strong><span>FIREBASE REALTIME</span></header><div className="firebase-channel-list"><span className="firebase-label">CANAIS</span>{channels.filter((item) => item.kind === "text").map((item) => <button key={item.id} className={channel?.id === item.id ? "active" : ""} onClick={() => setChannel(item)}># {item.name}</button>)}<span className="firebase-label voice-label">SALAS DE VOZ <button onClick={createNewRoom} aria-label="Criar sala de voz"><Plus size={14} /></button></span>{rooms.map((room) => <button key={room.id} className={channel?.id === room.id ? "voice active" : "voice"} onClick={() => { const voice = { id: room.id, communityId: room.communityId, name: room.name, kind: "voice" as const }; setChannel(voice); void toggleVoice(room); }}><Volume2 size={14} /> {room.name}</button>)}</div></aside><section className="firebase-chat"><header className="firebase-chat-header"><div><span className="firebase-kicker">{directFriendId ? "MENSAGEM DIRETA" : channel?.kind === "voice" ? "SALA DE VOZ" : "CANAL DE TEXTO"}</span><h1>{directFriendId ? "Conversa privada" : channel?.name ?? "Boas-vindas"}</h1></div><div className="firebase-header-actions"><button onClick={() => setSearch((current) => current ? "" : "CON-")} aria-label="Buscar amigos"><Search size={17} /></button><button onClick={() => setNotice(`${acceptedFriendIds.size} amigos conectados.`)} aria-label="Ver amigos"><Users size={17} /></button></div></header>{notice && <div className="firebase-notice" role="status">{notice}</div>}{directFriendId ? <><div className="firebase-message-list">{directMessages.length ? directMessages.map((item) => <article key={item.id}><span className="firebase-avatar">{initials(item.authorId)}</span><div><strong>{item.authorId === currentUser.uid ? "Você" : item.authorId}</strong><p>{item.body}</p></div></article>) : <div className="firebase-empty"><MessageCircle size={26} /><p>Esta conversa ainda não tem mensagens.</p></div>}</div><div className="firebase-composer"><Input value={directBody} onChange={(event) => setDirectBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void sendDirect(); }} placeholder="Mensagem direta" /><Button onClick={() => void sendDirect()} disabled={!directBody.trim()} aria-label="Enviar mensagem direta"><Send size={17} /></Button></div></> : channel?.kind === "voice" ? <div className="firebase-voice-stage"><Headphones size={34} /><h2>{channel.name}</h2><p>{members.length} participante(s) sincronizado(s) pelo Firestore.</p><div className="firebase-member-grid">{members.map((member) => <div className={member.isSpeaking ? "firebase-member speaking" : "firebase-member"} key={member.uid}><span className="firebase-avatar">{initials(member.displayName)}</span><span>{member.displayName}</span></div>)}{Object.entries(remoteStreams).map(([peerId, stream]) => <audio key={peerId} autoPlay ref={(element) => { if (element) element.srcObject = stream; }} />)}</div><div className="firebase-voice-controls"><Button className="primary-cta" onClick={toggleMute} disabled={!voiceRoomId}><Mic size={16} /> {muted ? "Ativar microfone" : "Mutar microfone"}</Button><Button variant="outline" onClick={() => void toggleScreen()} disabled={!voiceRoomId}><Radio size={16} /> {screenSharing ? "Parar tela" : "Compartilhar tela"}</Button><Button variant="outline" onClick={() => { const room = rooms.find((item) => item.id === channel.id); if (room) void toggleVoice(room); }}><Headphones size={16} /> {voiceRoomId ? "Sair da sala" : "Entrar na sala"}</Button></div></div> : <><div className="firebase-message-list">{messages.length ? messages.map((item) => <article key={item.id}><span className="firebase-avatar">{initials(item.authorId)}</span><div><strong>{item.authorId === currentUser.uid ? "Você" : item.authorId}</strong><p>{item.body}</p></div></article>) : <div className="firebase-empty"><MessageCircle size={26} /><p>Este canal ainda não tem mensagens.</p></div>}</div><div className="firebase-composer"><Input value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void sendMessage(); }} placeholder={`Mensagem em #${channel?.name ?? "geral"}`} /><Button onClick={() => void sendMessage()} disabled={loading || !body.trim()} aria-label="Enviar mensagem"><Send size={17} /></Button></div></>}</section><aside className="firebase-right-panel"><div className="firebase-right-heading"><span>AMIGOS</span><small>{acceptedFriendIds.size}</small></div><div className="firebase-friend-search"><Input value={search} onChange={(event) => { const value = event.target.value.toUpperCase(); setSearch(value); if (/^CON-[A-Z0-9]{8}$/.test(value)) void searchProfilesByPublicId(value).then(setResults); }} placeholder="CON-XXXXXXXX" /></div>{results.map((target) => <div className="firebase-search-result" key={target.uid}><span className="firebase-avatar">{initials(target.displayName)}</span><div><strong>{target.displayName}</strong><small>{target.publicId}</small></div><button onClick={() => void addFriend(target)} aria-label="Adicionar amigo"><Plus size={14} /></button></div>)}{friendships.filter((item) => item.status === "pending" && item.addresseeId === currentUser.uid).map((request) => <div className="firebase-request" key={request.id}><span>Nova solicitação</span><div><button onClick={() => void respondFriend(request, "accepted")}>Aceitar</button><button onClick={() => void respondFriend(request, "declined")}>Recusar</button></div></div>)}<div className="firebase-friend-list">{friendships.filter((item) => item.status === "accepted").map((item) => { const friendId = item.requesterId === currentUser.uid ? item.addresseeId : item.requesterId; return <button key={item.id} onClick={() => setDirectFriendId(friendId)}><span className="firebase-avatar small"><Users size={13} /></span><span>Conexão ativa</span></button>; })}</div></aside></main>;
}
