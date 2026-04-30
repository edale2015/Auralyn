---
name: Auralyn Clinical AI
version: "1.0.0"
description: "Urgent care clinical AI platform. Design language: precise, calm, urgent when it must be."

colors:
  # ── Semantic clinical urgency palette ──────────────────────────────────────
  # These colors carry clinical meaning. Every agent must understand their
  # semantic weight before using them. Wrong color = wrong clinical signal.

  # Critical / Emergent — RED
  # Use for: ER disposition, red flag alerts, CRITICAL_DIVERGENCE uncertainty,
  #           hard ontology violations, SELF_HEAL_FAILED incidents, escalations
  # Never use for: decorative elements, non-urgent information
  critical: "#DC2626"
  critical-light: "#FEF2F2"
  critical-border: "#FECACA"
  critical-text: "#991B1B"

  # Urgent — ORANGE
  # Use for: urgent_care disposition, LOW_AGREEMENT uncertainty, degraded services,
  #           warnings that need attention within hours
  urgent: "#EA580C"
  urgent-light: "#FFF7ED"
  urgent-border: "#FED7AA"
  urgent-text: "#9A3412"

  # Elevated — AMBER/YELLOW
  # Use for: MODERATE_AGREEMENT uncertainty, pending skill review,
  #           cases needing attention but not immediately dangerous
  elevated: "#D97706"
  elevated-light: "#FFFBEB"
  elevated-border: "#FDE68A"
  elevated-text: "#92400E"

  # Routine / Healthy — GREEN
  # Use for: approved cases, healthy services, active skills, validated confidence,
  #           self_care disposition (low acuity), completed follow-up
  routine: "#16A34A"
  routine-light: "#F0FDF4"
  routine-border: "#BBF7D0"
  routine-text: "#14532D"

  # Primary UI — BLUE
  # Use for: primary actions (Approve button), active navigation,
  #           PCP disposition, information panels, CDS sidebar
  primary: "#2563EB"
  primary-light: "#EFF6FF"
  primary-border: "#BFDBFE"
  primary-text: "#1E40AF"

  # Clinical secondary — INDIGO
  # Use for: eConsult panel, specialist routing, secondary clinical features
  secondary: "#4F46E5"
  secondary-light: "#EEF2FF"
  secondary-border: "#C7D2FE"
  secondary-text: "#3730A3"

  # Knowledge / Learning — PURPLE
  # Use for: Clinical Skills system, AI-generated content markers,
  #           uncertainty sampling results, geometric reasoning insights
  knowledge: "#7C3AED"
  knowledge-light: "#F5F3FF"
  knowledge-border: "#DDD6FE"
  knowledge-text: "#5B21B6"

  # EHR / Data — TEAL
  # Use for: EHR context panels, FHIR data, patient record display,
  #           ontology status indicators
  data: "#0D9488"
  data-light: "#F0FDFA"
  data-border: "#99F6E4"
  data-text: "#115E59"

  # Infrastructure — GRAY-BLUE
  # Use for: Research Radar, infra status, system monitoring,
  #           admin-only features
  system: "#4B5563"
  system-light: "#F9FAFB"
  system-border: "#E5E7EB"
  system-text: "#374151"

  # Neutrals
  surface: "#FFFFFF"
  surface-muted: "#F9FAFB"
  surface-subtle: "#F3F4F6"
  border: "#E5E7EB"
  border-subtle: "#F3F4F6"
  text-primary: "#111827"
  text-secondary: "#374151"
  text-muted: "#6B7280"
  text-disabled: "#9CA3AF"
  background: "#F9FAFB"

  # Dark mode surfaces (used in command interface ⌘K)
  dark-surface: "#030712"
  dark-surface-elevated: "#111827"
  dark-border: "#1F2937"
  dark-text: "#F9FAFB"
  dark-text-muted: "#6B7280"

typography:
  # Inter for all structural elements — optimized for dense clinical data
  # Mono (JetBrains Mono) for case IDs, codes, audit data, confidence values

  page-title:
    fontFamily: "Inter"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"

  section-title:
    fontFamily: "Inter"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.02em"
    textTransform: "uppercase"

  card-title:
    fontFamily: "Inter"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.3

  body-md:
    fontFamily: "Inter"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6

  body-sm:
    fontFamily: "Inter"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5

  label:
    fontFamily: "Inter"
    fontSize: "0.625rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
    textTransform: "uppercase"

  clinical-data:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4

  confidence-number:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.0

  badge-text:
    fontFamily: "Inter"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.0
    letterSpacing: "0.02em"

rounded:
  none: "0px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"

spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  xxxl: "48px"

# Clinical urgency semantic mapping
# Every component that displays urgency MUST map to these levels
urgency-levels:
  5-emergent:
    color: "{colors.critical}"
    background: "{colors.critical-light}"
    border: "{colors.critical-border}"
    label: "Emergent"
  4-urgent:
    color: "{colors.urgent}"
    background: "{colors.urgent-light}"
    border: "{colors.urgent-border}"
    label: "Urgent"
  3-elevated:
    color: "{colors.elevated}"
    background: "{colors.elevated-light}"
    border: "{colors.elevated-border}"
    label: "Elevated"
  2-routine:
    color: "{colors.routine}"
    background: "{colors.routine-light}"
    border: "{colors.routine-border}"
    label: "Routine"
  1-informational:
    color: "{colors.primary}"
    background: "{colors.primary-light}"
    border: "{colors.primary-border}"
    label: "Info"

components:
  # ── Disposition badges ──────────────────────────────────────────────────────
  badge-er-send:
    backgroundColor: "{colors.critical-light}"
    textColor: "{colors.critical-text}"
    borderColor: "{colors.critical-border}"
    typography: "{typography.badge-text}"
    rounded: "{rounded.full}"
    padding: "2px 8px"

  badge-urgent-care:
    backgroundColor: "{colors.urgent-light}"
    textColor: "{colors.urgent-text}"
    borderColor: "{colors.urgent-border}"
    typography: "{typography.badge-text}"
    rounded: "{rounded.full}"
    padding: "2px 8px"

  badge-pcp:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary-text}"
    borderColor: "{colors.primary-border}"
    typography: "{typography.badge-text}"
    rounded: "{rounded.full}"
    padding: "2px 8px"

  badge-self-care:
    backgroundColor: "{colors.routine-light}"
    textColor: "{colors.routine-text}"
    borderColor: "{colors.routine-border}"
    typography: "{typography.badge-text}"
    rounded: "{rounded.full}"
    padding: "2px 8px"

  # ── Uncertainty badges ──────────────────────────────────────────────────────
  badge-critical-divergence:
    backgroundColor: "{colors.critical-light}"
    textColor: "{colors.critical-text}"
    borderColor: "{colors.critical-border}"
    typography: "{typography.badge-text}"
    rounded: "{rounded.full}"
    padding: "2px 8px"

  badge-low-agreement:
    backgroundColor: "{colors.urgent-light}"
    textColor: "{colors.urgent-text}"
    borderColor: "{colors.urgent-border}"
    typography: "{typography.badge-text}"
    rounded: "{rounded.full}"
    padding: "2px 8px"

  badge-moderate-agreement:
    backgroundColor: "{colors.elevated-light}"
    textColor: "{colors.elevated-text}"
    borderColor: "{colors.elevated-border}"
    typography: "{typography.badge-text}"
    rounded: "{rounded.full}"
    padding: "2px 8px"

  badge-high-agreement:
    backgroundColor: "{colors.routine-light}"
    textColor: "{colors.routine-text}"
    borderColor: "{colors.routine-border}"
    typography: "{typography.badge-text}"
    rounded: "{rounded.full}"
    padding: "2px 8px"

  # ── Primary actions (physician gate) ───────────────────────────────────────
  button-approve:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.badge-text}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    hover-backgroundColor: "#1D4ED8"

  button-approve-instructions:
    backgroundColor: "{colors.routine}"
    textColor: "{colors.surface}"
    typography: "{typography.badge-text}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    hover-backgroundColor: "#15803D"

  button-reject:
    backgroundColor: "{colors.critical}"
    textColor: "{colors.surface}"
    typography: "{typography.badge-text}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    hover-backgroundColor: "#B91C1C"

  button-escalate:
    backgroundColor: "{colors.urgent}"
    textColor: "{colors.surface}"
    typography: "{typography.badge-text}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    hover-backgroundColor: "#C2410C"

  button-secondary:
    backgroundColor: "transparent"
    borderColor: "{colors.border}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.badge-text}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    hover-backgroundColor: "{colors.surface-subtle}"

  # ── Clinical cards ──────────────────────────────────────────────────────────
  card-default:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"

  card-critical:
    backgroundColor: "{colors.critical-light}"
    borderColor: "{colors.critical-border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"

  card-urgent:
    backgroundColor: "{colors.urgent-light}"
    borderColor: "{colors.urgent-border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"

  card-discharge:
    backgroundColor: "#EFF6FF"
    borderColor: "{colors.primary-border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"

  card-cds:
    backgroundColor: "#EFF6FF"
    borderColor: "{colors.primary-border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"

  card-econsult:
    backgroundColor: "{colors.secondary-light}"
    borderColor: "{colors.secondary-border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"

  card-ehr-context:
    backgroundColor: "{colors.data-light}"
    borderColor: "{colors.data-border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"

  card-knowledge:
    backgroundColor: "{colors.knowledge-light}"
    borderColor: "{colors.knowledge-border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"

  # ── Command interface (dark) ─────────────────────────────────────────────────
  command-surface:
    backgroundColor: "{colors.dark-surface}"
    borderColor: "{colors.dark-border}"
    rounded: "{rounded.xl}"

  command-input:
    backgroundColor: "transparent"
    textColor: "{colors.dark-text}"
    typography: "{typography.body-md}"

  command-suggestion:
    backgroundColor: "transparent"
    textColor: "{colors.dark-text-muted}"
    typography: "{typography.body-sm}"
    hover-backgroundColor: "{colors.dark-surface-elevated}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
---

## Overview

Auralyn is a clinical AI triage platform for urgent care. The design language has one primary purpose: **communicate clinical urgency instantly and unambiguously.**

A physician opening the review queue at 2am should be able to read the urgency hierarchy before they're fully awake. Red means emergency. Orange means urgent. Green means routine. These are not decorative choices — they are clinical communication.

The visual language is deliberately restrained. Dense information, compact spacing, minimal decoration. Physicians reading dozens of cases need signal, not style. Every element earns its place by communicating clinical information.

## Colors

### Clinical Urgency Hierarchy — The Most Important Rule

Auralyn's color system is organized around clinical urgency levels. **Every use of color must map to the urgency hierarchy or be a neutral.**

| Level | Color | When to use |
|-------|-------|-------------|
| 5 — Emergent | `critical` red | ER disposition, red flags, hard blocks, SELF_HEAL_FAILED |
| 4 — Urgent | `urgent` orange | Urgent care disposition, LOW_AGREEMENT, degraded services |
| 3 — Elevated | `elevated` amber | Pending review, moderate uncertainty, warnings |
| 2 — Routine | `routine` green | Approved, healthy, low-acuity, completed |
| 1 — Info | `primary` blue | Primary actions, PCP disposition, information |

**Never use a clinical urgency color for a non-clinical purpose.** Red on a decorative border teaches physicians to ignore red. That is a patient safety issue.

### Feature-Area Colors

Each major Auralyn subsystem has a dedicated color for its panels and cards:

- **Blue** (`primary`) — core clinical workflow, CDS sidebar, main actions
- **Indigo** (`secondary`) — eConsult, specialist routing
- **Purple** (`knowledge`) — Clinical Skills, AI-generated content, uncertainty
- **Teal** (`data`) — EHR context, FHIR data, patient records
- **Gray-blue** (`system`) — Research Radar, infrastructure monitoring, admin

Use the light/border/text variants of each color for card backgrounds — never the full saturated color on large surfaces.

### Neutrals

`background` (#F9FAFB) is the page background. `surface` (#FFFFFF) is for cards and panels. `surface-muted` is for secondary areas. Use `border` for default card borders. Use `text-primary` for primary content and `text-muted` for supporting information.

## Typography

Two typefaces only. **Inter** for all UI text. **JetBrains Mono** for clinical data — case IDs, confidence percentages, ICD codes, CPT codes, audit timestamps.

The monospace distinction is clinically meaningful: when a physician sees monospace text, they know it is a data value, not prose. Do not use JetBrains Mono for labels, headings, or descriptive text.

### Scale

Use `card-title` for card headers. Use `body-md` for case descriptions and clinical content. Use `body-sm` for supporting details, timestamps, metadata. Use `label` (uppercase, tracked) for section headers in dense panels. Use `clinical-data` (monospace) for any value read from a system — case IDs, confidence scores, ICD codes. Use `confidence-number` (monospace, larger) when displaying a confidence percentage as a primary metric.

**Never invent a font size not in this scale.** The scale is intentionally compact for clinical density.

## Layout & Spacing

All clinical pages use a single-column layout, `max-w-3xl mx-auto`, stacked cards with `space-y-4`. This is not a constraint to work around — it is intentional. Physicians review cases sequentially. The layout supports sequential review.

The `spacing` scale controls all internal padding. Cards use `spacing.lg` (16px) internal padding. Section gaps use `space-y-4` (16px). Dense panels use `spacing.md` (12px). Never invent a spacing value between defined steps.

The command interface (⌘K) uses a centered modal at `max-w-2xl`, positioned at `top-[10vh]`, always on a dark `dark-surface` background regardless of light/dark mode.

## Elevation & Depth

Auralyn does not use drop shadows by default. Cards are separated by their background color (`surface` on `background`) and a 1px `border` in `colors.border`. This keeps the interface calm and avoids visual noise in a high-density clinical context.

The only exception: the floating ⌘K trigger button and the CDS sidebar floating stethoscope button use `shadow-lg` to indicate they float above the page content.

## Shapes

Border radius scale: `sm` (4px) for badges and tight elements. `md` (6px) for buttons. `lg` (8px) for cards. `xl` (12px) for the command interface modal. `full` (9999px) for pill badges.

The urgency badge pills always use `rounded.full`. This visual distinction signals that they are status indicators, not interactive elements.

## Components

### Case Cards (Review Queue)

Every case card in the review queue displays:
1. Complaint label — `card-title` typography
2. Disposition badge — maps to the urgency hierarchy color
3. CaseType pill — maps to the urgency hierarchy color
4. Uncertainty badge — maps to its specific badge component
5. Red flag count — always in `critical` red if present
6. Confidence — `confidence-number` monospace

The card background is always `surface` (white). The card border escalates to `critical-border` if disposition is ER_SEND or if red flags are present.

### Action Buttons (Physician Gate)

Five action buttons: Approve (blue), Request Changes (secondary outline), Sign-off (secondary outline), Escalate (orange), Reject (red).

**The color of action buttons is not decorative — it is the physician's muscle memory.** Approve is always blue. Reject is always red. Never swap these for aesthetic reasons.

### Panel Cards

Each subsystem panel uses its feature-area card style. The card title must include the subsystem icon in the matching color. All physician-gated panels include a status badge indicating whether content has been approved. The AI disclaimer ("clinical_decision_support_only") always appears in `text-muted` at the bottom of AI-generated panels.

### Badges

All badges use `badge-text` typography (10px, uppercase, slightly tracked). Disposition and urgency badges always use `rounded.full`. Status badges (Active, Pending, etc.) use `rounded.full`. Action-result badges (Approved, Signed-off) use `rounded.full`.

Never use a filled badge in a color that does not map to the urgency hierarchy or a feature-area color.

## Do's and Don'ts

**Do:**
- Map every color use to the urgency hierarchy or a named feature-area color
- Use `rounded.full` for all badge pills
- Use monospace (`clinical-data`, `confidence-number`) for any value from a data system
- Keep cards `max-w-3xl` single-column for all clinical review pages
- Use `space-y-4` between stacked cards on clinical pages
- Include the AI disclaimer on every panel that shows AI-generated content
- Use `label` typography (uppercase, tracked) for section headers in dense panels
- Add `data-testid` attributes to every interactive element

**Don't:**
- Use `critical` red for anything other than emergent urgency or hard failures
- Invent a color not in this design system — the urgency semantics are broken if colors drift
- Use drop shadows on cards (exception: floating action buttons)
- Mix Inter and JetBrains Mono in the same text element
- Use JetBrains Mono for labels, headings, or descriptive prose
- Invent a spacing value between defined steps
- Use fully saturated urgency colors (critical, urgent, etc.) as card backgrounds — always use the `-light` variant
- Create a "helpful" auto-approval state — the physician gate is structural, not visual
- Use text smaller than `body-sm` (0.75rem / 12px) for clinical information that must be readable
- Put color-only urgency indicators without text — always pair color with a text label for accessibility
