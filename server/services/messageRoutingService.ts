import { selectBestChannel, type Channel } from "./channelOrchestrator";

export interface RoutedMessage {
  id: string;
  channel: Channel;
  recipientId: string;
  content: string;
  status: "queued" | "sent" | "delivered" | "failed";
  createdAt: string;
}

const messageQueue: RoutedMessage[] = [];

export function routeMessage(recipientId: string, content: string, preferredChannels?: Channel[]): RoutedMessage {
  const channel = selectBestChannel(preferredChannels || ["whatsapp", "telegram", "web"]);

  const msg: RoutedMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    channel,
    recipientId,
    content,
    status: "queued",
    createdAt: new Date().toISOString(),
  };
  messageQueue.push(msg);
  return msg;
}

export function listMessages(limit = 50): RoutedMessage[] {
  return messageQueue.slice(-limit).reverse();
}

export function getMessageStats(): { total: number; byChannel: Record<string, number>; byStatus: Record<string, number> } {
  const byChannel: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const m of messageQueue) {
    byChannel[m.channel] = (byChannel[m.channel] || 0) + 1;
    byStatus[m.status] = (byStatus[m.status] || 0) + 1;
  }
  return { total: messageQueue.length, byChannel, byStatus };
}
