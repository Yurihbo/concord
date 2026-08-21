import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ConcordWebRTCService } from "@/services/webrtc";
import { getVoiceParticipantEvents, getVoiceSwitchResetChannel, playVoiceToneOnContext } from "@/services/voiceActivity";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  Compass,
  Hash,
  Headphones,
  Home as HomeIcon,
  LogIn,
  MessageCircle,
  Mic,
  MoreHorizontal,
  PhoneOff,
  Plus,
  Radio,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  UserPlus,
  Users,
  Video,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";

const communities = [
  { name: "Concord Lab", short: "CL", tone: "from-blue-400 to-indigo-600", unread: 3 },
  { name: "Studio Norte", short: "SN", tone: "from-cyan-400 to-blue-600", unread: 0 },
  { name: "Nocturne", short: "N", tone: "from-violet-500 to-fuchsia-600", unread: 7 },
];

const channels = [
  { category: "COMEÇANDO", items: [{ name: "boas-vindas", icon: "#" }, { name: "anúncios", icon: "#" }] },
  { category: "CONVERSAS", items: [{ name: "geral", icon: "#" }, { name: "ideias", icon: "#" }, { name: "referências", icon: "#" }] },
];

const friends = [
  { name: "Maya Torres", status: "Em uma conversa", initials: "MT", tone: "bg-amber-200 text-amber-900" },
  { name: "Ravi Mendes", status: "Disponível", initials: "RM", tone: "bg-blue-200 text-blue-900" },
  { name: "Clara Ono", status: "Ouvindo música", initials: "CO", tone: "bg-emerald-200 text-emerald-900" },
];

function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "logo-mark logo-mark-sm" : "logo-mark"} aria-label="Concord">
      <WandSparkles size={compact ? 17 : 22} strokeWidth={2.3} />
    </div>
  );
}

function Avatar({ initials, tone, online = false, speaking = false }: { initials: string; tone: string; online?: boolean; speaking?: boolean }) {
  return (
    <span className={`avatar ${tone} ${speaking ? "speaking-avatar" : ""}`} aria-label={speaking ? "Transmitindo voz" : undefined}>
      {initials}
      {online && <span className="online-dot" />}
      {speaking && <span className="speaking-ring" aria-hidden="true" />}
    </span>
  );
}

function Landing({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="landing-shell">
      <div className="landing-glow landing-glow-one" />
      <div className="landing-glow landing-glow-two" />
      <nav className="landing-nav">
        <div className="brand-lockup"><LogoMark /><span>CONCORD</span></div>
        <div className="landing-nav-actions"><a href="#principles">Princípios</a><a href="#experience">Experiência</a><Button variant="outline" className="nav-login" onClick={onLogin}><LogIn size={16} /> Entrar</Button></div>
      </nav>
      <section className="landing-hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> Conversas que encontram seu ritmo</div>
          <h1>O lugar onde boas ideias <em>convergem.</em></h1>
          <p>Concord é uma plataforma elegante para comunidades que querem conversar com clareza, criar com intenção e manter as pessoas próximas.</p>
          <div className="hero-actions"><Button className="primary-cta" onClick={onLogin}>Começar agora <ArrowRight size={17} /></Button><a className="text-link" href="#experience">Conheça a experiência <ChevronDown size={15} /></a></div>
          <div className="hero-note"><Shield size={14} /> Acesso seguro via Manus OAuth</div>
        </div>
        <div className="hero-art" aria-label="Prévia do Concord">
          <div className="orbit orbit-a" /><div className="orbit orbit-b" />
          <div className="preview-window">
            <div className="preview-top"><div className="preview-dots"><i /><i /><i /></div><span>concord / studio-norte</span><MoreHorizontal size={16} /></div>
            <div className="preview-body">
              <div className="preview-rail"><LogoMark compact /><span className="rail-line active" /><span className="rail-line" /><span className="rail-line" /></div>
              <div className="preview-sidebar"><strong>Studio Norte</strong><small>COMUNIDADE CRIATIVA</small><div className="preview-channel active"><Hash size={13} /> geral</div><div className="preview-channel"><Hash size={13} /> ideias</div><div className="preview-channel"><Hash size={13} /> referências</div><div className="mini-voice"><Volume2 size={14} /><span>Estúdio aberto</span><Radio size={12} /></div></div>
              <div className="preview-chat"><div className="chat-heading"><div><h3># geral</h3><p>Um espaço para começar qualquer conversa.</p></div><div className="chat-tools"><Search size={15} /><Bell size={15} /><Users size={15} /></div></div><div className="preview-messages"><div className="preview-message"><span className="fake-avatar blue">C</span><div><b>Concord <small>agora</small></b><p>Bem-vindo ao Concord. Este é o começo da conversa.</p></div></div></div><div className="preview-input">Escreva uma mensagem... <Send size={14} /></div></div>
            </div>
          </div>
        </div>
      </section>
      <section id="principles" className="principles"><div className="section-kicker">A diferença está nos detalhes</div><h2>Menos ruído. Mais presença.</h2><div className="principle-grid"><div><Sparkles size={18} /><h3>Clareza por padrão</h3><p>Uma arquitetura visual que organiza pessoas, contextos e conversas sem ocupar seu espaço mental.</p></div><div><Radio size={18} /><h3>Ritmo em tempo real</h3><p>Mensagens, salas e presença se movem com naturalidade, mantendo você no pulso da comunidade.</p></div><div><Shield size={18} /><h3>Feito para confiar</h3><p>Autenticação segura e uma base preparada para crescer com suas comunidades.</p></div></div></section>
      <section id="experience" className="experience-strip"><div><span className="section-kicker">Uma nova forma de estar junto</span><h2>Suas comunidades, em um só lugar.</h2></div><Button className="secondary-cta" onClick={onLogin}>Entrar no Concord <ArrowRight size={17} /></Button></section>
      <footer className="landing-footer"><div className="brand-lockup"><LogoMark compact /><span>CONCORD</span></div><span>Comunicação simples e intencional.</span><span>© 2026 Concord</span></footer>
    </main>
  );
}

function Workspace({ onLogout, userName, userId, publicId }: { onLogout: () => void; userName: string; userId?: number; publicId?: string }) {
  const [activeCommunity, setActiveCommunity] = useState(0);
  const [activeChannel, setActiveChannel] = useState("geral");
  const [message, setMessage] = useState("");
  const [sentMessages, setSentMessages] = useState<string[]>([]);
  const [view, setView] = useState<"home" | "friends">("home");
  const [muted, setMuted] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const lastPublishedSpeaking = useRef<boolean | null>(null);
  const [deafened, setDeafened] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [activeVoiceId, setActiveVoiceId] = useState<number | null>(null);
  const [voiceStream, setVoiceStream] = useState<MediaStream | null>(null);
  const [webrtc] = useState(() => new ConcordWebRTCService());
  const [createOpen, setCreateOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [newCommunity, setNewCommunity] = useState("");
  const [newVoiceName, setNewVoiceName] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"closed" | "channels">("closed");
  const [profileName, setProfileName] = useState(userName);
  const [profileAvatar, setProfileAvatar] = useState("");
  const communityMutation = trpc.communities.create.useMutation();
  const profileMutation = trpc.profile.update.useMutation({ onSuccess: () => { toast.success("Perfil atualizado"); setProfileOpen(false); } });
  const [activeDm, setActiveDm] = useState<string | null>(null);
  const [dmThreadId, setDmThreadId] = useState<number | null>(null);
  const openDm = trpc.dms.open.useMutation({ onSuccess: (threadId) => setDmThreadId(threadId) });
  const friendshipsQuery = trpc.friends.list.useQuery(undefined, { refetchInterval: 10000 });
  const communitiesQuery = trpc.communities.list.useQuery(undefined, { refetchInterval: 15000 });
  const communityItems = communitiesQuery.data ?? [];
  const selectedCommunityId = communityItems[activeCommunity]?.community.id;
  const channelsQuery = trpc.communities.channels.useQuery({ communityId: selectedCommunityId ?? 0 }, { enabled: Boolean(selectedCommunityId) });
  const voiceQuery = trpc.communities.voice.useQuery({ communityId: selectedCommunityId ?? 0 }, { enabled: Boolean(selectedCommunityId) });
  const voiceMutation = trpc.communities.createVoice.useMutation({ onSuccess: () => { toast.success("Sala de voz criada"); setNewVoiceName(""); setVoiceOpen(false); voiceQuery.refetch(); }, onError: (error) => toast.error(error.message || "Não foi possível criar a sala de voz") });
  const channelItems = (channelsQuery.data ?? []).filter((channel) => channel.kind === "text");
  const voiceItems = voiceQuery.data ?? [];
  const voiceParticipantsQuery = trpc.communities.participants.useQuery({ channelId: activeVoiceId ?? 0 }, { enabled: Boolean(activeVoiceId), refetchInterval: 3000 });
  const joinVoiceMutation = trpc.communities.join.useMutation();
  const leaveVoiceMutation = trpc.communities.leave.useMutation();
  const voiceActivityMutation = trpc.communities.activity.useMutation();
  const isSpeaking = Boolean(activeVoiceId && !muted && voiceStream?.getAudioTracks().some((track) => track.enabled) && voiceLevel >= 0.08);
  const selectedChannelId = channelItems.find((channel) => channel.name === activeChannel)?.id;
  const channelMessagesQuery = trpc.messages.list.useQuery({ channelId: selectedChannelId ?? 0, limit: 50 }, { enabled: Boolean(selectedChannelId), refetchInterval: 5000 });
  const sendChannelMessage = trpc.messages.send.useMutation({ onSuccess: () => channelMessagesQuery.refetch() });
  const dmContacts = (friendshipsQuery.data ?? []).filter((entry) => entry.friendship.status === "accepted" && entry.user).map((entry) => ({ id: entry.user!.id, name: entry.user!.name ?? `Conexão ${entry.user!.id}`, initials: (entry.user!.name ?? "CO").slice(0, 2).toUpperCase() }));
  const displayName = userName || "Você";
  const activeName = communityItems[activeCommunity]?.community.name ?? communities[activeCommunity]?.name ?? "Concord Lab";
  const backendMessages = (channelMessagesQuery.data ?? []).map((item) => ({ name: item.author.name ?? "Concord", handle: "@membro", time: new Date(item.message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), initials: (item.author.name ?? "CO").slice(0, 2).toUpperCase(), tone: "bg-slate-200 text-slate-900", text: item.message.body }));
  const visibleMessages = useMemo(() => [...(backendMessages.length ? backendMessages : [{ name: "Concord", handle: "@concord", time: "agora", initials: "CO", tone: "bg-blue-100 text-blue-900", text: "Bem-vindo ao Concord. Esta é a primeira mensagem deste canal." }]), ...sentMessages.map((text) => ({ name: displayName, handle: "@você", time: "agora", initials: "VC", tone: "bg-slate-200 text-slate-900", text }))], [backendMessages, displayName, sentMessages]);

  const sendMessage = () => {
    if (!message.trim()) return;
    const body = message.trim();
    if (selectedChannelId) sendChannelMessage.mutate({ channelId: selectedChannelId, body });
    else setSentMessages((current) => [...current, body]);
    setMessage("");
  };

  const joinVoice = async (voiceId: number, voiceName: string) => { try { if (activeVoiceId === voiceId) { voiceStream?.getTracks().forEach((track) => track.stop()); voiceActivityMutation.mutate({ channelId: voiceId, isSpeaking: false }); playVoiceRoomTone("leave"); leaveVoiceMutation.mutate({ channelId: voiceId }); webrtc.dispose(); setVoiceStream(null); setActiveVoiceId(null); setMuted(false); setVoiceLevel(0); lastPublishedSpeaking.current = null; toast.success(`Você saiu de ${voiceName}`); return; } const resetChannelId = getVoiceSwitchResetChannel(activeVoiceId, voiceId); if (resetChannelId) voiceActivityMutation.mutate({ channelId: resetChannelId, isSpeaking: false });
    lastPublishedSpeaking.current = null;
    voiceStream?.getTracks().forEach((track) => track.stop()); const stream = await webrtc.captureMicrophone(); webrtc.startMicrophoneMeter(); await joinVoiceMutation.mutateAsync({ channelId: voiceId }); playVoiceRoomTone("join"); setVoiceStream(stream); setActiveVoiceId(voiceId); setActiveChannel(voiceName); setView("home"); setMobilePanel("closed"); toast.success(`Você entrou em ${voiceName}`); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível entrar na sala de voz."); } };

  const voiceAudioContext = useRef<AudioContext | null>(null);
  const playVoiceRoomTone = (kind: "join" | "leave" | "mute" | "unmute") => { const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AudioContextClass) return; const context = voiceAudioContext.current ?? new AudioContextClass(); voiceAudioContext.current = context; void context.resume().catch(() => undefined); try { playVoiceToneOnContext(context, kind); } catch { /* áudio opcional não deve interromper a call */ } };
  const toggleVoiceMute = () => { const nextMuted = !muted; voiceStream?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; }); setMuted(nextMuted); playVoiceRoomTone(nextMuted ? "mute" : "unmute"); };
  const previousVoiceParticipants = useRef<Set<number> | null>(null);
  useEffect(() => { if (!activeVoiceId || !voiceParticipantsQuery.data) { previousVoiceParticipants.current = null; return; } const current = new Set(voiceParticipantsQuery.data.map((entry) => entry.member.userId)); const previous = previousVoiceParticipants.current; for (const event of getVoiceParticipantEvents(previous, current)) playVoiceRoomTone(event); previousVoiceParticipants.current = current; }, [activeVoiceId, voiceParticipantsQuery.data]);
  useEffect(() => { if (!activeVoiceId || !voiceStream) { setVoiceLevel(0); lastPublishedSpeaking.current = null; return; } const timer = window.setInterval(() => { const level = webrtc.getMicrophoneLevel(); const trackEnabled = voiceStream.getAudioTracks().some((track) => track.enabled); const speaking = !muted && trackEnabled && level >= 0.08; setVoiceLevel(level); if (lastPublishedSpeaking.current !== speaking) { lastPublishedSpeaking.current = speaking; voiceActivityMutation.mutate({ channelId: activeVoiceId, isSpeaking: speaking }); } }, 120); return () => window.clearInterval(timer); }, [activeVoiceId, voiceStream, muted, webrtc, voiceActivityMutation]);

  const toggleScreenShare = async () => { try { if (screenSharing) { webrtc.stopScreenShare(); setScreenSharing(false); } else { await webrtc.shareScreen(); setScreenSharing(true); toast.success("Compartilhamento de tela iniciado"); } } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível compartilhar a tela."); } };
  const leaveActiveVoice = () => { if (activeVoiceId) void joinVoice(activeVoiceId, voiceItems.find((voice) => voice.id === activeVoiceId)?.name ?? "sala"); };

  const createCommunity = () => {
    if (!newCommunity.trim()) return;
    communityMutation.mutate({ name: newCommunity.trim(), description: "Comunidade criada no Concord" }, { onSuccess: () => { toast.success(`${newCommunity.trim()} foi criada`); setNewCommunity(""); setCreateOpen(false); } });
  };

  const saveProfile = () => {
    if (profileName.trim()) profileMutation.mutate({ name: profileName.trim(), avatarUrl: profileAvatar.trim() || null });
  };

  return (
    <div className="app-shell">
      <aside className="server-rail">
        <div className="rail-brand"><LogoMark compact /></div>
        <div className="rail-divider" />
        <button className={`server-icon home-server ${view === "home" ? "selected" : ""}`} onClick={() => setView("home")}><HomeIcon size={18} /></button>
        <button className={`server-icon friends-server ${view === "friends" ? "selected" : ""}`} onClick={() => setView("friends")}><Users size={18} /></button>
        <div className="rail-divider" />
        {(communityItems.length ? communityItems.map((entry) => ({ name: entry.community.name, short: entry.community.name.slice(0, 2).toUpperCase(), tone: "from-blue-400 to-indigo-600", unread: 0 })) : communities).map((community, index) => <button key={`${community.name}-${index}`} className={`server-icon community-icon bg-gradient-to-br ${community.tone} ${activeCommunity === index && view === "home" ? "selected" : ""}`} onClick={() => { setActiveCommunity(index); setView("home"); }} title={community.name}>{community.short}{community.unread > 0 && <span className="unread-pill">{community.unread}</span>}</button>)}
        <button className="server-icon add-server" onClick={() => setCreateOpen(true)}><Plus size={19} /></button>
        <div className="rail-bottom"><button className="server-icon settings-server" title="Configurações" onClick={() => setProfileOpen(true)}><Settings size={17} /></button></div>
      </aside>

      <aside className={`channel-sidebar ${mobilePanel === "channels" ? "mobile-open" : ""}`}>
        <div className="community-header"><div><strong>{activeName}</strong><span>Comunidade criativa</span></div><button className="mobile-close-panel" aria-label="Fechar navegação" onClick={() => setMobilePanel("closed")}><X size={17} /></button><button className="desktop-more" aria-label="Mais opções"><ChevronDown size={17} /></button></div>
        <div className="channel-scroll">
          <button className="discover-link"><Compass size={15} /> Explorar comunidades</button>
          <div className="channel-group dm-group"><div className="group-label"><span>MENSAGENS DIRETAS</span><Plus size={13} /></div>{friendshipsQuery.isLoading ? <div className="dm-status">Carregando contatos...</div> : friendshipsQuery.isError ? <div className="dm-status dm-error">Não foi possível carregar DMs.</div> : dmContacts.length ? dmContacts.map((contact) => <button key={contact.id} className={`channel-link dm-link ${activeDm === contact.name ? "active" : ""}`} onClick={() => { setActiveDm(contact.name); setMobilePanel("closed"); openDm.mutate({ friendId: contact.id }); }}><Avatar initials={contact.initials} tone="bg-blue-200 text-blue-900" online /><span>{contact.name}</span></button>) : <div className="dm-status">Nenhuma amizade aceita ainda.</div>}</div>
          {channelsQuery.isLoading ? <div className="dm-status">Carregando canais...</div> : channelsQuery.isError ? <div className="dm-status dm-error">Não foi possível carregar canais.</div> : channelItems.length ? <div className="channel-group"><div className="group-label"><span>CANAIS DE TEXTO</span><Plus size={13} /></div>{channelItems.map((channel) => <button key={channel.id} className={`channel-link ${activeChannel === channel.name && view === "home" ? "active" : ""}`} onClick={() => { setActiveChannel(channel.name); setActiveDm(null); setView("home"); setMobilePanel("closed"); }}><Hash size={15} />{channel.name}</button>)}</div> : <div className="dm-status">Nenhum canal de texto criado ainda.</div>}
          <div className="channel-group voice-channel-group"><div className="group-label"><span>SALAS DE VOZ · {voiceItems.length}/3</span><button type="button" className="sidebar-add-button" onClick={() => { if (!selectedCommunityId) { toast.error("Selecione ou crie uma comunidade primeiro"); return; } if (voiceItems.length >= 3) { toast.info("Este servidor já atingiu o limite de 3 salas"); return; } setVoiceOpen(true); }} aria-label="Adicionar sala de voz" title="Adicionar sala de voz"><Plus size={13} /></button></div>{voiceQuery.isLoading ? <div className="dm-status">Carregando salas...</div> : voiceQuery.isError ? <div className="dm-status dm-error">Não foi possível carregar salas.</div> : voiceItems.length ? voiceItems.map((voice) => <div key={voice.id}><button className={`channel-link voice-link ${activeVoiceId === voice.id ? "active" : ""}`} onClick={() => void joinVoice(voice.id, voice.name)}><Volume2 size={15} /><span>{voice.name}</span>{activeVoiceId === voice.id && <span className="channel-live" />}</button>{activeVoiceId === voice.id && <div className="voice-members">{voiceParticipantsQuery.isLoading ? <div>Conectando...</div> : voiceParticipantsQuery.data?.length ? voiceParticipantsQuery.data.map((entry) => <div key={entry.member.id}><span className={`voice-avatar blue ${entry.member.isSpeaking ? "voice-avatar-speaking" : ""}`}>{(entry.user.name ?? "CO").slice(0, 1).toUpperCase()}</span>{entry.user.name ?? "Conta Concord"}</div>) : <div>Ninguém na sala ainda.</div>}<small className="voice-note">Presença sincronizada. O áudio entre contas usa as chamadas diretas do Concord.</small></div>}</div>) : <div className="dm-status">Nenhuma sala de voz criada. Use + para criar a primeira.</div>}</div>
          <div className="side-tip"><Sparkles size={14} /><p><strong>Seu espaço, seu ritmo.</strong><br />Convide pessoas para construir junto.</p></div>
        </div>
        {activeVoiceId && <div className="voice-sidebar-dock"><div className="voice-sidebar-dock-title"><Volume2 size={14} /><div><strong>{voiceItems.find((voice) => voice.id === activeVoiceId)?.name ?? "Sala de voz"}</strong><span>{voiceParticipantsQuery.data?.length ?? 1} conectado(s)</span></div></div><div className="voice-sidebar-dock-actions"><button className={muted ? "is-active" : ""} onClick={toggleVoiceMute} aria-label={muted ? "Ativar microfone" : "Mutar microfone"}><Mic size={14} /></button><button className={screenSharing ? "is-active" : ""} onClick={() => void toggleScreenShare()} aria-label={screenSharing ? "Parar compartilhamento de tela" : "Compartilhar tela"}><Video size={14} /></button><button className="leave-call" onClick={leaveActiveVoice} aria-label="Sair da call"><PhoneOff size={14} /></button></div></div>}
        <div className="user-panel"><button className="user-identity" onClick={() => setProfileOpen(true)}><Avatar initials={userName ? userName.slice(0, 2).toUpperCase() : "VC"} tone="bg-slate-200 text-slate-900" online speaking={isSpeaking} /><div className="user-meta"><strong>{displayName}</strong><span>{publicId ?? "CONTA"}</span></div></button><button onClick={toggleVoiceMute} className={muted ? "control-active" : ""} aria-label="Alternar microfone"><Mic size={15} /></button><button onClick={onLogout} aria-label="Sair da conta"><MoreHorizontal size={16} /></button></div>
      </aside>

      <main className="content-area">
        {view === "friends" ? <FriendsView onOpenChannels={() => setMobilePanel("channels")} onOpenProfile={() => setProfileOpen(true)} /> : activeDm ? <DmView name={activeDm} threadId={dmThreadId} opening={openDm.isPending} openError={openDm.isError} onOpenChannels={() => setMobilePanel("channels")} onOpenFriends={() => setView("friends")} onOpenProfile={() => setProfileOpen(true)} /> : <>
          <header className="content-header"><div className="mobile-nav-actions"><button onClick={() => setMobilePanel("channels")} aria-label="Abrir canais"><Compass size={17} /></button><button onClick={() => { setView("friends"); setActiveDm(null); setMobilePanel("closed"); }} aria-label="Abrir amigos"><Users size={17} /></button><button onClick={() => setProfileOpen(true)} aria-label="Abrir perfil"><Settings size={17} /></button></div><div className="channel-title"><div className="title-symbol"><Hash size={18} /></div><div><h2>{activeChannel}</h2><span>{activeChannel === "geral" ? "Um espaço para começar qualquer conversa." : "Compartilhe referências com a comunidade."}</span></div></div><div className="header-actions"><button title="Notificações" onClick={() => toast.info("Você está em dia")}><Bell size={17} /></button><button title="Buscar amigos por código" onClick={() => setView("friends")}><Search size={17} /></button><button title="Abrir membros" onClick={() => setView("friends")}><Users size={17} /></button><div className="header-divider" /><button className="profile-chip" onClick={() => setProfileOpen(true)}><Avatar initials={userName ? userName.slice(0, 2).toUpperCase() : "VC"} tone="bg-amber-200 text-amber-900" online /><span>{displayName}</span><ChevronDown size={14} /></button></div></header>

          <section className="message-area"><div className="channel-intro"><div className="intro-symbol"><Hash size={27} /></div><h1>Bem-vindo ao #{activeChannel}</h1><p>Este é o começo do canal. Um bom lugar para dizer olá.</p><div className="intro-rule" /></div><div className="message-list">{visibleMessages.map((item, index) => <article className="message-row" key={`${item.name}-${index}`}><Avatar initials={item.initials} tone={item.tone} /><div className="message-copy"><div className="message-author"><strong>{item.name}</strong><span>{item.handle}</span><time>{item.time}</time></div><p>{item.text}</p></div></article>)}</div></section>
          <div className="composer-wrap"><div className="composer"><button><Plus size={19} /></button><Input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendMessage(); }} placeholder={`Mensagem em #${activeChannel}`} /><button onClick={sendMessage} className="send-button"><Send size={17} /></button></div><span className="composer-hint">Enter para enviar <span>•</span> Shift + Enter para nova linha</span></div>
        </>}
      </main>

      <aside className="member-sidebar"><div className="member-heading"><span>MEMBROS — 12</span><button><MoreHorizontal size={17} /></button></div><div className="member-group"><span className="member-role">ONLINE — 4</span>{friends.map((friend) => <button className="member-card" key={friend.name} onClick={() => toast.info(`Abrindo conversa com ${friend.name}`)}><Avatar initials={friend.initials} tone={friend.tone} online /><div><strong>{friend.name}</strong><span>{friend.status}</span></div></button>)}</div><div className="member-group"><span className="member-role">OFFLINE — 8</span><div className="offline-person"><Avatar initials="JP" tone="bg-slate-200 text-slate-700" /><span>João Prado</span></div><div className="offline-person"><Avatar initials="AS" tone="bg-slate-200 text-slate-700" /><span>Ana Sato</span></div></div>{activeVoiceId && <div className="call-dock"><div className="call-status"><span className="call-pulse" /><div><strong>{voiceItems.find((voice) => voice.id === activeVoiceId)?.name ?? "Sala de voz"}</strong><span>{voiceParticipantsQuery.data?.length ?? 1} pessoa(s) na sala</span></div><button onClick={() => toast.success("Convite copiado")}> <UserPlus size={15} /></button></div><div className="call-actions"><button className={muted ? "control-active" : ""} onClick={() => { voiceStream?.getAudioTracks().forEach((track) => { track.enabled = muted; }); setMuted(!muted); }}><Mic size={16} /></button><button className={deafened ? "control-active" : ""} onClick={() => setDeafened(!deafened)}><Headphones size={16} /></button><button className={screenSharing ? "control-active" : ""} onClick={async () => { try { if (screenSharing) { webrtc.stopScreenShare(); setScreenSharing(false); } else { await webrtc.shareScreen(); setScreenSharing(true); toast.success("Compartilhamento de tela iniciado"); } } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível compartilhar a tela."); } }}><Video size={16} /></button><button className="disconnect" onClick={() => { void joinVoice(activeVoiceId, voiceItems.find((voice) => voice.id === activeVoiceId)?.name ?? "sala"); }}> <X size={16} /></button></div></div>}</aside>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="concord-dialog"><DialogHeader><DialogTitle>Criar uma comunidade</DialogTitle><DialogDescription>Um espaço para as conversas que importam para você.</DialogDescription></DialogHeader><div className="dialog-form"><label htmlFor="community-name">Nome da comunidade</label><Input id="community-name" value={newCommunity} onChange={(event) => setNewCommunity(event.target.value)} placeholder="Ex.: Clube de leitura" autoFocus /><Button className="primary-cta" onClick={createCommunity} disabled={communityMutation.isPending}>Criar comunidade <ArrowRight size={16} /></Button></div></DialogContent></Dialog><Dialog open={voiceOpen} onOpenChange={setVoiceOpen}><DialogContent className="concord-dialog"><DialogHeader><DialogTitle>Criar sala de voz</DialogTitle><DialogDescription>Até 3 salas de voz por servidor, como no Discord. A sala aparecerá na seção SALAS DE VOZ.</DialogDescription></DialogHeader><div className="dialog-form"><label htmlFor="voice-name">Nome da sala</label><Input id="voice-name" value={newVoiceName} onChange={(event) => setNewVoiceName(event.target.value)} placeholder="Ex.: Estúdio aberto" autoFocus /><Button className="primary-cta" onClick={() => { if (selectedCommunityId && newVoiceName.trim()) voiceMutation.mutate({ communityId: selectedCommunityId, name: newVoiceName.trim() }); }} disabled={voiceMutation.isPending || !newVoiceName.trim()}>Criar sala de voz <ArrowRight size={16} /></Button></div></DialogContent></Dialog><Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent className="concord-dialog"><DialogHeader><DialogTitle>Editar perfil</DialogTitle><DialogDescription>Atualize como você aparece nas conversas do Concord.</DialogDescription></DialogHeader><div className="dialog-form"><label htmlFor="profile-name">Nome de exibição</label><Input id="profile-name" value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Seu nome" autoFocus /><label htmlFor="profile-avatar">Avatar por URL</label><Input id="profile-avatar" value={profileAvatar} onChange={(event) => setProfileAvatar(event.target.value)} placeholder="https://..." type="url" /><Button className="primary-cta" onClick={saveProfile} disabled={profileMutation.isPending}>Salvar alterações <Check size={16} /></Button></div></DialogContent></Dialog>
    </div>
  );
}

function DmView({ name, threadId, opening, openError, onOpenChannels, onOpenFriends, onOpenProfile }: { name: string; threadId: number | null; opening: boolean; openError: boolean; onOpenChannels: () => void; onOpenFriends: () => void; onOpenProfile: () => void }) {
  const [body, setBody] = useState("");
  const messagesQuery = trpc.dms.list.useQuery({ threadId: threadId ?? 0 }, { enabled: Boolean(threadId), refetchInterval: 5000 });
  const sendMessage = trpc.dms.send.useMutation({ onSuccess: () => { setBody(""); messagesQuery.refetch(); } });
  const submit = () => { if (threadId && body.trim()) sendMessage.mutate({ threadId, body: body.trim() }); };
  return <>
    <header className="content-header"><div className="mobile-nav-actions"><button onClick={onOpenChannels} aria-label="Abrir canais"><Compass size={17} /></button><button onClick={onOpenFriends} aria-label="Abrir amigos"><Users size={17} /></button><button onClick={onOpenProfile} aria-label="Abrir perfil"><Settings size={17} /></button></div><div className="channel-title"><Avatar initials={name.split(" ").map((part) => part[0]).join("").slice(0, 2)} tone="bg-amber-200 text-amber-900" online /><div><h2>{name}</h2><span>Mensagem direta</span></div></div><div className="header-actions"><button title="Buscar"><Search size={17} /></button><button title="Chamada de vídeo"><Video size={17} /></button></div></header>
    <section className="message-area"><div className="channel-intro"><div className="intro-symbol"><MessageCircle size={26} /></div><h1>Conversa com {name}</h1><p>Uma conversa só entre vocês dois.</p><div className="intro-rule" /></div>{opening ? <div className="empty-state">Abrindo conversa segura...</div> : openError ? <div className="empty-state error-state">Não foi possível abrir esta conversa. Verifique sua amizade e tente novamente.</div> : messagesQuery.isLoading ? <div className="empty-state">Carregando conversa...</div> : messagesQuery.isError ? <div className="empty-state error-state">Não foi possível carregar esta conversa. Tente novamente.</div> : messagesQuery.data?.length ? <div className="message-list">{messagesQuery.data.map((item, index) => <article className="message-row" key={`${item.message.id}-${index}`}><Avatar initials={(item.author.name ?? "CO").slice(0, 2).toUpperCase()} tone="bg-slate-200 text-slate-900" /><div className="message-copy"><div className="message-author"><strong>{item.author.name ?? "Concord"}</strong><time>{new Date(item.message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time></div><p>{item.message.body}</p></div></article>)}</div> : <div className="empty-state">Ainda não há mensagens. Diga olá para começar.</div>}</section>
    <div className="composer-wrap"><div className="composer"><button><Plus size={19} /></button><Input value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} placeholder={`Mensagem para ${name}`} /><button onClick={submit} className="send-button" disabled={sendMessage.isPending}><Send size={17} /></button></div><span className="composer-hint">As mensagens são atualizadas automaticamente.</span></div>
  </>;
}

function FriendsView({ onOpenChannels, onOpenProfile }: { onOpenChannels: () => void; onOpenProfile: () => void }) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [callService] = useState(() => new ConcordWebRTCService());
  const [activeCallId, setActiveCallId] = useState<number | null>(null);
  const [activeParticipantId, setActiveParticipantId] = useState<number | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [callState, setCallState] = useState<"idle" | "requesting" | "connected" | "error">("idle");
  const [localMedia, setLocalMedia] = useState<MediaStream | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [remoteVolume, setRemoteVolume] = useState(1);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState("");
  const [selectedOutput, setSelectedOutput] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const localPreviewRef = useRef<HTMLVideoElement>(null);
  const remotePreviewRef = useRef<HTMLVideoElement>(null);
  const [lastSignalId, setLastSignalId] = useState(0);
  const callsQuery = trpc.calls.list.useQuery(undefined, { refetchInterval: 2000 });
  const playCallTone = (frequency = 660) => { const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AudioContextClass) return; const context = new AudioContextClass(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = frequency; gain.gain.value = 0.035; oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.16); };
  const incomingCall = (callsQuery.data ?? []).find((call) => call.calleeId === user?.id && call.status === "ringing");
  const activeSignals = trpc.calls.signals.useQuery({ callId: activeCallId ?? 0, afterId: lastSignalId || undefined }, { enabled: Boolean(activeCallId), refetchInterval: 1500 });
  const incomingSignals = trpc.calls.signals.useQuery({ callId: incomingCall?.id ?? 0 }, { enabled: Boolean(incomingCall), refetchInterval: 1500 });
  const accountSearch = trpc.accounts.search.useQuery({ query }, { enabled: /^CON-[A-Z0-9]{4,}$/.test(query.trim()) });
  const friendshipQuery = trpc.friends.list.useQuery(undefined, { refetchInterval: 10000 });
  const requestMutation = trpc.friends.request.useMutation({ onSuccess: () => { toast.success("Solicitação enviada"); friendshipQuery.refetch(); } });
  const respondMutation = trpc.friends.respond.useMutation({ onSuccess: () => friendshipQuery.refetch() });
  const callSignal = trpc.calls.signal.useMutation();
  const callStart = trpc.calls.start.useMutation({ onSuccess: async (rows) => { playCallTone(880); const call = rows[0]; if (!call) return; setLastSignalId(0); setActiveCallId(call.id); try { callService.createPeer(attachRemoteAudio); callService.addLocalTracks(); const offer = await callService.createOffer(); callService.onIceCandidate((payload) => callSignal.mutate({ callId: call.id, kind: "ice", payload })); callSignal.mutate({ callId: call.id, kind: "offer", payload: offer }); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível preparar a chamada."); } } });
  const callUpdate = trpc.calls.update.useMutation();
  useEffect(() => { if (localPreviewRef.current) localPreviewRef.current.srcObject = localMedia; if (remotePreviewRef.current) { remotePreviewRef.current.srcObject = remoteMedia; remotePreviewRef.current.volume = remoteVolume; } }, [localMedia, remoteMedia, remoteVolume]);
  useEffect(() => { if (incomingCall) playCallTone(520); }, [incomingCall?.id]);
  useEffect(() => { if (!callStartedAt || callState !== "connected") { setCallDurationSeconds(0); return; } const timer = window.setInterval(() => setCallDurationSeconds(Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000))), 1000); return () => window.clearInterval(timer); }, [callStartedAt, callState]);
  useEffect(() => { if (!activeCallId) return; let timer: number | undefined; void callService.listAudioDevices().then(setAudioDevices); callService.startMicrophoneMeter(); timer = window.setInterval(() => setMicLevel(callService.getMicrophoneLevel()), 120); return () => { if (timer) window.clearInterval(timer); }; }, [activeCallId, callService]);
  useEffect(() => { const media = remotePreviewRef.current; if (!media || !selectedOutput) return; const sink = (media as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId; if (sink) void sink.call(media, selectedOutput); }, [selectedOutput, remoteMedia]);
  const finishCall = () => { playCallTone(330); callService.dispose(); audioStream?.getTracks().forEach((track) => track.stop()); setAudioStream(null); setLocalMedia(null); setRemoteMedia(null); setActiveCallId(null); setActiveParticipantId(null); setCallStartedAt(null); setCallDurationSeconds(0); setCallState("idle"); };
  useEffect(() => { if (!activeCallId || !activeSignals.data) return; const freshSignals = activeSignals.data.filter((signal) => signal.id > lastSignalId && signal.senderId !== user?.id); for (const signal of freshSignals) { if (signal.kind === "answer") void callService.applyAnswer(signal.payload); else if (signal.kind === "offer") void callService.applyOffer(signal.payload).then((answer) => callSignal.mutate({ callId: activeCallId, kind: "answer", payload: answer })); else if (signal.kind === "ice") void callService.addIceCandidate(signal.payload); } if (freshSignals.length) setLastSignalId(Math.max(...freshSignals.map((signal) => signal.id))); }, [activeCallId, activeSignals.data, callService, lastSignalId, user?.id]);
  const accepted = (friendshipQuery.data ?? []).filter((entry) => entry.friendship.status === "accepted" && entry.user);
  const pending = (friendshipQuery.data ?? []).filter((entry) => entry.friendship.status === "pending" && entry.friendship.addresseeId === user?.id && entry.user);
  const attachRemoteAudio = (event: RTCTrackEvent) => { const stream = event.streams[0] ?? new MediaStream([event.track]); setRemoteMedia(stream); };
  const acceptAudioCall = async () => {
    if (!incomingCall) return;
    try { playCallTone(880); setCallState("requesting"); const offer = incomingSignals.data?.find((signal) => signal.kind === "offer"); if (!offer) throw new Error("A oferta de áudio ainda não chegou."); setLastSignalId(offer.id); const stream = await callService.captureMicrophone(selectedInput || undefined); setAudioStream(stream); setLocalMedia(stream); callService.createPeer(attachRemoteAudio); callService.addLocalTracks(); const answer = await callService.applyOffer(offer.payload); callService.onIceCandidate((payload) => callSignal.mutate({ callId: incomingCall.id, kind: "ice", payload })); callSignal.mutate({ callId: incomingCall.id, kind: "answer", payload: answer }); setActiveCallId(incomingCall.id); setActiveParticipantId(incomingCall.callerId); setCallStartedAt(Date.now()); setCallState("connected"); callUpdate.mutate({ callId: incomingCall.id, status: "connected" }); } catch (error) { playCallTone(220); setCallState("error"); toast.error(error instanceof Error ? error.message : "Não foi possível aceitar a chamada."); }
  };
  const startAudioCall = async (friendId: number) => {
    try { setCallState("requesting"); if (!navigator.mediaDevices?.getUserMedia) throw new Error("Seu navegador não permite chamadas de áudio."); const stream = await callService.captureMicrophone(selectedInput || undefined); setAudioStream(stream); setLocalMedia(stream); setActiveParticipantId(friendId); setCallStartedAt(Date.now()); setCallState("connected"); callStart.mutate({ calleeId: friendId, media: "audio" }); } catch (error) { playCallTone(220); setCallState("error"); toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a chamada."); }
  };
  return <section className="friends-view">{callState !== "idle" && <div className="mobile-call-bar"><div className="mobile-call-summary"><span className="call-pulse" /><div><strong>{callState === "connected" ? "Chamada ativa" : callState === "requesting" ? "Conectando..." : "Falha na chamada"}</strong><span>{activeParticipantId ? `Conta #${activeParticipantId} · ${Math.floor(callDurationSeconds / 60).toString().padStart(2, "0")}:${(callDurationSeconds % 60).toString().padStart(2, "0")}` : "Aguardando acesso"}</span></div></div>{activeCallId && <div className="mobile-call-actions"><button onClick={() => { audioStream?.getAudioTracks().forEach((track) => { track.enabled = audioMuted; }); setAudioMuted((value) => !value); }} className={audioMuted ? "control-active" : ""} aria-label={audioMuted ? "Ativar microfone" : "Mutar microfone"}><Mic size={16} /></button><button onClick={() => setRemoteVolume((value) => value > 0 ? 0 : 1)} className={remoteVolume === 0 ? "control-active" : ""} aria-label="Alternar áudio remoto"><Volume2 size={16} /></button><button onClick={async () => { try { if (cameraOn) { callService.setCameraEnabled(false); setCameraOn(false); } else { const camera = await callService.captureCamera(); setCameraOn(true); setLocalMedia(camera); const offer = await callService.createOffer(); callSignal.mutate({ callId: activeCallId, kind: "offer", payload: offer }); } } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível acessar a câmera."); } }} aria-label="Alternar câmera"><Video size={16} /></button><button onClick={async () => { try { const screen = await callService.shareScreen(); setLocalMedia(screen); const offer = await callService.createOffer(); callSignal.mutate({ callId: activeCallId, kind: "offer", payload: offer }); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível compartilhar a tela."); } }} aria-label="Compartilhar tela"><Radio size={16} /></button><button className="disconnect" onClick={() => callUpdate.mutate({ callId: activeCallId, status: "ended" }, { onSuccess: finishCall })} aria-label="Encerrar chamada"><X size={16} /></button></div>}</div>}<div className="friends-mobile-header"><div className="mobile-nav-actions"><button onClick={onOpenChannels} aria-label="Abrir canais"><Compass size={17} /></button><button onClick={onOpenProfile} aria-label="Abrir perfil"><Settings size={17} /></button></div></div><div className="friends-header"><div><span className="section-kicker">CONEXÕES</span><h1>Seus amigos</h1><p>Adicione alguém usando o ID público exibido abaixo do nome.</p></div><div className="friends-search account-search"><Search size={15} /><Input value={query} onChange={(event) => setQuery(event.target.value.toUpperCase())} placeholder="Buscar por ID: CON-..." /></div></div>{query.trim().length >= 3 && <div className="account-results">{!/^CON-[A-Z0-9]{4,}$/.test(query.trim()) ? <div className="empty-state">Digite o código completo no formato CON-XXXXXXXX.</div> : accountSearch.isLoading ? <div className="empty-state">Procurando contas...</div> : accountSearch.isError ? <div className="empty-state error-state">Não foi possível buscar contas.</div> : accountSearch.data?.length ? accountSearch.data.map((account) => <div className="account-result" key={account.id}><Avatar initials={(account.name ?? "CO").slice(0, 2).toUpperCase()} tone="bg-blue-200 text-blue-900" /><div><strong>{account.name ?? "Conta Concord"}</strong><span>{account.publicId}</span></div><Button className="primary-cta" onClick={() => requestMutation.mutate({ addresseeId: account.id })} disabled={requestMutation.isPending || account.id === user?.id}>{account.id === user?.id ? "Sua conta" : <><UserPlus size={14} /> Adicionar</>}</Button></div>) : <div className="empty-state">Nenhuma conta encontrada para esse código.</div>}</div>}<div className="friends-tabs"><button className="active">Amigos <span>{accepted.length}</span></button><button>Solicitações <span>{pending.length}</span></button></div>{callsQuery.data?.length ? <div className="call-history"><div className="group-label"><span>HISTÓRICO DE CHAMADAS</span></div>{callsQuery.data.slice(0, 6).map((call) => { const participantId = call.callerId === user?.id ? call.calleeId : call.callerId; const duration = call.endedAt ? `${Math.max(1, Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 60000))} min` : "Em andamento"; return <div className="call-history-row" key={call.id}><span className={`call-history-dot ${call.status}`} /><div><strong>Conta #{participantId}</strong><span>{call.media === "audio" ? "Áudio" : call.media === "screen" ? "Tela" : "Vídeo"} · {new Date(call.startedAt).toLocaleString("pt-BR")} · {duration}</span></div><small>{call.status === "ended" ? "Encerrada" : call.status === "connected" ? "Conectada" : call.status === "ringing" ? "Chamando" : call.status}</small></div>; })}</div> : null}{incomingCall && <div className="request-banner"><span>Chamada de áudio recebida</span><Button variant="outline" onClick={acceptAudioCall}><Headphones size={14} /> Atender</Button><Button variant="outline" onClick={() => { callUpdate.mutate({ callId: incomingCall.id, status: "declined" }, { onSuccess: finishCall }); }}><X size={14} /> Recusar</Button></div>}{pending.length > 0 && <div className="request-list">{pending.map((entry) => <div className="request-banner" key={entry.friendship.id}><span>Solicitação de {entry.user?.name ?? "conta"}</span><Button variant="outline" onClick={() => respondMutation.mutate({ friendshipId: entry.friendship.id, status: "accepted" })}><Check size={14} /> Aceitar</Button><Button variant="outline" onClick={() => respondMutation.mutate({ friendshipId: entry.friendship.id, status: "declined" })}><X size={14} /> Recusar</Button></div>)}</div>}{(localMedia || remoteMedia) && <><div className={`call-preview-grid ${previewExpanded ? "expanded" : ""}`}><div className="call-preview"><span>Seu preview</span><video ref={localPreviewRef} autoPlay muted playsInline /></div><div className="call-preview"><span>Preview remoto</span><video ref={remotePreviewRef} autoPlay playsInline /></div></div><div className="device-controls"><label>Microfone<select value={selectedInput} onChange={(event) => setSelectedInput(event.target.value)}><option value="">Padrão do sistema</option>{audioDevices.filter((device) => device.kind === "audioinput").map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || "Microfone disponível"}</option>)}</select></label><label>Saída<select value={selectedOutput} onChange={(event) => setSelectedOutput(event.target.value)}><option value="">Padrão do sistema</option>{audioDevices.filter((device) => device.kind === "audiooutput").map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || "Saída disponível"}</option>)}</select></label><div className="mic-meter"><span>Teste de microfone</span><i style={{ width: `${Math.round(micLevel * 100)}%` }} /></div></div></>}{callState !== "idle" && <div className={`request-banner ${callState === "error" ? "dm-error" : ""}`}>{callState === "requesting" ? "Solicitando acesso ao microfone..." : callState === "connected" ? `Chamada de áudio ativa${activeCallId ? ` #${activeCallId}` : ""}` : "A chamada não pôde ser iniciada."}{activeCallId && <><Button variant="outline" onClick={() => { audioStream?.getAudioTracks().forEach((track) => { track.enabled = audioMuted; }); setAudioMuted((value) => !value); }}>{audioMuted ? "Ativar microfone" : "Mutar microfone"}</Button><Button variant="outline" onClick={async () => { try { if (cameraOn) { callService.setCameraEnabled(false); setCameraOn(false); } else { const camera = await callService.captureCamera(); setCameraOn(true); setLocalMedia(camera); callService.addLocalTracks(); const offer = await callService.createOffer(); callSignal.mutate({ callId: activeCallId, kind: "offer", payload: offer }); } } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível acessar a câmera."); } }}><Video size={14} /> {cameraOn ? "Desligar câmera" : "Câmera"}</Button><Button variant="outline" onClick={() => setRemoteVolume((value) => value > 0 ? 0 : 1)}>{remoteVolume > 0 ? "Mutar remoto" : "Ouvir remoto"}</Button><Button variant="outline" onClick={() => setPreviewExpanded((value) => !value)}>{previewExpanded ? "Reduzir" : "Expandir"}</Button><Button variant="outline" onClick={async () => { try { if (remotePreviewRef.current?.requestPictureInPicture) await remotePreviewRef.current.requestPictureInPicture(); else toast.info("Picture-in-Picture não é suportado neste navegador."); } catch { toast.error("Não foi possível abrir Picture-in-Picture remoto."); } }}><Video size={14} /> PiP remoto</Button><Button variant="outline" onClick={async () => { try { if (localPreviewRef.current?.requestPictureInPicture) await localPreviewRef.current.requestPictureInPicture(); else toast.info("Picture-in-Picture local não é suportado neste navegador."); } catch { toast.error("Não foi possível abrir Picture-in-Picture local."); } }}>PiP local</Button><Button variant="outline" onClick={async () => { try { const screen = await callService.shareScreen(); setLocalMedia(screen); callService.addLocalTracks(); const renegotiationOffer = await callService.createOffer(); callSignal.mutate({ callId: activeCallId, kind: "offer", payload: renegotiationOffer }); toast.success("Compartilhamento de tela adicionado à chamada"); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível compartilhar a tela."); } }}><Video size={14} /> Tela</Button><Button variant="outline" onClick={() => { callUpdate.mutate({ callId: activeCallId, status: "ended" }, { onSuccess: finishCall }); }}>Encerrar</Button></>}</div>}<div className="friends-grid">{accepted.length ? accepted.map((entry) => { const person = entry.user!; return <article className="friend-tile" key={person.id}><div className="friend-tile-top"><Avatar initials={(person.name ?? "CO").slice(0, 2).toUpperCase()} tone="bg-blue-200 text-blue-900" online={person.presence === "online"} /><span className="public-id">{person.publicId}</span></div><h3>{person.name ?? "Conta Concord"}</h3><p>{person.presence === "online" ? "Online agora" : person.presence === "away" ? "Ausente" : "Offline"}</p><div className="friend-actions"><Button variant="outline" onClick={() => toast.info("Abra a conversa pela lista de DMs")}><MessageCircle size={15} /> Mensagem</Button><button className="icon-action" onClick={() => startAudioCall(person.id)} title="Chamada de áudio"><Headphones size={16} /></button></div></article>; }) : <div className="empty-state">Você ainda não tem amigos aceitos. Procure uma conta pelo ID acima.</div>}</div></section>;
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  if (loading) return <div className="loading-screen"><LogoMark /><span>Preparando seu espaço...</span></div>;
  if (!isAuthenticated) return <Landing onLogin={() => startLogin()} />;
  return <Workspace onLogout={() => logout()} userName={user?.name ?? ""} userId={user?.id} publicId={user?.publicId} />;
}
