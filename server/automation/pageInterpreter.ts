import type { Page } from "playwright";
import type { PageInterpretation } from "./types";

export async function interpretPage(page: Page): Promise<PageInterpretation> {
  return page.evaluate(() => {
    function textOf(el: Element | null | undefined) {
      return (el?.textContent || "").trim().slice(0, 200);
    }

    const fieldNodes = Array.from(document.querySelectorAll("input, textarea, select"));

    const fields = fieldNodes.map((el) => {
      const element = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

      let label = "";
      if (element.id) {
        const labelEl = document.querySelector(`label[for="${element.id}"]`);
        label = textOf(labelEl);
      }

      return {
        tag: element.tagName.toLowerCase(),
        type: "type" in element ? (element as HTMLInputElement).type : undefined,
        name: element.getAttribute("name") || undefined,
        id: element.id || undefined,
        placeholder: element.getAttribute("placeholder") || undefined,
        label: label || undefined,
        selectorGuess: element.id ? `#${element.id}` : undefined,
      };
    });

    const buttons = Array.from(
      document.querySelectorAll("button, input[type='submit'], input[type='button']")
    ).map((el) => {
      const element = el as HTMLButtonElement | HTMLInputElement;
      return {
        text: textOf(element),
        id: element.getAttribute("id") || undefined,
        name: element.getAttribute("name") || undefined,
      };
    });

    const links = Array.from(document.querySelectorAll("a[href]"))
      .slice(0, 50)
      .map((el) => {
        const a = el as HTMLAnchorElement;
        return {
          text: textOf(a),
          href: a.href,
        };
      });

    return {
      title: document.title,
      url: window.location.href,
      fields,
      buttons,
      links,
    };
  });
}
