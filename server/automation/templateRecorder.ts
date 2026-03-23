import type { Page } from "playwright";
import type { AutomationTemplate, FieldMapping, AutomationAction } from "./types";
import { interpretPage } from "./pageInterpreter";

function guessFieldType(tag: string, type?: string): FieldMapping["type"] {
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (type === "checkbox") return "checkbox";
  if (type === "radio") return "radio";
  if (type === "date") return "date";
  return "text";
}

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

export async function recordTemplateFromPage(input: {
  page: Page;
  templateKey: string;
  name: string;
  description?: string;
}): Promise<{ template: AutomationTemplate; pageData: Awaited<ReturnType<typeof interpretPage>> }> {
  const pageData = await interpretPage(input.page);

  const fields: FieldMapping[] = pageData.fields
    .filter((f) => f.selectorGuess || f.id || f.name)
    .map((f, index) => {
      const internalKey =
        normalizeKey(f.label) ||
        normalizeKey(f.name) ||
        normalizeKey(f.id) ||
        `field${index + 1}`;

      const selector =
        f.selectorGuess ||
        (f.name ? `[name="${f.name}"]` : undefined) ||
        (f.id ? `#${f.id}` : undefined) ||
        "";

      return {
        internalKey,
        selector,
        type: guessFieldType(f.tag, f.type),
        required: false,
      };
    });

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
    templateKey: input.templateKey,
    name: input.name,
    description: input.description,
    targetType: "web",
    startUrl: pageData.url,
    fields,
    actions,
  };

  return { template, pageData };
}
