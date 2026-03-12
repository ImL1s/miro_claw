/**
 * SSE Progress Broadcaster
 *
 * Provides a Server-Sent Events endpoint for real-time progress updates.
 * Clients connect to GET /mirofish/events?runId=xxx to receive NDJSON events.
 *
 * This is the fallback for when Gateway WebSocket broadcastEvent is unavailable.
 */

interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface HttpRequest {
  url: string;
}

interface HttpResponse {
  writeHead: (status: number, headers: Record<string, string>) => void;
  write: (data: string) => boolean;
  end: (body?: string) => void;
  on?: (event: string, handler: () => void) => void;
}

interface PluginApi {
  registerHttpRoute: (params: {
    method: string;
    path: string;
    auth?: "gateway" | "plugin";
    handler: (req: HttpRequest, res: HttpResponse) => void | Promise<void>;
  }) => void;
}

interface Subscriber {
  runId: string | null;  // null = subscribe to all
  res: HttpResponse;
}

/**
 * Create an SSE progress broadcaster.
 * Returns { broadcast, registerRoute } functions.
 */
export function createProgressBroadcaster(log: Logger) {
  const subscribers: Set<Subscriber> = new Set();

  /**
   * Broadcast an event to all matching subscribers.
   */
  function broadcast(runId: string, event: Record<string, unknown>) {
    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const sub of subscribers) {
      if (sub.runId === null || sub.runId === runId) {
        try {
          sub.res.write(data);
        } catch {
          subscribers.delete(sub);
        }
      }
    }
  }

  /**
   * Register the SSE HTTP route: GET /mirofish/events
   * Query params: runId (optional, subscribe to specific run)
   */
  function registerRoute(api: PluginApi) {
    api.registerHttpRoute({
      method: "GET",
      path: "/mirofish/events",
      auth: "gateway",
      handler(req: HttpRequest, res: HttpResponse) {
        const url = new URL(req.url, "http://localhost");
        const runId = url.searchParams.get("runId");

        // SSE headers
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",  // Disable nginx buffering
        });

        // Send initial connection event
        res.write(`data: ${JSON.stringify({ event: "connected", runId: runId || "all" })}\n\n`);

        const sub: Subscriber = { runId, res };
        subscribers.add(sub);

        log.info(`[MiroFish] SSE client connected (runId: ${runId || "all"}, total: ${subscribers.size})`);

        // Clean up on disconnect
        if (res.on) {
          res.on("close", () => {
            subscribers.delete(sub);
            log.info(`[MiroFish] SSE client disconnected (total: ${subscribers.size})`);
          });
        }
      },
    });

    log.info("[MiroFish] Registered SSE route: GET /mirofish/events");

    // Heartbeat to detect dead connections every 30s
    const heartbeatInterval = setInterval(() => {
      for (const sub of subscribers) {
        try {
          sub.res.write(`: heartbeat\n\n`);
        } catch {
          subscribers.delete(sub);
        }
      }
    }, 30_000);
    heartbeatInterval.unref();
  }

  /**
   * Get current subscriber count (for diagnostics).
   */
  function subscriberCount(): number {
    return subscribers.size;
  }

  /**
   * Close all subscriber connections.
   */
  function closeAll() {
    for (const sub of subscribers) {
      try { sub.res.end(); } catch { /* ignore */ }
    }
    subscribers.clear();
  }

  return { broadcast, registerRoute, subscriberCount, closeAll };
}
