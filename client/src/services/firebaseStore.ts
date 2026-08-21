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
export type FirebaseDirectMessage = { id: string; authorId: string; body: string; createdAt?: unknown };
export type FirebaseVoiceRoom = { id: string; name: string; communityId: string; createdAt?: unknown };
export type FirebaseSignal = { id: string; from: string; to: string; kind: "offer" | "answer" | "ice"; payload: string; createdAt?: unknown };

function clean<T extends DocumentData>(id: string, data: T): T & { id: string } {
  return { id, ...data };
}

function userDoc(uid: string) { return doc(firebaseDb, "users", uid); }
function communityDoc(id: string) { return doc(firebaseDb, "communities", id); }
function communityCollection(id: string, child: string) { return collection(firebaseDb, "communities", id, child); }

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
  await setDoc(doc(firebaseDb, "friendRequests", friendshipId(requesterId, addresseeId)), { requesterId, addresseeId, status: "pending", updatedAt: serverTimestamp() });
}

export async function listFriendships(uid: string): Promise<FirebaseFriendship[]> {
  const [sent, received] = await Promise.all([
    getDocs(query(collection(firebaseDb, "friendRequests"), where("requesterId", "==", uid))),
    getDocs(query(collection(firebaseDb, "friendRequests"), where("addresseeId", "==", uid))),
  ]);
  const rows = [...sent.docs, ...received.docs];
  return rows.map((item) => clean(item.id, item.data() as Omit<FirebaseFriendship, "id">));
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

export async function listCommunities(uid: string): Promise<FirebaseCommunity[]> {
  const membershipSnapshot = await getDocs(collection(firebaseDb, "users", uid, "memberships"));
  const communities = await Promise.all(membershipSnapshot.docs.map(async (membership) => {
    const snapshot = await getDoc(communityDoc(membership.id));
    return snapshot.exists() ? clean(snapshot.id, snapshot.data() as Omit<FirebaseCommunity, "id">) : null;
  }));
  return communities.filter((community): community is FirebaseCommunity => Boolean(community));
}

export async function listVoiceRooms(communityId: string): Promise<FirebaseVoiceRoom[]> {
  const snapshot = await getDocs(query(communityCollection(communityId, "voiceRooms"), orderBy("createdAt", "asc")));
  return snapshot.docs.map((item) => clean(item.id, item.data() as Omit<FirebaseVoiceRoom, "id">));
}

export async function createVoiceRoom(communityId: string, name: string): Promise<string> {
  const existing = await getDocs(query(communityCollection(communityId, "voiceRooms"), limit(4)));
  if (existing.size >= 3) throw new Error("Cada comunidade pode ter no máximo 3 salas de voz.");
  const created = await addDoc(communityCollection(communityId, "voiceRooms"), { communityId, name, createdAt: serverTimestamp() });
  return created.id;
}

export async function createCommunity(ownerId: string, name: string, description = ""): Promise<string> {
  const created = await addDoc(collection(firebaseDb, "communities"), { ownerId, name, description, createdAt: serverTimestamp() });
  await setDoc(doc(firebaseDb, "communities", created.id, "members", ownerId), { uid: ownerId, role: "owner", joinedAt: serverTimestamp() });
  await setDoc(doc(firebaseDb, "users", ownerId, "memberships", created.id), { communityId: created.id, role: "owner", joinedAt: serverTimestamp() });
  return created.id;
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

export function subscribeToDirectMessages(firstUid: string, secondUid: string, listener: (messages: FirebaseDirectMessage[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const threadId = directThreadId(firstUid, secondUid);
  return onSnapshot(query(collection(firebaseDb, "directThreads", threadId, "messages"), orderBy("createdAt", "asc"), limit(200)), (snapshot) => {
    listener(snapshot.docs.map((item) => clean(item.id, item.data() as Omit<FirebaseDirectMessage, "id">)));
  }, (reason) => onError?.(reason instanceof Error ? reason : new Error("Não foi possível sincronizar a conversa.")));
}

export async function setVoiceSpeaking(communityId: string, uid: string, isSpeaking: boolean): Promise<void> {
  await updateDoc(doc(firebaseDb, "communities", communityId, "voiceMembers", uid), { isSpeaking, updatedAt: serverTimestamp() });
}
