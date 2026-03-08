export type Channel = "whatsapp" | "telegram" | "web" | "sms";

export interface ChannelConfig {
  channel: Channel;
  enabled: boolean;
  priority: number;
}

const channelConfigs: ChannelConfig[] = [
  { channel: "whatsapp", enabled: true, priority: 1 },
  { channel: "telegram", enabled: true, priority: 2 },
  { channel: "web", enabled: true, priority: 3 },
  { channel: "sms", enabled: false, priority: 4 },
];

export function getChannelConfigs(): ChannelConfig[] {
  return [...channelConfigs];
}

export function selectBestChannel(preferredChannels: Channel[]): Channel {
  const enabled = channelConfigs.filter((c) => c.enabled).sort((a, b) => a.priority - b.priority);

  for (const pref of preferredChannels) {
    const found = enabled.find((c) => c.channel === pref);
    if (found) return found.channel;
  }

  return enabled.length > 0 ? enabled[0].channel : "web";
}
