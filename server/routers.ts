import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createChannelMessage, createCommunity, createDirectMessage, createFriendRequest, getOrCreateDirectThread, listChannelMessages, listChannels, listCommunitiesForUser, listDirectMessages, listFriendships, updateFriendship, updateUserProfile } from "./db";

const nonEmpty = z.string().trim().min(1).max(200);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  profile: router({
    update: protectedProcedure.input(z.object({ name: nonEmpty.optional(), avatarUrl: z.string().url().nullable().optional() })).mutation(({ ctx, input }) => updateUserProfile(ctx.user.id, input)),
  }),
  communities: router({
    list: protectedProcedure.query(({ ctx }) => listCommunitiesForUser(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: nonEmpty.max(120), description: z.string().max(500).optional(), iconUrl: z.string().url().optional() })).mutation(({ ctx, input }) => createCommunity(ctx.user.id, input)),
    channels: protectedProcedure.input(z.object({ communityId: z.number().int().positive() })).query(({ input }) => listChannels(input.communityId)),
  }),
  messages: router({
    list: protectedProcedure.input(z.object({ channelId: z.number().int().positive(), limit: z.number().int().min(1).max(100).optional() })).query(({ input }) => listChannelMessages(input.channelId, input.limit)),
    send: protectedProcedure.input(z.object({ channelId: z.number().int().positive(), body: nonEmpty.max(4000) })).mutation(({ ctx, input }) => createChannelMessage(input.channelId, ctx.user.id, input.body)),
  }),
  friends: router({
    list: protectedProcedure.query(({ ctx }) => listFriendships(ctx.user.id)),
    request: protectedProcedure.input(z.object({ addresseeId: z.number().int().positive() })).mutation(({ ctx, input }) => createFriendRequest(ctx.user.id, input.addresseeId)),
    respond: protectedProcedure.input(z.object({ friendshipId: z.number().int().positive(), status: z.enum(["accepted", "declined"]) })).mutation(({ ctx, input }) => updateFriendship(ctx.user.id, input.friendshipId, input.status)),
  }),
  dms: router({
    open: protectedProcedure.input(z.object({ friendId: z.number().int().positive() })).mutation(({ ctx, input }) => getOrCreateDirectThread(ctx.user.id, input.friendId)),
    list: protectedProcedure.input(z.object({ threadId: z.number().int().positive() })).query(({ input }) => listDirectMessages(input.threadId)),
    send: protectedProcedure.input(z.object({ threadId: z.number().int().positive(), body: nonEmpty.max(4000) })).mutation(({ ctx, input }) => createDirectMessage(input.threadId, ctx.user.id, input.body)),
  }),
});

export type AppRouter = typeof appRouter;
