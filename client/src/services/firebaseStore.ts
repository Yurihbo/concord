import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { firebaseDb } from "@/lib/firebase";

export type FirebaseProfile = {
  uid: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  publicId?: string;
  presence?: "online" | "away" | "offline";
  updatedAt?: unknown;
};

export type FirebaseCommunity = { id: string; name: string; description?: string; ownerId: string; createdAt?: unknown };
export type FirebaseChannel = { id: string; communityId: string; name: string; kind: "text" | "voice"; category?: string };
export type FirebaseMessage = { id: string; channelId: string; authorId: string; body: string; createdAt?: unknown };
export type FirebaseVoiceMember = { uid: string; roomId: string; displayName: string; avatarUrl?: string | null; isSpeaking: boolean; muted: boolean; joinedAt?: unknown };
export type FirebaseFriendship = { id: string; requesterId: string; addresseeId: string; status: "pending" | "accepted" | "declined"; updatedAt?: unknown };
export type FirebaseCommunityInvite = { id: string; communityId: string; communityName?: string; inviterId: string; inviteeId: string; status: "pending" | "accepted" | "declined"; updatedAt?: unknown };
export type FirebaseDirectMessage = { id: string; authorId: string; body: string; createdAt?: unknown };
export type FirebaseVoiceRoom = { id: string; name: string; communityId: string; createdAt?: unknown };
export type FirebaseSignal = { id: string; from: string; to: string; kind: "offer" | "answer" | "ice"; payload: string; createdAt?: unknown };
export type FirebaseDirectCall = { id: string; callerId: string; calleeId: string; status: "ringing" | "connected" | "ended" | "declined"; media: "audio" | "screen"; createdAt?: unknown; updatedAt?: unknown };

function clean<T extends DocumentData>(id: string, data: T): T & { id: string } {
  return { id, ...data };
}

function userDoc(uid: string) { return doc(firebaseDb, "users", uid); }
function communityDoc(id: string) { return doc(firebaseDb, "communities", id); }
function communityCollection(id: string, child: string) { return collection(firebaseDb, "communities", id, child); }

function withFirestoreTimeout<T>(operation: Promise<T>, label: string, timeoutMs = 15000): Promise<T> {
  return Promise.race([operation, new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(`${label} demorou mais de 15 segundos. Verifique a conexão, o Firestore Database e as regras publicadas.`)), timeoutMs))]);
}

export async function saveProfile(user: User, profile: Partial<FirebaseProfile>): Promise<void> {
  await setDoc(userDoc(user.uid), {
    uid: user.uid,
    email: user.email ?? null,
    displayName: profile.displayName ?? user.displayName ?? user.email?.split("@")[0] ?? "Conta Concord",
    avatarUrl: profile.avatarUrl ?? user.photoURL ?? null,
    ...profile,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function searchProfilesByPublicId(publicId: string): Promise<FirebaseProfile[]> {
  const snapshot = await getDocs(query(collection(firebaseDb, "users"), where("publicId", "==", publicId), limit(10)));
  return snapshot.docs.map((item) => clean(item.id, item.data() as Omit<FirebaseProfile, "id">));
}

function friendshipId(firstUid: string, secondUid: string): string { return [firstUid, secondUid].sort().join("__"); }

export async function createFriendRequest(requesterId: string, addresseeId: string): Promise<void> {
  if (!requesterId || !addresseeId || requesterId === addresseeId) throw new Error("Escolha outra conta para enviar a solicitação.");
  await setDoc(doc(firebaseDb, "friendRequests", friendshipId(requesterId, addresseeId)), { requesterId, addresseeId, status: "pending", updatedAt: serverTimestamp() }, { merge: true });
}

function communityInviteId(communityId: string, inviteeId: string): string { return `${communityId}__${inviteeId}`; }

export async function createCommunityInvite(communityId: string, communityName: string, inviterId: string, inviteeId: string): Promise<void> {
  if (inviterId === inviteeId) throw new Error("Você não pode convidar a própria conta.");
  await setDoc(doc(firebaseDb, "communityInvites", communityInviteId(communityId, inviteeId)), { communityId, communityName, inviterId, inviteeId, status: "pending", updatedAt: serverTimestamp() }, { merge: true });
}

export async function listCommunityInvites(uid: string): Promise<FirebaseCommunityInvite[]> {
  const snapshot = await getDocs(query(collection(firebaseDb, "communityInvites"), where("inviteeId", "==", uid), limit(30)));
  return snapshot.docs.map((item) => clean(item.id, item.data() as Omit<FirebaseCommunityInvite, "id">));
}

export function subscribeToCommunityInvites(uid: string, listener: (invites: FirebaseCommunityInvite[]) => void, onError?: (error: Error) => void): Unsubscribe {
  return onSnapshot(query(collection(firebaseDb, "communityInvites"), where("inviteeId", "==", uid), limit(30)), (snapshot) => listener(snapshot.docs.map((item) => clean(item.id, item.data() as Omit<FirebaseCommunityInvite, "id">))), (reason) => onError?.(reason instanceof Error ? reason : new Error("Não foi possível sincronizar os convites.")));
}

export async function respondToCommunityInvite(inviteId: string, uid: string, status: "accepted" | "declined"): Promise<void> {
  const target = doc(firebaseDb, "communityInvites", inviteId);
  const snapshot = await getDoc(target);
  if (!snapshot.exists()) throw new Error("Convite não encontrado.");
  const invite = snapshot.data() as FirebaseCommunityInvite;
  if (invite.inviteeId !== uid) throw new Error("Você não pode responder a este convite.");
  await updateDoc(target, { status, updatedAt: serverTimestamp() });
  if (status === "accepted") await joinCommunity(invite.communityId, uid);
}

export async function listFriendships(uid: string): Promise<FirebaseFriendship[]> {
  const [sent, received] = await Promise.all([
    getDocs(query(collection(firebaseDb, "friendRequests"), where("requesterId", "==", uid))),
    getDocs(query(collection(firebaseDb, "friendRequests"), where("addresseeId", "==", uid))),
  ]);
  const rows = [...sent.docs, ...received.docs];
  return rows.map((item) => clean(item.id, item.data() as Omit<FirebaseFriendship, "id">));
}

export function subscribeToFriendships(uid: string, listener: (friendships: FirebaseFriendship[]) => void, onError?: (error: Error) => void): Unsubscribe {
  let sent: FirebaseFriendship[] = [];
  let received: FirebaseFriendship[] = [];
  const emit = () => listener([...sent, ...received].filter((item, index, rows) => rows.findIndex((candidate) => candidate.id === item.id) === index));
  const handleError = (reason: unknown) => onError?.(reason instanceof Error ? reason : new Error("Não foi possível sincronizar suas amizades."));
  const sentUnsubscribe = onSnapshot(query(collection(firebaseDb, "friendRequests"), where("requesterId", "==", uid)), (snapshot) => { sent = snapshot.docs.map((item) => clean(item.id, item.data() as Omit<FirebaseFriendship, "id">)); emit(); }, handleError);
  const receivedUnsubscribe = onSnapshot(query(collection(firebaseDb, "friendRequests"), where("addresseeId", "==", uid)), (snapshot) => { received = snapshot.docs.map((item) => clean(item.id, item.data() as Omit<FirebaseFriendship, "id">)); emit(); }, handleError);
  return () => { sentUnsubscribe(); receivedUnsubscribe(); };
}

export async function respondToFriendRequest(requestId: string, uid: string, status: "accepted" | "declined"): Promise<void> {
  const target = doc(firebaseDb, "friendRequests", requestId);
  const snapshot = await getDoc(target);
  if (!snapshot.exists()) throw new Error("Solicitação não encontrada.");
  const data = snapshot.data() as FirebaseFriendship;
  if (data.addresseeId !== uid && data.requesterId !== uid) throw new Error("Você não pode responder a esta solicitação.");
  await updateDoc(target, { status, updatedAt: serverTimestamp() });
}

export async function getProfile(uid: string): Promise<FirebaseProfile | null> {
  const snapshot = await getDoc(userDoc(uid));
  return snapshot.exists() ? clean(snapshot.id, snapshot.data() as FirebaseProfile) : null;
}

export async function getProfiles(uids: string[]): Promise<FirebaseProfile[]> {
  const profiles = await Promise.all(Array.from(new Set(uids)).map((uid) => getProfile(uid)));
  return profiles.filter((profile): profile is FirebaseProfile => Boolean(profile));
}

export function subscribeToProfiles(uids: string[], listener: (profiles: FirebaseProfile[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const uniqueIds = Array.from(new Set(uids));
  if (!uniqueIds.length) { listener([]); return () => undefined; }
  const profiles = new Map<string, FirebaseProfile>();
  const unsubscribers = uniqueIds.map((uid) => onSnapshot(userDoc(uid), (snapshot) => {
    if (snapshot.exists()) profiles.set(uid, clean(snapshot.id, snapshot.data() as Omit<FirebaseProfile, "id">));
    else profiles.delete(uid);
    listener(Array.from(profiles.values()));
  }, (reason) => onError?.(reason instanceof Error ? reason : new Error("Não foi possível sincronizar a presença dos amigos."))));
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export async function setPresence(uid: string, presence: FirebaseProfile["presence"]): Promise<void> {
  await updateDoc(userDoc(uid), { presence, updatedAt: serverTimestamp() });
}

export async function listCommunities(uid: string): Promise<FirebaseCommunity[]> {
  const membershipSnapshot = await getDocs(collection(firebaseDb, "users", uid, "memberships"));
  const communities = await Promise.all(membershipSnapshot.docs.map(async (membership) => {
    const snapshot = await getDoc(communityDoc(membership.id));
    return snapshot.exists() ? clean(snapshot.id, snapshot.data() as Omit<FirebaseCommunity, "id">) : null;
  }));
  return communities.filter((community): community is FirebaseCommunity => Boolean(community));
}

export async function listVoiceRooms(communityId: string): Promise<FirebaseVoiceRoom[]> {
  const snapshot = await withFirestoreTimeout(getDocs(query(communityCollection(communityId, "voiceRooms"), orderBy("createdAt", "asc"))), "Carregar salas");
  return snapshot.docs.map((item) => clean(item.id, item.data() as Omit<FirebaseVoiceRoom, "id">));
}

export function subscribeToVoiceRooms(communityId: string, listener: (rooms: FirebaseVoiceRoom[]) => void, onError?: (error: Error) => void): Unsubscribe {
  return onSnapshot(query(communityCollection(communityId, "voiceRooms"), orderBy("createdAt", "asc")), (snapshot) => {
    listener(snapshot.docs.map((item) => clean(item.id, item.data() as Omit<FirebaseVoiceRoom, "id">)));
  }, (reason) => onError?.(reason instanceof Error ? reason : new Error("Não foi possível sincronizar as salas de voz.")));
}

export async function createVoiceRoom(communityId: string, name: string): Promise<string> {
  return withFirestoreTimeout((async () => {
    const existing = await getDocs(query(communityCollection(communityId, "voiceRooms"), limit(4)));
    if (existing.size >= 3) throw new Error("Cada comunidade pode ter no máximo 3 salas de voz.");
    const created = await addDoc(communityCollection(communityId, "voiceRooms"), { communityId, name, createdAt: serverTimestamp() });
    return created.id;
  })(), "Criar sala de voz");
}

export async function createCommunity(ownerId: string, name: string, description = ""): Promise<string> {
  return withFirestoreTimeout((async () => {
    const created = await addDoc(collection(firebaseDb, "communities"), { ownerId, name, description, createdAt: serverTimestamp() });
    await setDoc(doc(firebaseDb, "communities", created.id, "members", ownerId), { uid: ownerId, role: "owner", joinedAt: serverTimestamp() });
    await setDoc(doc(firebaseDb, "users", ownerId, "memberships", created.id), { communityId: created.id, role: "owner", joinedAt: serverTimestamp() });
    await addDoc(communityCollection(created.id, "channels"), { communityId: created.id, name: "geral", kind: "text", category: "texto", createdAt: serverTimestamp() });
    return created.id;
  })(), "Criar comunidade");
}

export async function joinCommunity(communityId: string, uid: string): Promise<void> {
  await setDoc(doc(firebaseDb, "communities", communityId, "members", uid), { uid, role: "member", joinedAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(firebaseDb, "users", uid, "memberships", communityId), { communityId, role: "member", joinedAt: serverTimestamp() }, { merge: true });
}

export async function leaveCommunity(communityId: string, uid: string): Promise<void> {
  await deleteDoc(doc(firebaseDb, "communities", communityId, "members", uid));
}

export async function listCommunityChannels(communityId: string): Promise<FirebaseChannel[]> {
  const snapshot = await getDocs(query(communityCollection(communityId, "channels"), orderBy("name")));
  return snapshot.docs.map((item) => clean(item.id, item.data() as Omit<FirebaseChannel, "id">));
}

export async function createChannel(communityId: string, input: Omit<FirebaseChannel, "id" | "communityId">): Promise<string> {
  const created = await addDoc(communityCollection(communityId, "channels"), { ...input, createdAt: serverTimestamp() });
  return created.id;
}

export async function sendChannelMessage(communityId: string, channelId: string, authorId: string, body: string): Promise<string> {
  const created = await addDoc(communityCollection(communityId, "messages"), { channelId, authorId, body, createdAt: serverTimestamp() });
  return created.id;
}

export function subscribeToChannelMessages(communityId: string, channelId: string, listener: (messages: FirebaseMessage[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const constraints: QueryConstraint[] = [where("channelId", "==", channelId), orderBy("createdAt", "asc"), limit(200)];
  return onSnapshot(query(communityCollection(communityId, "messages"), ...constraints), (snapshot) => {
    listener(snapshot.docs.map((item) => clean(item.id, item.data() as Omit<FirebaseMessage, "id">)));
  }, (reason) => onError?.(reason instanceof Error ? reason : new Error("Não foi possível sincronizar as mensagens.")));
}

export async function upsertVoiceMember(communityId: string, member: FirebaseVoiceMember): Promise<void> {
  await setDoc(doc(firebaseDb, "communities", communityId, "voiceMembers", member.uid), { ...member, updatedAt: serverTimestamp() }, { merge: true });
}

export async function removeVoiceMember(communityId: string, uid: string): Promise<void> {
  await deleteDoc(doc(firebaseDb, "communities", communityId, "voiceMembers", uid));
}

export function subscribeToVoiceMembers(communityId: string, roomId: string, listener: (members: FirebaseVoiceMember[]) => void, onError?: (error: Error) => void): Unsubscribe {
  return onSnapshot(query(communityCollection(communityId, "voiceMembers"), where("roomId", "==", roomId)), (snapshot) => {
    listener(snapshot.docs.map((item) => item.data() as FirebaseVoiceMember));
  }, (reason) => onError?.(reason instanceof Error ? reason : new Error("Não foi possível sincronizar a sala de voz.")));
}

function directThreadId(firstUid: string, secondUid: string): string { return [firstUid, secondUid].sort().join("__"); }

export async function sendDirectMessage(firstUid: string, secondUid: string, authorId: string, body: string): Promise<string> {
  const threadId = directThreadId(firstUid, secondUid);
  const created = await addDoc(collection(firebaseDb, "directThreads", threadId, "messages"), { authorId, body, createdAt: serverTimestamp() });
  await setDoc(doc(firebaseDb, "directThreads", threadId), { participants: [firstUid, secondUid], updatedAt: serverTimestamp() }, { merge: true });
  return created.id;
}

export async function createDirectCall(callerId: string, calleeId: string, media: FirebaseDirectCall["media"] = "audio"): Promise<string> {
  const created = await addDoc(collection(firebaseDb, "calls"), { callerId, calleeId, status: "ringing", media, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return created.id;
}

export async function updateDirectCall(callId: string, status: FirebaseDirectCall["status"]): Promise<void> {
  await updateDoc(doc(firebaseDb, "calls", callId), { status, updatedAt: serverTimestamp() });
}

export function subscribeToDirectCalls(uid: string, listener: (calls: FirebaseDirectCall[]) => void, onError?: (error: Error) => void): Unsubscribe {
  return onSnapshot(query(collection(firebaseDb, "calls"), where("calleeId", "==", uid), limit(20)), (snapshot) => listener(snapshot.docs.map((item) => clean(item.id, item.data() as Omit<FirebaseDirectCall, "id">)).filter((item) => item.status === "ringing").sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0)).slice(0, 10)), (reason) => onError?.(reason instanceof Error ? reason : new Error("Não foi possível sincronizar as chamadas.")));
}

export async function publishDirectCallSignal(callId: string, signal: Omit<FirebaseSignal, "id" | "createdAt">): Promise<void> {
  await addDoc(collection(firebaseDb, "calls", callId, "signals"), { ...signal, createdAt: serverTimestamp() });
}

export function subscribeToDirectCallSignals(callId: string, uid: string, listener: (signals: FirebaseSignal[]) => void, onError?: (error: Error) => void): Unsubscribe {
  return onSnapshot(query(collection(firebaseDb, "calls", callId, "signals"), where("to", "==", uid), limit(100)), (snapshot) => listener(snapshot.docs.map((item) => clean(item.id, item.data() as Omit<FirebaseSignal, "id">)).sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0))), (reason) => onError?.(reason instanceof Error ? reason : new Error("Não foi possível sincronizar a sinalização da chamada.")));
}

export async function deleteDirectConversation(firstUid: string, secondUid: string): Promise<void> {
  const threadId = directThreadId(firstUid, secondUid);
  const snapshot = await getDocs(collection(firebaseDb, "directThreads", threadId, "messages"));
  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
  await deleteDoc(doc(firebaseDb, "directThreads", threadId));
}

export function subscribeToDirectMessages(firstUid: string, secondUid: string, listener: (messages: FirebaseDirectMessage[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const threadId = directThreadId(firstUid, secondUid);
  return onSnapshot(query(collection(firebaseDb, "directThreads", threadId, "messages"), orderBy("createdAt", "asc"), limit(200)), (snapshot) => {
    listener(snapshot.docs.map((item) => clean(item.id, item.data() as Omit<FirebaseDirectMessage, "id">)));
  }, (reason) => onError?.(reason instanceof Error ? reason : new Error("Não foi possível sincronizar a conversa.")));
}

export async function setVoiceSpeaking(communityId: string, uid: string, isSpeaking: boolean): Promise<void> {
  await updateDoc(doc(firebaseDb, "communities", communityId, "voiceMembers", uid), { isSpeaking, updatedAt: serverTimestamp() });
}
