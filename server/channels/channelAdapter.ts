import { parseConversationId, type Channel } from "./messageEvent";

export interface ChannelSender {
  send(externalUserId: string, text: string): Promise<void>;
}

const senders = new Map<Channel, ChannelSender>();

export function registerChannelSender(channel: Channel, sender: ChannelSender) {
  senders.set(channel, sender);
}

export async function sendReply(conversationId: string, text: string): Promise<void> {
  const { channel, externalUserId } = parseConversationId(conversationId);
  const sender = senders.get(channel);
  if (!sender) {
    console.warn(`[ChannelAdapter] No sender registered for channel: ${channel}`);
    return;
  }
  await sender.send(externalUserId, text);
}

export function getRegisteredChannels(): Channel[] {
  return [...senders.keys()];
}
