import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  publicId: varchar("publicId", { length: 24 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  avatarUrl: text("avatarUrl"),
  presence: mysqlEnum("presence", ["online", "away", "offline"]).default("online").notNull(),
  bio: text("bio"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const communities = mysqlTable("communities", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  iconUrl: text("iconUrl"),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const communityMembers = mysqlTable("communityMembers", {
  id: int("id").autoincrement().primaryKey(),
  communityId: int("communityId").notNull(),
  userId: int("userId").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export const channelCategories = mysqlTable("channelCategories", {
  id: int("id").autoincrement().primaryKey(),
  communityId: int("communityId").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  position: int("position").default(0).notNull(),
});

export const channels = mysqlTable("channels", {
  id: int("id").autoincrement().primaryKey(),
  communityId: int("communityId").notNull(),
  categoryId: int("categoryId"),
  name: varchar("name", { length: 80 }).notNull(),
  kind: mysqlEnum("kind", ["text", "voice"]).default("text").notNull(),
  position: int("position").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  channelId: int("channelId").notNull(),
  authorId: int("authorId").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const friendships = mysqlTable("friendships", {
  id: int("id").autoincrement().primaryKey(),
  requesterId: int("requesterId").notNull(),
  addresseeId: int("addresseeId").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "declined"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const directThreads = mysqlTable("directThreads", {
  id: int("id").autoincrement().primaryKey(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const directThreadMembers = mysqlTable("directThreadMembers", {
  id: int("id").autoincrement().primaryKey(),
  threadId: int("threadId").notNull(),
  userId: int("userId").notNull(),
});

export const calls = mysqlTable("calls", {
  id: int("id").autoincrement().primaryKey(),
  callerId: int("callerId").notNull(),
  calleeId: int("calleeId").notNull(),
  status: mysqlEnum("status", ["ringing", "connected", "declined", "ended", "missed"]).default("ringing").notNull(),
  media: mysqlEnum("media", ["audio", "video", "screen"]).default("audio").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  endedAt: timestamp("endedAt"),
});

export const callSignals = mysqlTable("callSignals", {
  id: int("id").autoincrement().primaryKey(),
  callId: int("callId").notNull(),
  senderId: int("senderId").notNull(),
  kind: mysqlEnum("kind", ["offer", "answer", "ice"]).notNull(),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const directMessages = mysqlTable("directMessages", {
  id: int("id").autoincrement().primaryKey(),
  threadId: int("threadId").notNull(),
  authorId: int("authorId").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const voiceMembers = mysqlTable("voiceMembers", {
  id: int("id").autoincrement().primaryKey(),
  channelId: int("channelId").notNull(),
  userId: int("userId").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().onUpdateNow().notNull(),
  isSpeaking: boolean("isSpeaking").default(false).notNull(),
});

export type User = typeof users.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Community = typeof communities.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type VoiceMember = typeof voiceMembers.$inferSelect;
