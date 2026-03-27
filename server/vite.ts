import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const viteLogger = createLogger();
const BUILD_ID = nanoid();

// Stub /@vite/client that satisfies every import that modules make from it
// but contains zero WebSocket / HMR code.  Replit's proxy drops WebSocket
// connections to /vite-hmr which causes reconnect→full-reload loops (blank
// screen).  We keep Vite in middlewareMode for module transforms only.
const VITE_CLIENT_STUB = `
export function createHotContext(ownerPath) {
  return {
    ownerPath,
    data: {},
    accept(deps, callback) {},
    acceptExports(exportNames, callback) {},
    dispose(cb) {},
    prune(cb) {},
    decline() {},
    invalidate(message) {},
    on(event, cb) {},
    off(event, cb) {},
    send(event, data) {},
  };
}
export function updateStyle(id, content) {
  let el = document.querySelector('style[data-vite-id="' + id + '"]');
  if (!el) {
    el = document.createElement('style');
    el.setAttribute('data-vite-id', id);
    document.head.appendChild(el);
  }
  el.textContent = content;
}
export function removeStyle(id) {
  const el = document.querySelector('style[data-vite-id="' + id + '"]');
  if (el) el.remove();
}
export const injectIntoGlobalHook = () => {};
export default {};
`;

export async function setupVite(server: Server, app: Express) {
  // Intercept /@vite/client BEFORE Vite's own middleware so the browser gets
  // the no-op stub instead of the real client that opens a WebSocket.
  app.get("/@vite/client", (_req, res) => {
    res
      .set("Content-Type", "application/javascript; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(VITE_CLIENT_STUB);
  });

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: {
      middlewareMode: true,
      hmr: false,
      allowedHosts: true as const,
    },
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${BUILD_ID}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
