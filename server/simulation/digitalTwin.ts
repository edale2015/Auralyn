type ClinicState = {
  patientsPerDay: number;
  avgRevenue: number;
  denialRate: number;
  capacity: number;
  payerMix: Record<string, number>;
};

export class DigitalTwin {
  private state: ClinicState;
  private history: Array<{ timestamp: string; state: ClinicState }> = [];

  constructor(initial?: Partial<ClinicState>) {
    this.state = {
      patientsPerDay: initial?.patientsPerDay ?? 50,
      avgRevenue: initial?.avgRevenue ?? 120,
      denialRate: initial?.denialRate ?? 0.08,
      capacity: initial?.capacity ?? 0.65,
      payerMix: initial?.payerMix ?? {
        medicare: 0.3,
        medicaid: 0.15,
        aetna: 0.15,
        united: 0.12,
        cigna: 0.08,
        bcbs: 0.1,
        humana: 0.05,
        self_pay: 0.05
      }
    };
  }

  update(data: Partial<ClinicState>) {
    this.history.push({
      timestamp: new Date().toISOString(),
      state: { ...this.state }
    });

    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }

    this.state = { ...this.state, ...data };
  }

  getState(): ClinicState {
    return { ...this.state };
  }

  getHistory() {
    return [...this.history];
  }

  getProjectedDailyRevenue(): number {
    return this.state.patientsPerDay * this.state.avgRevenue * (1 - this.state.denialRate);
  }

  getProjectedMonthlyRevenue(): number {
    return this.getProjectedDailyRevenue() * 22;
  }
}

export const digitalTwin = new DigitalTwin();
