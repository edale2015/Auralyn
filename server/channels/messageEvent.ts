import { z } from "zod";

export const ChannelEnum = z.enum(["whatsapp", "telegram", "web", "test"]);
export type Channel = z.infer<typeof ChannelEnum>;

export const MessageEventSchema = z.object({
  channel: ChannelEnum,
  externalUserId: z.string(),
  chatId: z.string(),
  text: z.string(),
  timestamp: z.string(),
  messageId: z.string(),
  rawSignatureVerified: z.boolean().default(true),
  media: z.array(z.object({
    url: z.string(),
    mimeType: z.string().optional(),
    filename: z.string().optional(),
  })).default([]),
});

export type MessageEvent = z.infer<typeof MessageEventSchema>;

export function buildConversationId(channel: Channel, externalUserId: string): string {
  return `${channel}:${externalUserId}`;
}

export function parseConversationId(conversationId: string): { channel: Channel; externalUserId: string } {
  const idx = conversationId.indexOf(":");
  if (idx < 0) throw new Error(`Invalid conversationId: ${conversationId}`);
  const channel = conversationId.slice(0, idx) as Channel;
  const externalUserId = conversationId.slice(idx + 1);
  return { channel, externalUserId };
}
