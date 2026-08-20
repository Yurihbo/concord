import { and, desc, eq, gt, inArray, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, callSignals, calls, channels, communities, communityMembers, directMessages, directThreadMembers, directThreads, friendships, messages, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); }
    catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

function generatePublicId(openId: string): string {
  let hash = 0;
  for (const char of openId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `CON-${hash.toString(36).toUpperCase().padStart(8, "0")}`.slice(0, 12);
}

export async function upsertUser(user: Omit<InsertUser, "publicId"> & { publicId?: string }): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  const values: InsertUser = { openId: user.openId, publicId: user.publicId ?? generatePublicId(user.openId) };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod", "avatarUrl", "bio"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function updateUserProfile(userId: number, input: { name?: string; avatarUrl?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(users).set(input).where(eq(users.id, userId));
  return db.select().from(users).where(eq(users.id, userId)).limit(1);
}

export async function listCommunitiesForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ community: communities }).from(communityMembers).innerJoin(communities, eq(communityMembers.communityId, communities.id)).where(eq(communityMembers.userId, userId));
}

export async function createCommunity(ownerId: number, input: { name: string; description?: string; iconUrl?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const created = await db.insert(communities).values({ ownerId, name: input.name, description: input.description, iconUrl: input.iconUrl }).$returningId();
  const id = created[0]?.id;
  if (!id) throw new Error("Community could not be created");
  await db.insert(communityMembers).values({ communityId: id, userId: ownerId });
  return db.select().from(communities).where(eq(communities.id, id)).limit(1);
}

export async function listChannels(communityId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(channels).where(eq(channels.communityId, communityId));
}

export async function listChannelMessages(channelId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ message: messages, author: users }).from(messages).innerJoin(users, eq(messages.authorId, users.id)).where(eq(messages.channelId, channelId)).orderBy(desc(messages.createdAt)).limit(limit);
}

export async function createChannelMessage(channelId: number, authorId: number, body: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const created = await db.insert(messages).values({ channelId, authorId, body }).$returningId();
  return db.select().from(messages).where(eq(messages.id, created[0]!.id)).limit(1);
}

export async function createFriendRequest(requesterId: number, addresseeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (requesterId === addresseeId) throw new Error("Cannot add yourself");
  const existing = await db.select().from(friendships).where(or(and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId)), and(eq(friendships.requesterId, addresseeId), eq(friendships.addresseeId, requesterId)))).limit(1);
  if (existing.length) return existing;
  return db.insert(friendships).values({ requesterId, addresseeId }).$returningId();
}

export async function listFriendships(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(friendships).where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)));
  const otherIds = rows.map((row) => row.requesterId === userId ? row.addresseeId : row.requesterId);
  if (!otherIds.length) return [];
  const people = await db.select().from(users).where(inArray(users.id, otherIds));
  return rows.map((friendship) => ({ friendship, user: people.find((person) => person.id === (friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId)) })).filter((entry) => entry.user);
}

export async function searchUsersByPublicId(currentUserId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: users.id, publicId: users.publicId, name: users.name, avatarUrl: users.avatarUrl }).from(users).where(and(like(users.publicId, `%${query.trim().toUpperCase()}%`), eq(users.role, "user"))).limit(20);
}

export async function createCall(callerId: number, calleeId: number, media: "audio" | "video" | "screen" = "audio") {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const created = await db.insert(calls).values({ callerId, calleeId, media, status: "ringing" }).$returningId();
  return db.select().from(calls).where(eq(calls.id, created[0]!.id)).limit(1);
}

export async function updateCall(userId: number, callId: number, status: "connected" | "declined" | "ended" | "missed") {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(calls).set({ status, endedAt: status === "ended" || status === "declined" || status === "missed" ? new Date() : undefined }).where(and(eq(calls.id, callId), or(eq(calls.callerId, userId), eq(calls.calleeId, userId))));
  return db.select().from(calls).where(eq(calls.id, callId)).limit(1);
}

export async function addCallSignal(userId: number, callId: number, kind: "offer" | "answer" | "ice", payload: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const call = await db.select().from(calls).where(and(eq(calls.id, callId), or(eq(calls.callerId, userId), eq(calls.calleeId, userId)))).limit(1);
  if (!call[0]) throw new Error("Call not found");
  await db.insert(callSignals).values({ callId, senderId: userId, kind, payload });
  return { success: true } as const;
}

export async function listCallSignals(userId: number, callId: number, afterId?: number) {
  const db = await getDb();
  if (!db) return [];
  const call = await db.select().from(calls).where(and(eq(calls.id, callId), or(eq(calls.callerId, userId), eq(calls.calleeId, userId)))).limit(1);
  if (!call[0]) throw new Error("Call not found");
  const conditions = [eq(callSignals.callId, callId)];
  if (afterId) conditions.push(gt(callSignals.id, afterId));
  return db.select().from(callSignals).where(and(...conditions)).orderBy(callSignals.id);
}

export async function setUserPresence(userId: number, presence: "online" | "away" | "offline") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ presence }).where(eq(users.id, userId));
}

export async function listCalls(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(calls).where(or(eq(calls.callerId, userId), eq(calls.calleeId, userId))).orderBy(desc(calls.startedAt)).limit(30);
}

export async function updateFriendship(userId: number, friendshipId: number, status: "accepted" | "declined") {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(friendships).set({ status }).where(and(eq(friendships.id, friendshipId), eq(friendships.addresseeId, userId)));
  return db.select().from(friendships).where(eq(friendships.id, friendshipId)).limit(1);
}

export async function getOrCreateDirectThread(userId: number, friendId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db.select({ threadId: directThreadMembers.threadId }).from(directThreadMembers).where(eq(directThreadMembers.userId, userId));
  for (const row of existing) {
    const members = await db.select().from(directThreadMembers).where(and(eq(directThreadMembers.threadId, row.threadId), eq(directThreadMembers.userId, friendId)));
    if (members.length) return row.threadId;
  }
  const thread = await db.insert(directThreads).values({}).$returningId();
  const threadId = thread[0]!.id;
  await db.insert(directThreadMembers).values([{ threadId, userId }, { threadId, userId: friendId }]);
  return threadId;
}

export async function listDirectMessages(threadId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ message: directMessages, author: users }).from(directMessages).innerJoin(users, eq(directMessages.authorId, users.id)).where(eq(directMessages.threadId, threadId)).orderBy(desc(directMessages.createdAt));
}

export async function createDirectMessage(threadId: number, authorId: number, body: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.insert(directMessages).values({ threadId, authorId, body }).$returningId();
}
