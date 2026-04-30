# ─────────────────────────────────────────────────────────────────────────────
# PATCH: CLAUDE.md — Add Design System Section
#
# Add the following section to your existing CLAUDE.md file at the project root.
# Place it AFTER the existing clinical safety sections and BEFORE the
# golden principles section.
#
# The @DESIGN.md syntax tells Claude Code to read the referenced file's content.
# ─────────────────────────────────────────────────────────────────────────────

## Design System

This project uses a design system defined in @DESIGN.md.

**Follow @DESIGN.md strictly for all UI generation.**

### Critical rules for all UI components:

1. **Color = Clinical Communication**
   Use only the colors defined in @DESIGN.md. Every color maps to either a clinical urgency level or a named feature area. Do not invent colors. Do not use Tailwind's default color palette (blue-500, red-600, etc.) — use Auralyn's semantic names (critical, urgent, routine, primary, knowledge, data).

2. **Urgency hierarchy is patient safety**
   The clinical urgency color mapping (red=emergent, orange=urgent, green=routine) is not a style preference. It is a clinical communication standard. Getting it wrong means physicians misread urgency. Always check DESIGN.md's urgency-levels before coloring any clinical indicator.

3. **Typography**
   Use Inter for all UI text. Use JetBrains Mono (font-mono) ONLY for data values: case IDs, confidence percentages, ICD codes, CPT codes, timestamps from systems. Never mix in the same text element.

4. **Spacing**
   Use only the spacing scale from @DESIGN.md: xs(4px), sm(8px), md(12px), lg(16px), xl(24px), 2xl(32px), 3xl(48px). Never invent a spacing value between defined steps.

5. **Layout**
   All clinical review pages: single-column, max-w-3xl mx-auto, stacked cards with space-y-4. Command interface: centered modal max-w-2xl at top-[10vh] on dark background.

6. **Badges**
   All badges: rounded-full (pill shape). Disposition badges map to urgency hierarchy colors. Never use a filled saturated color on a large surface — always use the -light variant for backgrounds.

7. **No shadows on cards**
   Cards are separated by background color difference and a 1px border. Only floating action buttons (stethoscope, ⌘K pill) use shadow-lg.

8. **data-testid on everything**
   Every interactive element, badge, and card must have a data-testid attribute.

9. **AI disclaimer**
   Every panel displaying AI-generated clinical content must include:
   `<p className="text-[10px] text-gray-400">For clinical decision support only.</p>`

### Verification

Before generating any UI component, ask yourself:
- Is every color in this component defined in DESIGN.md?
- Does every clinical urgency indicator map to the correct urgency level?
- Is monospace used ONLY for data values?
- Is every badge using rounded-full?
- Does every card use the correct feature-area card style?

If any answer is no, stop and check DESIGN.md before proceeding.

### Audit instruction

After building multiple components, run:
"Review everything in /client/src/components and identify any Tailwind color classes
not defined in DESIGN.md (e.g., blue-500, red-600, green-400). List them with the
file and line number."

This catches design drift before it ships.
