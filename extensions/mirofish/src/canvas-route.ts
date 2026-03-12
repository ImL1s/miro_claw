import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface HttpRequest {
  url: string;
}

interface HttpResponse {
  writeHead: (status: number, headers: Record<string, string>) => void;
  end: (body: string) => void;
}

interface PluginApi {
  registerHttpRoute: (params: {
    method: string;
    path: string;
    auth?: "gateway" | "plugin";
    handler: (req: HttpRequest, res: HttpResponse) => void | Promise<void>;
  }) => void;
}

/**
 * Register HTTP routes for serving MiroFish Canvas (report visualization).
 * Route: GET /mirofish/canvas?simId=xxx&api=http://localhost:5001
 */
export function registerCanvasRoute(
  api: PluginApi,
  config: Record<string, unknown>,
  log: Logger,
) {
  const backendUrl = (config.backendUrl as string) || "http://localhost:5001";

  let canvasHtml: string;
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const canvasPath = join(__dirname, "..", "canvas", "index.html");
    canvasHtml = readFileSync(canvasPath, "utf-8");
  } catch {
    log.error("[MiroFish] Failed to read canvas/index.html — Canvas route disabled.");
    return;
  }

  api.registerHttpRoute({
    method: "GET",
    path: "/mirofish/canvas",
    auth: "gateway",
    handler(req: HttpRequest, res: HttpResponse) {
      const url = new URL(req.url, "http://localhost");
      const simId = url.searchParams.get("simId") || "";
      // Always use configured backend URL — never accept from query params (SSRF prevention)
      const apiUrl = backendUrl;

      const injection = `
<script>
window.__MIROFISH_API__ = ${JSON.stringify(apiUrl)};
window.__MIROFISH_SIM_ID__ = ${JSON.stringify(simId)};
</script>
`;
      const html = canvasHtml.replace("</head>", injection + "</head>");

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(html);
    },
  });

  log.info("[MiroFish] Registered canvas route: GET /mirofish/canvas");
}
