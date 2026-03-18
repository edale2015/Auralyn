import { randomUUID } from 'crypto';

export type LegacySheetRow = Record<string, string | number | boolean | null | undefined>;

export interface LegacyTabData {
  tabName: string;
  rows: LegacySheetRow[];
}

export interface SymptomPackRow {
  id: string;
  system: string;
  tier: 'symptom';
  title: string;
  isActive: boolean;
  version: number;
  aliases: string[];
  likelyDisposition: 'self_care' | 'office_followup' | 'telemed_now' | 'urgent_care' | 'er_now';
  questionsJson: string;
  redFlags: string[];
  autoEscalateRules: string[];
  autoReviewRules: string[];
  planTemplateKey: string;
  tags?: string[];
}

export interface ModifierPackRow {
  id: string;
  system: string;
  tier: 'modifier';
  title: string;
  isActive: boolean;
  version: number;
  appliesToSymptoms: string[];
  triggers: string[];
  riskAdjustmentsJson: string;
  tags?: string[];
}

export interface PackQuestionRow {
  id: string;
  packId: string;
  questionId: string;
  prompt: string;
  type: 'yes_no' | 'single_select' | 'multi_select' | 'text' | 'number' | 'duration' | 'severity';
  priority: number;
  required: boolean;
  isActive: boolean;
  version: number;
  optionsJson?: string;
  helpText?: string;
}

export interface ClinicianAlgorithmRow {
  id: string;
  system: string;
  tier: 'clinician_algorithm';
  title: string;
  isActive: boolean;
  version: number;
  entryCriteria: string[];
  requiredInputs: string[];
  outputActions: string[];
  notes?: string[];
  tags?: string[];
}

export interface PlanTemplateRow {
  key: string;
  diagnosisLabel: string;
  defaultDisposition: string;
  summary: string;
  homeCare: string[];
  medsJson: string;
  followUp: string[];
  returnPrecautions: string[];
  patientMessage: string;
}

export interface MappingIssue {
  severity: 'info' | 'warning' | 'error';
  tabName: string;
  rowIndex?: number;
  message: string;
}

export interface LegacyMappingOutput {
  symptomPackRows: SymptomPackRow[];
  modifierPackRows: ModifierPackRow[];
  questionRows: PackQuestionRow[];
  algorithmRows: ClinicianAlgorithmRow[];
  planTemplateRows: PlanTemplateRow[];
  issues: MappingIssue[];
}

function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function value(row: LegacySheetRow, ...keys: string[]): string {
  for (const key of keys) {
    const found = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
    if (found && row[found] != null && String(row[found]).trim() !== '') return String(row[found]).trim();
  }
  return '';
}

function splitList(input: string): string[] {
  if (!input) return [];
  return input.split(/\||,|;|\n/).map(s => s.trim()).filter(Boolean);
}

function inferDisposition(raw: string): SymptomPackRow['likelyDisposition'] {
  const v = raw.toLowerCase();
  if (v.includes('er')) return 'er_now';
  if (v.includes('urgent')) return 'urgent_care';
  if (v.includes('tele')) return 'telemed_now';
  if (v.includes('office')) return 'office_followup';
  return 'self_care';
}

function inferQuestionType(question: string): PackQuestionRow['type'] {
  const q = question.toLowerCase();
  if (q.includes('how many') || q.includes('what is the highest') || q.includes('from 0-10')) return q.includes('0-10') ? 'severity' : 'number';
  if (q.includes('how long')) return 'duration';
  return 'yes_no';
}

function mapComplaintListTab(tab: LegacyTabData, system: string, output: LegacyMappingOutput) {
  for (const [idx, row] of tab.rows.entries()) {
    const complaint = value(row, 'Complaint', 'Chief Complaint', 'Title', 'Name');
    if (!complaint) continue;
    const packId = `${slugify(system)}_${slugify(complaint)}`;
    const disposition = inferDisposition(value(row, 'Disposition', 'LikelyDisposition', 'Likely Disposition'));
    const redFlags = splitList(value(row, 'Red Flags', 'RedFlag', 'Red_Flags'));
    const reviewRules = splitList(value(row, 'Review Rules', 'AutoReviewRules'));
    const escalateRules = splitList(value(row, 'Escalate Rules', 'AutoEscalateRules'));
    const aliases = splitList(value(row, 'Aliases', 'Synonyms'));
    output.symptomPackRows.push({
      id: packId,
      system,
      tier: 'symptom',
      title: complaint,
      isActive: true,
      version: 1,
      aliases: aliases.length ? aliases : [complaint],
      likelyDisposition: disposition,
      questionsJson: '[]',
      redFlags,
      autoEscalateRules: escalateRules,
      autoReviewRules: reviewRules,
      planTemplateKey: packId,
      tags: [system, 'legacy_import'],
    });

    output.planTemplateRows.push({
      key: packId,
      diagnosisLabel: `${complaint} pattern`,
      defaultDisposition: disposition,
      summary: value(row, 'Summary', 'Plan Summary') || `${complaint} imported from legacy sheet.`,
      homeCare: splitList(value(row, 'Home Care', 'HomeCare')),
      medsJson: '[]',
      followUp: splitList(value(row, 'Follow Up', 'FollowUp')),
      returnPrecautions: splitList(value(row, 'Return Precautions', 'ReturnPrecautions')),
      patientMessage: value(row, 'Patient Message', 'PatientMessage') || `Your symptoms fit the ${complaint} pathway and will be reviewed according to clinic rules.`,
    });

    output.issues.push({ severity: 'info', tabName: tab.tabName, rowIndex: idx + 2, message: `Mapped complaint '${complaint}' to symptom pack ${packId}` });
  }
}

function mapSecondaryQuestionsTab(tab: LegacyTabData, system: string, output: LegacyMappingOutput) {
  for (const [idx, row] of tab.rows.entries()) {
    const complaint = value(row, 'Complaint', 'Chief Complaint', 'Pack', 'PackId');
    const question = value(row, 'Question', 'Prompt', 'Secondary Question');
    if (!complaint || !question) continue;
    const packId = complaint.includes('_') ? complaint : `${slugify(system)}_${slugify(complaint)}`;
    const qid = value(row, 'QuestionId', 'Key') || slugify(question).slice(0, 40);
    const priority = Number(value(row, 'Priority', 'Order')) || idx + 1;
    output.questionRows.push({
      id: randomUUID(),
      packId,
      questionId: qid,
      prompt: question,
      type: inferQuestionType(question),
      priority,
      required: /required/i.test(value(row, 'Required')),
      isActive: true,
      version: 1,
      helpText: value(row, 'HelpText', 'Help Text') || undefined,
    });
    output.issues.push({ severity: 'info', tabName: tab.tabName, rowIndex: idx + 2, message: `Mapped question '${qid}' to ${packId}` });
  }
}

function mapModifierTab(tab: LegacyTabData, system: string, output: LegacyMappingOutput) {
  for (const [idx, row] of tab.rows.entries()) {
    const title = value(row, 'Modifier', 'Title', 'Name');
    if (!title) continue;
    const id = `${slugify(system)}_mod_${slugify(title)}`;
    const applies = splitList(value(row, 'Applies To', 'AppliesToSymptoms', 'Complaint'))
      .map(x => x.includes('_') ? x : `${slugify(system)}_${slugify(x)}`);
    const triggers = splitList(value(row, 'Triggers', 'Trigger Rules', 'Trigger'));
    const riskAdjustments = splitList(value(row, 'Risk Rules', 'Adjustments')).map(rule => ({
      condition: rule,
      action: /escal/i.test(rule) ? 'force_escalation' : /review/i.test(rule) ? 'force_review' : 'raise_risk',
      amount: /raise_risk/i.test(rule) ? 10 : undefined,
      reason: `Imported from ${tab.tabName}`,
    }));
    output.modifierPackRows.push({
      id,
      system,
      tier: 'modifier',
      title,
      isActive: true,
      version: 1,
      appliesToSymptoms: applies,
      triggers,
      riskAdjustmentsJson: JSON.stringify(riskAdjustments),
      tags: ['legacy_import'],
    });
    output.issues.push({ severity: 'info', tabName: tab.tabName, rowIndex: idx + 2, message: `Mapped modifier '${title}'` });
  }
}

function mapTriageTab(tab: LegacyTabData, system: string, output: LegacyMappingOutput) {
  for (const [idx, row] of tab.rows.entries()) {
    const complaint = value(row, 'Complaint', 'Chief Complaint', 'Pack');
    if (!complaint) continue;
    const packId = complaint.includes('_') ? complaint : `${slugify(system)}_${slugify(complaint)}`;
    const title = `${complaint} triage algorithm`;
    const entryCriteria = splitList(value(row, 'Entry Criteria', 'Criteria', 'Red Flags')).map(c => c.includes('=') ? c : `${slugify(c)}=yes`);
    const outputs = splitList(value(row, 'Actions', 'Output Actions', 'Disposition Guidance'));
    if (!entryCriteria.length && !outputs.length) continue;
    output.algorithmRows.push({
      id: `${packId}_triage_algo_${idx + 1}`,
      system,
      tier: 'clinician_algorithm',
      title,
      isActive: true,
      version: 1,
      entryCriteria,
      requiredInputs: splitList(value(row, 'Required Inputs', 'Inputs')),
      outputActions: outputs.length ? outputs : ['review imported triage logic'],
      notes: [`Imported from ${tab.tabName}`],
      tags: ['legacy_import', 'triage'],
    });
  }
}

export function mapLegacyTabs(tabs: LegacyTabData[]): LegacyMappingOutput {
  const output: LegacyMappingOutput = {
    symptomPackRows: [],
    modifierPackRows: [],
    questionRows: [],
    algorithmRows: [],
    planTemplateRows: [],
    issues: [],
  };

  for (const tab of tabs) {
    const lower = tab.tabName.toLowerCase();
    const system = value({ system_guess: lower.split(/[_\s-]/)[0] }, 'system_guess') || 'general';

    if (lower.includes('secondary') || lower.includes('question')) {
      mapSecondaryQuestionsTab(tab, system, output);
      continue;
    }
    if (lower.includes('modifier')) {
      mapModifierTab(tab, system, output);
      continue;
    }
    if (lower.includes('triage')) {
      mapTriageTab(tab, system, output);
      continue;
    }
    if (lower.includes('complaint') || lower.includes('pack') || lower.includes('symptom')) {
      mapComplaintListTab(tab, system, output);
      continue;
    }

    output.issues.push({ severity: 'warning', tabName: tab.tabName, message: 'No mapper matched this tab automatically' });
  }

  return output;
}
