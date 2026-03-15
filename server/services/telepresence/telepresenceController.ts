export type DeviceCommand =
  | 'activate_EKG_device'
  | 'activate_otoscope'
  | 'activate_xray_kiosk'
  | 'activate_stethoscope'
  | 'activate_dermoscope'
  | 'activate_urinalysis_reader'
  | 'activate_throat_camera'
  | 'activate_vitals_station'
  | 'enable_telepresence_video'
  | 'enable_physician_review_mode';

export interface TelepresenceCommand {
  command: DeviceCommand;
  device: string;
  priority: 'immediate' | 'routine' | 'optional';
  reasonForActivation: string;
}

export interface TelepresenceControlPlan {
  commands: TelepresenceCommand[];
  sessionMode: 'autonomous' | 'physician_led' | 'hybrid';
  estimatedDurationMin: number;
  deviceChecklist: string[];
}

const TEST_DEVICE_MAP: Record<string, { command: DeviceCommand; device: string; priority: 'immediate' | 'routine' | 'optional' }> = {
  ekg: { command: 'activate_EKG_device', device: 'EKG module', priority: 'immediate' },
  ecg: { command: 'activate_EKG_device', device: 'EKG module', priority: 'immediate' },
  otoscope: { command: 'activate_otoscope', device: 'Digital otoscope', priority: 'routine' },
  otoscopy: { command: 'activate_otoscope', device: 'Digital otoscope', priority: 'routine' },
  chest_xray: { command: 'activate_xray_kiosk', device: 'X-ray kiosk', priority: 'immediate' },
  cxr: { command: 'activate_xray_kiosk', device: 'X-ray kiosk', priority: 'immediate' },
  stethoscope: { command: 'activate_stethoscope', device: 'Digital stethoscope', priority: 'routine' },
  auscultation: { command: 'activate_stethoscope', device: 'Digital stethoscope', priority: 'routine' },
  dermoscope: { command: 'activate_dermoscope', device: 'Dermoscope camera', priority: 'optional' },
  urinalysis: { command: 'activate_urinalysis_reader', device: 'Urinalysis reader', priority: 'routine' },
  ua: { command: 'activate_urinalysis_reader', device: 'Urinalysis reader', priority: 'routine' },
  throat_exam: { command: 'activate_throat_camera', device: 'Throat camera', priority: 'routine' },
  vitals: { command: 'activate_vitals_station', device: 'Vitals station', priority: 'immediate' },
};

export function telepresenceController(plan: {
  tests?: string[];
  complaint?: string;
  requirePhysician?: boolean;
}): TelepresenceControlPlan {
  const commands: TelepresenceCommand[] = [];
  const deviceChecklist: string[] = [];

  // ── Always activate vitals ────────────────────────────────────────────────
  commands.push({ command: 'activate_vitals_station', device: 'Vitals station', priority: 'immediate', reasonForActivation: 'Baseline vital signs required for all encounters' });
  deviceChecklist.push('Vitals station — online');

  // ── Test-based device activation ─────────────────────────────────────────
  const tests = (plan.tests ?? []).map((t) => t.toLowerCase().replace(/\s+/g, '_'));
  const added = new Set<DeviceCommand>();

  for (const test of tests) {
    const mapping = TEST_DEVICE_MAP[test];
    if (mapping && !added.has(mapping.command)) {
      added.add(mapping.command);
      commands.push({
        command: mapping.command,
        device: mapping.device,
        priority: mapping.priority,
        reasonForActivation: `Test ordered: ${test}`,
      });
      deviceChecklist.push(`${mapping.device} — standby`);
    }
  }

  // ── Complaint-based defaults ──────────────────────────────────────────────
  const complaint = plan.complaint?.toLowerCase() ?? '';
  if ((complaint.includes('chest_pain') || complaint.includes('chest pain')) && !added.has('activate_EKG_device')) {
    commands.push({ command: 'activate_EKG_device', device: 'EKG module', priority: 'immediate', reasonForActivation: 'Chest pain complaint — ECG required' });
    deviceChecklist.push('EKG module — standby');
  }
  if ((complaint.includes('ear_pain') || complaint.includes('ear pain')) && !added.has('activate_otoscope')) {
    commands.push({ command: 'activate_otoscope', device: 'Digital otoscope', priority: 'routine', reasonForActivation: 'Ear complaint — otoscope required' });
    deviceChecklist.push('Otoscope — standby');
  }
  if ((complaint.includes('sore_throat') || complaint.includes('throat')) && !added.has('activate_throat_camera')) {
    commands.push({ command: 'activate_throat_camera', device: 'Throat camera', priority: 'routine', reasonForActivation: 'Throat complaint — camera required' });
    deviceChecklist.push('Throat camera — standby');
  }
  if ((complaint.includes('dysuria') || complaint.includes('urinary')) && !added.has('activate_urinalysis_reader')) {
    commands.push({ command: 'activate_urinalysis_reader', device: 'Urinalysis reader', priority: 'routine', reasonForActivation: 'Urinary complaint — UA required' });
    deviceChecklist.push('Urinalysis reader — standby');
  }

  // ── Physician review ─────────────────────────────────────────────────────
  if (plan.requirePhysician) {
    commands.push({ command: 'enable_physician_review_mode', device: 'Video link', priority: 'immediate', reasonForActivation: 'Physician review required' });
    commands.push({ command: 'enable_telepresence_video', device: 'HD camera', priority: 'immediate', reasonForActivation: 'Telepresence video for physician consultation' });
    deviceChecklist.push('Video link — physician on call');
  }

  const immediateCount = commands.filter((c) => c.priority === 'immediate').length;
  const sessionMode = plan.requirePhysician ? 'physician_led' : immediateCount >= 3 ? 'hybrid' : 'autonomous';
  const estimatedDurationMin = 5 + commands.length * 3 + (plan.requirePhysician ? 10 : 0);

  commands.sort((a, b) => {
    const order = { immediate: 0, routine: 1, optional: 2 };
    return order[a.priority] - order[b.priority];
  });

  return { commands, sessionMode, estimatedDurationMin, deviceChecklist };
}
