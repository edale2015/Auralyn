import { ROUTES } from "../routes/routeRegistry";

export function validateRoutes() {
  const paths = Object.values(ROUTES);
  const unique = new Set(paths);

  if (unique.size !== paths.length) {
    throw new Error("❌ Duplicate routes detected in routeRegistry");
  }
}
