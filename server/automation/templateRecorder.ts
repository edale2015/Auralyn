/**
 * Template Recorder — Packet 20 improvements
 *
 * Changes from baseline:
 *
 * 1. normalizeKey collision detection
 *    Problem: "First Name" and "First name" both normalize to `firstName`.
 *    The second field silently overwrites the first in the output array,
 *    leading to a mis-mapped form at replay time.
 *    Fix: `deduplicateKeys()` passes through a Map of seen keys and appends
 *    a monotonic suffix (2, 3, …) to each duplicate so every field keeps
 *    a distinct internalKey. e.g. firstName, firstName2, firstName3.
 *
 * 2. Async dropdown handling
 *    Problem: Select elements that load their <option> list via XHR/fetch
 *    are captured with 0 options at record time, producing a useless template.
 *    Fix: For every `select` field, after locating the element, we poll with
 *    waitForFunction() for up to ASYNC_SELECT_TIMEOUT_MS (3 s) until the
 *    <option> list has more than 1 item. If the options never appear we log a
 *    warning and proceed — this keeps recording non-blocking.
 */

import type { Page } from "playwright";
import type { AutomationTemplate, FieldMapping, AutomationAction } from "./types";
import { interpretPage } from "./pageInterpreter";

const ASYNC_SELECT_TIMEOUT_MS = 3_000;

// ── normalizeKey + collision detection ───────────────────────────────────────

function normalizeKey(value?: string): string {
  return (value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part, idx) =>
      idx === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
        : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join("");
}

/**
 * Ensures every field has a unique internalKey.
 * When two fields normalize to the same key (e.g. "First Name" and "First name"
 * both → "firstName"), the second is renamed "firstName2", the third "firstName3",
 * and so on. The first occurrence is always left unchanged.
 */
function deduplicateKeys(fields: FieldMapping[]): FieldMapping[] {
  const seen = new Map<string, number>(); // baseKey → occurrence count so far

  return fields.map((field) => {
    const base = field.internalKey;

    if (!seen.has(base)) {
      seen.set(base, 1);
      return field;                                   // first occurrence — unchanged
    }

    const count = seen.get(base)! + 1;
    seen.set(base, count);
    const deduped = `${base}${count}`;
    console.warn(`[templateRecorder] Key collision: "${base}" → renamed to "${deduped}"`);
    return { ...field, internalKey: deduped };
  });
}

// ── Field type inference ──────────────────────────────────────────────────────

function guessFieldType(tag: string, type?: string): FieldMapping["type"] {
  if (tag === "textarea") return "textarea";
  if (tag === "select")   return "select";
  if (type === "checkbox") return "checkbox";
  if (type === "radio")    return "radio";
  if (type === "date")     return "date";
  return "text";
}

// ── Async select handling ─────────────────────────────────────────────────────

/**
 * Wait for a <select> to have at least 2 <option> elements (i.e. the async
 * population has finished). Times out gracefully — we warn and continue.
 */
async function waitForSelectOptions(page: Page, selector: string): Promise<void> {
  try {
    await page.waitForFunction(
      ({ sel }: { sel: string }) => {
        const el = document.querySelector(sel);
        return el instanceof HTMLSelectElement && el.options.length > 1;
      },
      { sel: selector },
      { timeout: ASYNC_SELECT_TIMEOUT_MS }
    );
  } catch {
    console.warn(
      `[templateRecorder] waitForSelectOptions timed out for "${selector}" ` +
      `after ${ASYNC_SELECT_TIMEOUT_MS}ms — options may not be fully loaded`
    );
  }
}

// ── Main recorder ─────────────────────────────────────────────────────────────

export async function recordTemplateFromPage(input: {
  page: Page;
  templateKey: string;
  name: string;
  description?: string;
}): Promise<{ template: AutomationTemplate; pageData: Awaited<ReturnType<typeof interpretPage>> }> {
  const pageData = await interpretPage(input.page);

  // Build raw fields (keys may still collide at this point)
  const rawFields: FieldMapping[] = await Promise.all(
    pageData.fields
      .filter((f) => f.selectorGuess || f.id || f.name)
      .map(async (f, index) => {
        const internalKey =
          normalizeKey(f.label) ||
          normalizeKey(f.name)  ||
          normalizeKey(f.id)    ||
          `field${index + 1}`;

        const selector =
          f.selectorGuess ||
          (f.name ? `[name="${f.name}"]` : undefined) ||
          (f.id   ? `#${f.id}`           : undefined) ||
          "";

        const fieldType = guessFieldType(f.tag, f.type);

        // Wait for async options before recording select fields
        if (fieldType === "select" && selector) {
          await waitForSelectOptions(input.page, selector);
        }

        return {
          internalKey,
          selector,
          type: fieldType,
          required: false,
        } satisfies FieldMapping;
      })
  );

  // Deduplicate keys — must happen after all fields are built
  const fields = deduplicateKeys(rawFields);

  // Build action sequence
  const actions: AutomationAction[] = [
    { type: "goto", name: "open-page", url: pageData.url },
    ...fields.map((field): AutomationAction => {
      if (field.type === "select") {
        return { type: "select", name: `select-${field.internalKey}`, selector: field.selector, valueKey: field.internalKey };
      }
      if (field.type === "checkbox") {
        return { type: "check", name: `check-${field.internalKey}`, selector: field.selector, valueKey: field.internalKey };
      }
      return { type: "fill", name: `fill-${field.internalKey}`, selector: field.selector, valueKey: field.internalKey };
    }),
  ];

  const submitButton = pageData.buttons.find((b) =>
    (b.text || "").toLowerCase().match(/submit|continue|next|save/)
  );

  if (submitButton?.id) {
    actions.push({ type: "humanApproval", name: "confirm-before-submit", checkpointName: "before-submit" });
    actions.push({ type: "click", name: "submit-form", selector: `#${submitButton.id}` });
  }

  const template: AutomationTemplate = {
    templateKey:  input.templateKey,
    name:         input.name,
    description:  input.description,
    targetType:   "web",
    startUrl:     pageData.url,
    fields,
    actions,
  };

  return { template, pageData };
}
