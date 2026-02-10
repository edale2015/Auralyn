import { sendWhatsAppMessage } from "../whatsapp/send";
import { registerChannelSender, type ChannelSender } from "./channelAdapter";

const whatsappSender: ChannelSender = {
  async send(externalUserId: string, text: string): Promise<void> {
    await sendWhatsAppMessage(externalUserId, text);
  },
};

export function registerWhatsAppSender() {
  registerChannelSender("whatsapp", whatsappSender);
}
