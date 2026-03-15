import type { MegaGraphEdge as GraphEdge, MegaGraphNode as GraphNode } from '../../shared/clinicalEngineTypes';

export const exampleNodes: GraphNode[] = [
  { id: 'cc_chest_pain', type: 'complaint', label: 'Chest Pain' },
  { id: 'sx_chest_pain', type: 'symptom', label: 'chest_pain' },
  { id: 'sx_diaphoresis', type: 'symptom', label: 'diaphoresis' },
  { id: 'sx_fever', type: 'symptom', label: 'fever' },
  { id: 'sx_dysuria', type: 'symptom', label: 'dysuria' },
  { id: 'sx_frequency', type: 'symptom', label: 'urinary_frequency' },
  { id: 'dx_acs', type: 'diagnosis', label: 'acute_coronary_syndrome' },
  { id: 'dx_pe', type: 'diagnosis', label: 'pulmonary_embolism' },
  { id: 'dx_uti', type: 'diagnosis', label: 'uti' },
  { id: 'dx_pyelonephritis', type: 'diagnosis', label: 'pyelonephritis' },
  { id: 'test_ecg', type: 'test', label: 'ECG' },
  { id: 'test_troponin', type: 'test', label: 'Troponin' },
  { id: 'test_ua', type: 'test', label: 'Urinalysis' },
  { id: 'rx_nitro', type: 'treatment', label: 'nitroglycerin_if_appropriate' },
  { id: 'rx_uti_abx', type: 'treatment', label: 'uti_antibiotic_protocol' },
  { id: 'rf_st_airway', type: 'red_flag', label: 'airway_compromise' },
];

export const exampleEdges: GraphEdge[] = [
  { from: 'cc_chest_pain', to: 'sx_chest_pain', relation: 'has_symptom', weight: 1 },
  { from: 'sx_chest_pain', to: 'dx_acs', relation: 'supports_dx', weight: 0.7 },
  { from: 'sx_diaphoresis', to: 'dx_acs', relation: 'supports_dx', weight: 0.9 },
  { from: 'sx_chest_pain', to: 'dx_pe', relation: 'supports_dx', weight: 0.4 },
  { from: 'sx_dysuria', to: 'dx_uti', relation: 'supports_dx', weight: 0.9 },
  { from: 'sx_frequency', to: 'dx_uti', relation: 'supports_dx', weight: 0.8 },
  { from: 'sx_fever', to: 'dx_pyelonephritis', relation: 'supports_dx', weight: 0.8 },
  { from: 'dx_acs', to: 'test_ecg', relation: 'suggests_test', weight: 1.0 },
  { from: 'dx_acs', to: 'test_troponin', relation: 'suggests_test', weight: 1.0 },
  { from: 'dx_uti', to: 'test_ua', relation: 'suggests_test', weight: 1.0 },
  { from: 'dx_acs', to: 'rx_nitro', relation: 'suggests_treatment', weight: 0.6 },
  { from: 'dx_uti', to: 'rx_uti_abx', relation: 'suggests_treatment', weight: 0.8 },
];
