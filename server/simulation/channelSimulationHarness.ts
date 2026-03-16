export interface ChannelPerformance {
  channel: string;
  avgCompletionTime: number;
  dropoutRate: number;
  avgQuestions: number;
  compressionRatio: number;
  deliverySuccessRate: number;
  typicalUserSatisfaction: number;
}

const channelProfiles: Record<string, ChannelPerformance> = {
  telegram: {
    channel: "telegram",
    avgCompletionTime: 22,
    dropoutRate: 0.07,
    avgQuestions: 8.4,
    compressionRatio: 0.82,
    deliverySuccessRate: 0.98,
    typicalUserSatisfaction: 4.2,
  },
  whatsapp: {
    channel: "whatsapp",
    avgCompletionTime: 28,
    dropoutRate: 0.12,
    avgQuestions: 9.1,
    compressionRatio: 0.78,
    deliverySuccessRate: 0.96,
    typicalUserSatisfaction: 4.0,
  },
  web: {
    channel: "web",
    avgCompletionTime: 18,
    dropoutRate: 0.05,
    avgQuestions: 7.8,
    compressionRatio: 1.0,
    deliverySuccessRate: 0.99,
    typicalUserSatisfaction: 4.4,
  },
  sms: {
    channel: "sms",
    avgCompletionTime: 35,
    dropoutRate: 0.21,
    avgQuestions: 6.2,
    compressionRatio: 0.61,
    deliverySuccessRate: 0.93,
    typicalUserSatisfaction: 3.6,
  },
};

export function simulateChannelPerformance(channel: string): ChannelPerformance {
  return channelProfiles[channel] ?? {
    channel,
    avgCompletionTime: 25,
    dropoutRate: 0.10,
    avgQuestions: 8.0,
    compressionRatio: 0.80,
    deliverySuccessRate: 0.95,
    typicalUserSatisfaction: 3.9,
  };
}

export function getAllChannelPerformance(): ChannelPerformance[] {
  return Object.values(channelProfiles);
}
