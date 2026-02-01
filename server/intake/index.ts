import { getStore } from "../intakeStorage";

export { intakeRouter, requireVerifiedSession } from "./routes.intake";
export { filesRouter } from "./routes.files";
export { summaryRouter } from "./routes.summary";
export { ensureDirs } from "./storage";

export function initIntakeDb() {
  getStore();
}
