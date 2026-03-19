type Channel = {
  name: string;
  costPerPatient: number;
  conversionRate: number;
  avgRevenue: number;
};

type ChannelAllocation = {
  channel: string;
  roi: number;
  budgetAllocation: number;
  projectedPatients: number;
  projectedRevenue: number;
  projectedProfit: number;
};

const defaultChannels: Channel[] = [
  { name: "Google Ads", costPerPatient: 40, conversionRate: 0.2, avgRevenue: 120 },
  { name: "Facebook Groups", costPerPatient: 25, conversionRate: 0.15, avgRevenue: 90 },
  { name: "Referral Program", costPerPatient: 10, conversionRate: 0.5, avgRevenue: 150 },
  { name: "Community Outreach", costPerPatient: 15, conversionRate: 0.3, avgRevenue: 110 },
  { name: "SEO / Organic", costPerPatient: 5, conversionRate: 0.1, avgRevenue: 100 },
  { name: "WhatsApp Communities", costPerPatient: 8, conversionRate: 0.35, avgRevenue: 95 }
];

export class PatientAcquisitionEngine {
  allocateBudget(budget: number, channels?: Channel[]): ChannelAllocation[] {
    const ch = channels || defaultChannels;

    const scored = ch.map(c => {
      const roi = (c.avgRevenue * c.conversionRate) / c.costPerPatient;
      return { channel: c, roi };
    });

    const totalROI = scored.reduce((sum, s) => sum + s.roi, 0);

    return scored
      .map(s => {
        const allocation = budget * (s.roi / totalROI);
        const patients = Math.floor(allocation / s.channel.costPerPatient);
        const revenue = patients * s.channel.avgRevenue * s.channel.conversionRate;

        return {
          channel: s.channel.name,
          roi: Math.round(s.roi * 100) / 100,
          budgetAllocation: Math.round(allocation),
          projectedPatients: patients,
          projectedRevenue: Math.round(revenue),
          projectedProfit: Math.round(revenue - allocation)
        };
      })
      .sort((a, b) => b.roi - a.roi);
  }

  generateOutreachMessage(symptom: string, channelType: string): string {
    const messages: Record<string, string> = {
      sms: `Dealing with ${symptom}? Get a physician-reviewed plan in minutes. Text your symptoms to get started. No app needed.`,
      social: `For common issues like ${symptom}, you can text symptoms and get a physician-reviewed plan back quickly. No apps, no waiting rooms. Message me if you'd like to try.`,
      referral: `Know someone dealing with ${symptom}? Share this with them — fast physician-reviewed triage, no waiting room needed.`,
      email: `Quick health help for ${symptom}: Our physician-reviewed triage system provides fast, clear guidance. Text your symptoms and get a plan in minutes.`
    };

    return messages[channelType] || messages.sms;
  }
}

export class GrowthFlywheel {
  private metrics = {
    patientsServed: 0,
    referralsGenerated: 0,
    repeatRate: 0,
    satisfactionScore: 0
  };

  update(data: Partial<typeof this.metrics>) {
    Object.assign(this.metrics, data);
  }

  getGrowthProjection(months: number): Array<{ month: number; patients: number; revenue: number }> {
    const projections = [];
    let basePatients = this.metrics.patientsServed || 10;
    const growthRate = 1 + (this.metrics.referralsGenerated / Math.max(this.metrics.patientsServed, 1)) * 0.5;
    const repeatMultiplier = 1 + this.metrics.repeatRate;

    for (let m = 1; m <= months; m++) {
      basePatients = Math.round(basePatients * growthRate * repeatMultiplier);
      projections.push({
        month: m,
        patients: basePatients,
        revenue: basePatients * 35
      });
    }

    return projections;
  }

  getMetrics() {
    return { ...this.metrics };
  }
}

export const patientAcquisitionEngine = new PatientAcquisitionEngine();
export const growthFlywheel = new GrowthFlywheel();
