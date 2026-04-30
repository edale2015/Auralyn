/**
 * tailwind.design-tokens.js
 *
 * Generated from DESIGN.md — Auralyn Clinical AI Design System
 * Place at project root and import into tailwind.config.js:
 *
 *   const designTokens = require('./tailwind.design-tokens');
 *   module.exports = {
 *     theme: {
 *       extend: designTokens,
 *     }
 *   }
 *
 * This is the second enforcement layer the article describes:
 * "If your Tailwind config only contains the tokens from your design system,
 * the framework itself rejects unauthorized values at build time."
 *
 * Any color, font-size, border-radius, or spacing value not in this file
 * will cause a Tailwind build warning (or error in strict mode).
 */

module.exports = {
  colors: {
    // ── Clinical urgency hierarchy ──────────────────────────────────────────
    critical: {
      DEFAULT: "#DC2626",
      light:   "#FEF2F2",
      border:  "#FECACA",
      text:    "#991B1B",
    },
    urgent: {
      DEFAULT: "#EA580C",
      light:   "#FFF7ED",
      border:  "#FED7AA",
      text:    "#9A3412",
    },
    elevated: {
      DEFAULT: "#D97706",
      light:   "#FFFBEB",
      border:  "#FDE68A",
      text:    "#92400E",
    },
    routine: {
      DEFAULT: "#16A34A",
      light:   "#F0FDF4",
      border:  "#BBF7D0",
      text:    "#14532D",
    },

    // ── Feature-area colors ─────────────────────────────────────────────────
    clinical: {
      DEFAULT: "#2563EB",
      light:   "#EFF6FF",
      border:  "#BFDBFE",
      text:    "#1E40AF",
    },
    consult: {
      DEFAULT: "#4F46E5",
      light:   "#EEF2FF",
      border:  "#C7D2FE",
      text:    "#3730A3",
    },
    knowledge: {
      DEFAULT: "#7C3AED",
      light:   "#F5F3FF",
      border:  "#DDD6FE",
      text:    "#5B21B6",
    },
    ehr: {
      DEFAULT: "#0D9488",
      light:   "#F0FDFA",
      border:  "#99F6E4",
      text:    "#115E59",
    },
    system: {
      DEFAULT: "#4B5563",
      light:   "#F9FAFB",
      border:  "#E5E7EB",
      text:    "#374151",
    },

    // ── Neutrals ────────────────────────────────────────────────────────────
    surface: {
      DEFAULT: "#FFFFFF",
      muted:   "#F9FAFB",
      subtle:  "#F3F4F6",
    },
    content: {
      primary:   "#111827",
      secondary: "#374151",
      muted:     "#6B7280",
      disabled:  "#9CA3AF",
    },
    border: {
      DEFAULT: "#E5E7EB",
      subtle:  "#F3F4F6",
    },

    // ── Dark mode (command interface ⌘K) ────────────────────────────────────
    dark: {
      surface:          "#030712",
      "surface-elevated": "#111827",
      border:           "#1F2937",
      text:             "#F9FAFB",
      "text-muted":     "#6B7280",
    },
  },

  fontFamily: {
    sans: ["Inter", "system-ui", "sans-serif"],
    mono: ["JetBrains Mono", "Menlo", "monospace"],
  },

  fontSize: {
    // Clinical type scale — do not invent values outside this list
    "page-title":  ["1.125rem",  { lineHeight: "1.4",  letterSpacing: "-0.01em", fontWeight: "600" }],
    "section-title": ["0.875rem", { lineHeight: "1.4", letterSpacing: "0.02em", fontWeight: "600" }],
    "card-title":  ["0.875rem",  { lineHeight: "1.3",  fontWeight: "600" }],
    "body-md":     ["0.875rem",  { lineHeight: "1.6",  fontWeight: "400" }],
    "body-sm":     ["0.75rem",   { lineHeight: "1.5",  fontWeight: "400" }],
    "label":       ["0.625rem",  { lineHeight: "1.2",  letterSpacing: "0.08em", fontWeight: "600" }],
    "badge":       ["0.625rem",  { lineHeight: "1.0",  letterSpacing: "0.02em", fontWeight: "500" }],
  },

  borderRadius: {
    // Only these values. Never invent intermediate values.
    none: "0px",
    sm:   "4px",
    md:   "6px",
    lg:   "8px",
    xl:   "12px",
    full: "9999px",
  },

  spacing: {
    // Only these values. Never invent intermediate values.
    xs:   "4px",
    sm:   "8px",
    md:   "12px",
    lg:   "16px",
    xl:   "24px",
    "2xl": "32px",
    "3xl": "48px",
  },
};
