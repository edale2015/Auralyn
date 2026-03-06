# Guideline IR Schema v1

This IR is the intermediate representation between source guideline text
and engine CSV emission.

## Top-level shape

```json
{
  "complaint_id": "sore_throat",
  "display_name": "Sore Throat",
  "source": {
    "title": "Acute sore throat guideline",
    "source_type": "text",
    "path": "data/complaints/sources/sore_throat.txt",
    "compiled_at": "2026-03-05T00:00:00.000Z"
  },
  "modifiers": [],
  "questions": [],
  "red_flags": [],
  "clusters": [],
  "disposition_logic": [],
  "notes": [],
  "unmapped_phrases": []
}
```

## Fields

### complaint_id
Lowercase snake_case complaint key.

### display_name
Human-readable complaint name.

### source
Metadata about the input source.

### modifiers
Global contextual variables the complaint depends on.

```json
[
  { "token": "AGE_Y", "type": "number", "label": "Age in years" },
  { "token": "IMMUNOCOMP", "type": "yesno", "label": "Immunocompromised" }
]
```

### questions
Complaint-specific questions.

```json
[
  {
    "token": "FEVER",
    "type": "yesno",
    "question_text": "Do you have fever?",
    "required": true,
    "category": "core",
    "evidence_for": ["strep_pharyngitis", "viral_pharyngitis"]
  }
]
```

### red_flags
Danger signals requiring escalation.

```json
[
  {
    "label": "Airway compromise",
    "when_text": "stridor or trouble breathing",
    "suggested_tokens": ["STRIDOR", "SOB"],
    "action": "ER_SEND",
    "rationale": "possible airway emergency"
  }
]
```

### clusters
Diagnostic groupings / likely causes.

```json
[
  {
    "dx_id": "strep_pharyngitis",
    "dx_label": "Strep pharyngitis",
    "tier": "PRIMARY",
    "evidence_text": [
      "fever",
      "tonsillar exudates",
      "absence of cough"
    ],
    "suggested_rules": [
      "FEVER=true",
      "EXUDATE=true",
      "COUGH=false"
    ]
  }
]
```

### disposition_logic
Suggested triage logic extracted from the source.

```json
[
  {
    "when_text": "airway compromise or severe dehydration",
    "suggested_rules": ["STRIDOR=true", "DEHYDRATION=true"],
    "disposition": "ER"
  }
]
```

### notes
Freeform compiler notes.

### unmapped_phrases
Phrases the compiler found but could not confidently map.
