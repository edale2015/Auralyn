export interface TelepresenceDeviceRequest {
  sessionId: string;
  patientId: string;
  requestedDevices: Array<'wall_screen' | 'robot' | 'otoscope' | 'swab_module' | 'vitals_module' | 'ekg_module' | 'xray_interface'>;
  reason: string;
}

export function buildTelepresenceSessionPlan(req: TelepresenceDeviceRequest) {
  const tasks: string[] = [];
  if (req.requestedDevices.includes('wall_screen')) tasks.push('Open clinician video on wall-mounted display.');
  if (req.requestedDevices.includes('robot')) tasks.push('Position robot at bedside intake location.');
  if (req.requestedDevices.includes('otoscope')) tasks.push('Enable otoscope guidance workflow.');
  if (req.requestedDevices.includes('swab_module')) tasks.push('Launch throat-swab assistance flow.');
  if (req.requestedDevices.includes('vitals_module')) tasks.push('Start BP, temp, SpO2 capture.');
  if (req.requestedDevices.includes('ekg_module')) tasks.push('Prepare 12-lead EKG acquisition checklist.');
  if (req.requestedDevices.includes('xray_interface')) tasks.push('Queue X-ray coordination request for credentialed operator.');
  return {
    sessionId: req.sessionId,
    patientId: req.patientId,
    tasks,
    safetyChecks: [
      'Confirm patient identity.',
      'Confirm clinician connected before invasive steps.',
      'Require on-site assistant for swab, blood draw, or imaging-related handoff.',
    ],
  };
}
