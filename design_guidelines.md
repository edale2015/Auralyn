# Design Guidelines: env_flu_slice Medical Triage System

## Design Approach

**Selected Approach:** Material Design System (Healthcare-Adapted)
**Justification:** This medical diagnostic platform requires clarity, trust, and information density. Material Design provides robust patterns for data-heavy applications with strong hierarchy and accessibility - critical for healthcare applications where errors have serious consequences.

**Key Design Principles:**
1. **Clinical Clarity:** Every element must communicate medical information unambiguously
2. **Trust Through Consistency:** Predictable patterns reduce cognitive load for time-pressed physicians
3. **Information Hierarchy:** Critical patient data and alerts must be immediately scannable
4. **Workflow Efficiency:** Minimize clicks for physician sign-off processes

---

## Typography

**Font Families:**
- Primary: Inter (Google Fonts) - excellent readability for medical data
- Monospace: JetBrains Mono - for patient IDs, timestamps, diagnostic codes

**Hierarchy:**
- Page Headers: text-2xl font-semibold
- Section Headers: text-lg font-medium
- Patient Data Labels: text-sm font-medium uppercase tracking-wide text-gray-600
- Patient Data Values: text-base font-normal
- Diagnostic Summaries: text-base leading-relaxed
- Timestamps/Metadata: text-xs text-gray-500

---

## Layout System

**Spacing Primitives:** Use Tailwind units of **2, 4, 6, and 8** exclusively
- Tight spacing (labels to values): gap-2
- Component padding: p-4, p-6
- Section spacing: space-y-6, space-y-8
- Page margins: p-6 or p-8

**Dashboard Layout:**
- Sidebar navigation: w-64 (physician menu, patient queue)
- Main content: flex-1 with max-w-6xl container
- Detail panels: w-96 (patient details, action panels)

---

## Component Library

### Core UI Elements

**Status Badges:**
- Pending Review (yellow)
- Physician Approved (green)
- Needs Attention (red)
- In Progress (blue)
- Use rounded-full px-3 py-1 text-xs font-medium

**Patient Cards:**
- Border-left accent (4px) indicating urgency level
- Compact header: Patient ID, timestamp, chief complaint
- Expandable details section
- Quick action buttons (Review, Approve, Request More Info)

**Diagnostic Display:**
- Two-column layout: Chief Complaint | AI Analysis
- Confidence indicators for AI suggestions
- Clear separation between AI recommendation and physician decision

### Navigation

**Physician Dashboard:**
- Top bar: Logo, active case count, physician name/logout
- Left sidebar: Queue (Pending Review), Approved Cases, History, Settings
- Breadcrumb trail for case navigation

### Forms

**Physician Sign-Off Form:**
- Pre-populated fields from AI analysis
- Required fields clearly marked
- Diagnosis dropdown with search
- Disposition options (Discharge, Admit, Refer, etc.)
- Free-text notes area
- Large, distinct "Approve & Submit" button
- Secondary "Request Additional Information" option

**Input Fields:**
- Height: h-10 for text inputs
- Padding: px-4
- Border: border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200

### Data Displays

**Patient Queue Table:**
- Sortable columns: Time, Patient ID, Chief Complaint, Urgency, Status
- Row hover states for quick scanning
- Inline status badges
- Click entire row to open case details

**Case History Timeline:**
- Vertical timeline with timestamps
- WhatsApp conversation summary (collapsed by default)
- AI diagnostic steps visualization
- Physician actions and notes

### Overlays

**Case Detail Modal:**
- Slide-in from right (w-2/3 of screen)
- Fixed header with patient info and close button
- Scrollable content area
- Fixed footer with action buttons

**Confirmation Dialogs:**
- Centered overlay with backdrop blur
- Clear warning for critical actions (e.g., overriding AI diagnosis)
- Primary/secondary button patterns

---

## WhatsApp Conversation Design

**Message Patterns (for reference in backend logic):**
- Bot messages: Clear, simple questions, one at a time
- Numbered options for patient selection (e.g., "1. Yes 2. No")
- Confirmation messages after each step
- Summary message before finalizing complaint
- Professional but warm tone

---

## Animations

**Minimal, Functional Only:**
- Page transitions: None (instant navigation for speed)
- Loading states: Simple spinner for data fetching
- Status changes: Subtle fade-in for success/error messages
- NO scroll animations, NO hover effects beyond standard link/button states

---

## Critical Medical UI Requirements

1. **Accessibility:** WCAG AA compliance minimum, all interactive elements keyboard-navigable
2. **Alert Hierarchy:** Critical alerts (missing physician sign-off) must use red with icon
3. **Timestamp Consistency:** All times in consistent format with timezone indicator
4. **Audit Trail:** Every action logged with physician ID and timestamp (visible in case history)
5. **Error Prevention:** Confirmation required before approving cases, disable submit until all required fields complete

---

**Images:** No hero images required. This is a utility application. Use medical icons (stethoscope, clipboard, alert symbols) from Heroicons outline set sparingly in empty states and navigation.