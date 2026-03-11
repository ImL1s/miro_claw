// extensions/mirofish/src/hooks.ts
import type { RunManager } from "./run-manager.js";

interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface HookConfig {
  triggerKeywords?: string[];
  autoTrigger?: boolean;
}

/**
 * Create a message hook for Path B — auto-trigger predictions from chat.
 * Default: disabled. Set pluginConfig.autoTrigger = true to enable.
 */
export function createMessageHook(
  runManager: RunManager,
  config: Record<string, unknown>,
  log: Logger,
) {
  const hookConfig: HookConfig = {
    triggerKeywords: (config.triggerKeywords as string[]) || ["推演", "預測", "模擬", "如果.*會怎樣"],
    autoTrigger: (config.autoTrigger as boolean) || false,
  };

  return async (payload: Record<string, unknown>) => {
    if (!hookConfig.autoTrigger) return;

    const message = (payload.content as string) || (payload.text as string) || "";
    const messageId = (payload.messageId as string) || (payload.id as string) || "";

    if (!message) return;

    // Check if message matches any trigger pattern
    const patterns = hookConfig.triggerKeywords!.map((kw) => new RegExp(kw, "i"));
    const matched = patterns.some((p) => p.test(message));
    if (!matched) return;

    const topic = message.slice(0, 200).trim();

    // Dedupe check
    if (messageId && !runManager.checkDedupe(messageId)) {
      log.info(`[MiroFish] Hook: deduplicated message ${messageId}`);
      return;
    }

    // Idempotency check
    const hash = runManager.questionHash(topic);
    const cached = runManager.getCachedResult(hash);
    if (cached) {
      log.info(`[MiroFish] Hook: returning cached result for topic hash ${hash}`);
      return;
    }

    // Capacity check
    if (!runManager.canSpawn()) {
      log.info(`[MiroFish] Hook: at capacity, skipping auto-predict`);
      return;
    }

    log.info(`[MiroFish] Hook: auto-triggering prediction for "${topic.slice(0, 50)}..."`);

    runManager.spawn(topic, {
      onEvent(evt: unknown) {
        const event = evt as Record<string, unknown>;
        if (event.event === "run:done" && event.reportId) {
          runManager.cacheResult(hash, event.reportId as string);
          log.info(`[MiroFish] Hook: prediction complete, reportId=${event.reportId}`);
        }
        if (event.event === "run:error") {
          log.error(`[MiroFish] Hook: prediction failed: ${event.message}`);
        }
      },
    });
  };
}
