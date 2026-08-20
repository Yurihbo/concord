import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ConcordWebRTCService } from "@/services/webrtc";
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

const messages = [
  { name: "Maya Torres", handle: "@maya", time: "09:42", initials: "MT", tone: "bg-amber-200 text-amber-900", text: "A nova sala está muito mais silenciosa. O fluxo de ideias ficou leve de verdade." },
  { name: "Ravi Mendes", handle: "@ravi", time: "09:44", initials: "RM", tone: "bg-blue-200 text-blue-900", text: "Também senti isso. Vou subir a primeira versão do mapa de canais ainda hoje." },
  { name: "Clara Ono", handle: "@clara", time: "09:47", initials: "CO", tone: "bg-emerald-200 text-emerald-900", text: "Perfeito. Deixei uma referência na aba de ideias — vale olhar quando puderem." },
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

function Avatar({ initials, tone, online = false }: { initials: string; tone: string; online?: boolean }) {
  return (
    <span className={`avatar ${tone}`}>
      {initials}
      {online && <span className="online-dot" />}
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
              <div className="preview-chat"><div className="chat-heading"><div><h3># geral</h3><p>Um espaço para começar qualquer conversa.</p></div><div className="chat-tools"><Search size={15} /><Bell size={15} /><Users size={15} /></div></div><div className="preview-messages"><div className="preview-message"><span className="fake-avatar amber">M</span><div><b>Maya Torres <small>09:42</small></b><p>O silêncio dessa sala faz as ideias respirarem.</p></div></div><div className="preview-message"><span className="fake-avatar blue">R</span><div><b>Ravi Mendes <small>09:44</small></b><p>É exatamente a sensação que eu queria.</p></div></div><div className="preview-message"><span className="fake-avatar green">C</span><div><b>Clara Ono <small>09:47</small></b><p>Deixei um novo ponto de partida em ideias.</p></div></div></div><div className="preview-input">Escreva uma mensagem... <Send size={14} /></div></div>
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

function Workspace({ onLogout, userName, userId }: { onLogout: () => void; userName: string; userId?: number }) {
  const [activeCommunity, setActiveCommunity] = useState(0);
  const [activeChannel, setActiveChannel] = useState("geral");
  const [message, setMessage] = useState("");
  const [sentMessages, setSentMessages] = useState<string[]>([]);
  const [view, setView] = useState<"home" | "friends">("home");
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [webrtc] = useState(() => new ConcordWebRTCService());
  const [createOpen, setCreateOpen] = useState(false);
  const [newCommunity, setNewCommunity] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
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
  const channelItems = channelsQuery.data ?? [];
  const selectedChannelId = channelItems.find((channel) => channel.name === activeChannel)?.id;
  const channelMessagesQuery = trpc.messages.list.useQuery({ channelId: selectedChannelId ?? 0, limit: 50 }, { enabled: Boolean(selectedChannelId), refetchInterval: 5000 });
  const sendChannelMessage = trpc.messages.send.useMutation({ onSuccess: () => channelMessagesQuery.refetch() });
  const dmContacts = (friendshipsQuery.data ?? []).filter((entry) => entry.friendship.status === "accepted" && entry.user).map((entry) => ({ id: entry.user!.id, name: entry.user!.name ?? `Conexão ${entry.user!.id}`, initials: (entry.user!.name ?? "CO").slice(0, 2).toUpperCase() }));
  const displayName = userName || "Você";
  const activeName = communityItems[activeCommunity]?.community.name ?? communities[activeCommunity]?.name ?? "Concord Lab";
  const backendMessages = (channelMessagesQuery.data ?? []).map((item) => ({ name: item.author.name ?? "Concord", handle: "@membro", time: new Date(item.message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), initials: (item.author.name ?? "CO").slice(0, 2).toUpperCase(), tone: "bg-slate-200 text-slate-900", text: item.message.body }));
  const visibleMessages = useMemo(() => [...(backendMessages.length ? backendMessages : messages), ...sentMessages.map((text) => ({ name: displayName, handle: "@você", time: "agora", initials: "VC", tone: "bg-slate-200 text-slate-900", text }))], [backendMessages, displayName, sentMessages]);

  const sendMessage = () => {
    if (!message.trim()) return;
    const body = message.trim();
    if (selectedChannelId) sendChannelMessage.mutate({ channelId: selectedChannelId, body });
    else setSentMessages((current) => [...current, body]);
    setMessage("");
  };

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
        <div className="rail-bottom"><button className="server-icon settings-server" title="Configurações"><Settings size={17} /></button></div>
      </aside>

      <aside className="channel-sidebar">
        <div className="community-header"><div><strong>{activeName}</strong><span>Comunidade criativa</span></div><button aria-label="Mais opções"><ChevronDown size={17} /></button></div>
        <div className="channel-scroll">
          <button className="discover-link"><Compass size={15} /> Explorar comunidades</button>
          <div className="channel-group dm-group"><div className="group-label"><span>MENSAGENS DIRETAS</span><Plus size={13} /></div>{friendshipsQuery.isLoading ? <div className="dm-status">Carregando contatos...</div> : friendshipsQuery.isError ? <div className="dm-status dm-error">Não foi possível carregar DMs.</div> : dmContacts.length ? dmContacts.map((contact) => <button key={contact.id} className={`channel-link dm-link ${activeDm === contact.name ? "active" : ""}`} onClick={() => { setActiveDm(contact.name); openDm.mutate({ friendId: contact.id }); }}><Avatar initials={contact.initials} tone="bg-blue-200 text-blue-900" online /><span>{contact.name}</span></button>) : <div className="dm-status">Nenhuma amizade aceita ainda.</div>}</div>
          {channelsQuery.isLoading ? <div className="dm-status">Carregando canais...</div> : channelsQuery.isError ? <div className="dm-status dm-error">Não foi possível carregar canais.</div> : channelItems.length ? <div className="channel-group"><div className="group-label"><span>CANAIS</span><Plus size={13} /></div>{channelItems.map((channel) => <button key={channel.id} className={`channel-link ${activeChannel === channel.name && view === "home" ? "active" : ""}`} onClick={() => { setActiveChannel(channel.name); setActiveDm(null); setView("home"); }}><Hash size={15} />{channel.name}</button>)}</div> : channels.map((group) => <div className="channel-group" key={group.category}><div className="group-label"><span>{group.category}</span><Plus size={13} /></div>{group.items.map((channel) => <button key={channel.name} className={`channel-link ${activeChannel === channel.name && view === "home" ? "active" : ""}`} onClick={() => { setActiveChannel(channel.name); setView("home"); }}><Hash size={15} />{channel.name}{channel.name === "geral" && <span className="channel-live" />}</button>)}</div>)}
          <div className="channel-group"><div className="group-label"><span>NO AR</span><Plus size={13} /></div><button className="channel-link voice-link"><Volume2 size={15} /><span>Estúdio aberto</span><span className="voice-count">3</span></button><div className="voice-members"><div><span className="voice-avatar amber">M</span>Maya Torres</div><div><span className="voice-avatar blue">R</span>Ravi Mendes</div><div><span className="voice-avatar green">C</span>Clara Ono</div></div></div>
          <div className="side-tip"><Sparkles size={14} /><p><strong>Seu espaço, seu ritmo.</strong><br />Convide pessoas para construir junto.</p></div>
        </div>
        <div className="user-panel"><button className="user-identity" onClick={() => setProfileOpen(true)}><Avatar initials={userName ? userName.slice(0, 2).toUpperCase() : "VC"} tone="bg-slate-200 text-slate-900" online /><div className="user-meta"><strong>{displayName}</strong><span>online</span></div></button><button onClick={() => setMuted(!muted)} className={muted ? "control-active" : ""}><Mic size={15} /></button><button onClick={onLogout}><MoreHorizontal size={16} /></button></div>
      </aside>

      <main className="content-area">
        {view === "friends" ? <FriendsView /> : activeDm ? <DmView name={activeDm} threadId={dmThreadId} opening={openDm.isPending} openError={openDm.isError} /> : <>
          <header className="content-header"><div className="channel-title"><div className="title-symbol"><Hash size={18} /></div><div><h2>{activeChannel}</h2><span>{activeChannel === "geral" ? "Um espaço para começar qualquer conversa." : "Compartilhe referências com a comunidade."}</span></div></div><div className="header-actions"><button title="Notificações"><Bell size={17} /></button><button title="Buscar"><Search size={17} /></button><button title="Membros"><Users size={17} /></button><div className="header-divider" /><button className="profile-chip"><Avatar initials="MT" tone="bg-amber-200 text-amber-900" online /><span>Maya Torres</span><ChevronDown size={14} /></button></div></header>
          <section className="message-area"><div className="channel-intro"><div className="intro-symbol"><Hash size={27} /></div><h1>Bem-vindo ao #{activeChannel}</h1><p>Este é o começo do canal. Um bom lugar para dizer olá.</p><div className="intro-rule" /></div><div className="message-list">{visibleMessages.map((item, index) => <article className="message-row" key={`${item.name}-${index}`}><Avatar initials={item.initials} tone={item.tone} /><div className="message-copy"><div className="message-author"><strong>{item.name}</strong><span>{item.handle}</span><time>{item.time}</time></div><p>{item.text}</p></div></article>)}</div></section>
          <div className="composer-wrap"><div className="composer"><button><Plus size={19} /></button><Input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendMessage(); }} placeholder={`Mensagem em #${activeChannel}`} /><button onClick={sendMessage} className="send-button"><Send size={17} /></button></div><span className="composer-hint">Enter para enviar <span>•</span> Shift + Enter para nova linha</span></div>
        </>}
      </main>

      <aside className="member-sidebar"><div className="member-heading"><span>MEMBROS — 12</span><button><MoreHorizontal size={17} /></button></div><div className="member-group"><span className="member-role">ONLINE — 4</span>{friends.map((friend) => <button className="member-card" key={friend.name} onClick={() => toast.info(`Abrindo conversa com ${friend.name}`)}><Avatar initials={friend.initials} tone={friend.tone} online /><div><strong>{friend.name}</strong><span>{friend.status}</span></div></button>)}</div><div className="member-group"><span className="member-role">OFFLINE — 8</span><div className="offline-person"><Avatar initials="JP" tone="bg-slate-200 text-slate-700" /><span>João Prado</span></div><div className="offline-person"><Avatar initials="AS" tone="bg-slate-200 text-slate-700" /><span>Ana Sato</span></div></div><div className="call-dock"><div className="call-status"><span className="call-pulse" /><div><strong>Estúdio aberto</strong><span>3 pessoas na sala</span></div><button onClick={() => toast.success("Convite copiado")}> <UserPlus size={15} /></button></div><div className="call-actions"><button className={muted ? "control-active" : ""} onClick={() => setMuted(!muted)}><Mic size={16} /></button><button className={deafened ? "control-active" : ""} onClick={() => setDeafened(!deafened)}><Headphones size={16} /></button><button className={screenSharing ? "control-active" : ""} onClick={async () => { try { if (screenSharing) { webrtc.stopScreenShare(); setScreenSharing(false); } else { await webrtc.shareScreen(); setScreenSharing(true); toast.success("Compartilhamento de tela iniciado"); } } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível compartilhar a tela."); } }}><Video size={16} /></button><button className="disconnect" onClick={() => toast.info("Você ainda não está em uma chamada")}> <X size={16} /></button></div></div></aside>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="concord-dialog"><DialogHeader><DialogTitle>Criar uma comunidade</DialogTitle><DialogDescription>Um espaço para as conversas que importam para você.</DialogDescription></DialogHeader><div className="dialog-form"><label htmlFor="community-name">Nome da comunidade</label><Input id="community-name" value={newCommunity} onChange={(event) => setNewCommunity(event.target.value)} placeholder="Ex.: Clube de leitura" autoFocus /><Button className="primary-cta" onClick={createCommunity} disabled={communityMutation.isPending}>Criar comunidade <ArrowRight size={16} /></Button></div></DialogContent></Dialog><Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent className="concord-dialog"><DialogHeader><DialogTitle>Editar perfil</DialogTitle><DialogDescription>Atualize como você aparece nas conversas do Concord.</DialogDescription></DialogHeader><div className="dialog-form"><label htmlFor="profile-name">Nome de exibição</label><Input id="profile-name" value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Seu nome" autoFocus /><label htmlFor="profile-avatar">Avatar por URL</label><Input id="profile-avatar" value={profileAvatar} onChange={(event) => setProfileAvatar(event.target.value)} placeholder="https://..." type="url" /><Button className="primary-cta" onClick={saveProfile} disabled={profileMutation.isPending}>Salvar alterações <Check size={16} /></Button></div></DialogContent></Dialog>
    </div>
  );
}

function DmView({ name, threadId, opening, openError }: { name: string; threadId: number | null; opening: boolean; openError: boolean }) {
  const [body, setBody] = useState("");
  const messagesQuery = trpc.dms.list.useQuery({ threadId: threadId ?? 0 }, { enabled: Boolean(threadId), refetchInterval: 5000 });
  const sendMessage = trpc.dms.send.useMutation({ onSuccess: () => { setBody(""); messagesQuery.refetch(); } });
  const submit = () => { if (threadId && body.trim()) sendMessage.mutate({ threadId, body: body.trim() }); };
  return <>
    <header className="content-header"><div className="channel-title"><Avatar initials={name.split(" ").map((part) => part[0]).join("").slice(0, 2)} tone="bg-amber-200 text-amber-900" online /><div><h2>{name}</h2><span>Mensagem direta</span></div></div><div className="header-actions"><button title="Buscar"><Search size={17} /></button><button title="Chamada de vídeo"><Video size={17} /></button></div></header>
    <section className="message-area"><div className="channel-intro"><div className="intro-symbol"><MessageCircle size={26} /></div><h1>Conversa com {name}</h1><p>Uma conversa só entre vocês dois.</p><div className="intro-rule" /></div>{opening ? <div className="empty-state">Abrindo conversa segura...</div> : openError ? <div className="empty-state error-state">Não foi possível abrir esta conversa. Verifique sua amizade e tente novamente.</div> : messagesQuery.isLoading ? <div className="empty-state">Carregando conversa...</div> : messagesQuery.isError ? <div className="empty-state error-state">Não foi possível carregar esta conversa. Tente novamente.</div> : messagesQuery.data?.length ? <div className="message-list">{messagesQuery.data.map((item, index) => <article className="message-row" key={`${item.message.id}-${index}`}><Avatar initials={(item.author.name ?? "CO").slice(0, 2).toUpperCase()} tone="bg-slate-200 text-slate-900" /><div className="message-copy"><div className="message-author"><strong>{item.author.name ?? "Concord"}</strong><time>{new Date(item.message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time></div><p>{item.message.body}</p></div></article>)}</div> : <div className="empty-state">Ainda não há mensagens. Diga olá para começar.</div>}</section>
    <div className="composer-wrap"><div className="composer"><button><Plus size={19} /></button><Input value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} placeholder={`Mensagem para ${name}`} /><button onClick={submit} className="send-button" disabled={sendMessage.isPending}><Send size={17} /></button></div><span className="composer-hint">As mensagens são atualizadas automaticamente.</span></div>
  </>;
}

function FriendsView() {
  const [friendQuery, setFriendQuery] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const filteredFriends = friends.filter((friend) => friend.name.toLowerCase().includes(friendQuery.toLowerCase()));
  return <section className="friends-view"><div className="friends-header"><div><span className="section-kicker">CONEXÕES</span><h1>Seus amigos</h1><p>Encontre as pessoas que tornam cada conversa melhor.</p></div><Button className="primary-cta" onClick={() => setRequestSent(true)}><UserPlus size={16} /> Adicionar amigo</Button></div><div className="friends-tabs"><button className="active">Todos <span>24</span></button><button>Online <span>4</span></button><button>Solicitações <span>2</span></button><div className="friends-search"><Search size={15} /><Input value={friendQuery} onChange={(event) => setFriendQuery(event.target.value)} placeholder="Buscar amigos" /></div></div>{requestSent && <div className="request-banner"><Check size={16} /> Solicitação enviada. A pessoa receberá uma notificação no Concord.</div>}<div className="friends-grid">{filteredFriends.map((friend) => <article className="friend-tile" key={friend.name}><div className="friend-tile-top"><Avatar initials={friend.initials} tone={friend.tone} online /><button><MoreHorizontal size={17} /></button></div><h3>{friend.name}</h3><p>{friend.status}</p><div className="friend-actions"><Button variant="outline" onClick={() => toast.info(`Abrindo DM com ${friend.name}`)}><MessageCircle size={15} /> Mensagem</Button><button className="icon-action"><Video size={16} /></button></div></article>)}</div></section>;
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  if (loading) return <div className="loading-screen"><LogoMark /><span>Preparando seu espaço...</span></div>;
  if (!isAuthenticated) return <Landing onLogin={() => startLogin()} />;
  return <Workspace onLogout={() => logout()} userName={user?.name ?? ""} userId={user?.id} />;
}
