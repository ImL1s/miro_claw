// extensions/mirofish/src/backend-client.ts
/**
 * Lightweight HTTP client for MiroFish Flask backend.
 * Uses Node.js native fetch (available in Node 22+).
 */

const DEFAULT_BACKEND_URL = "http://localhost:5001";
const LLM_TIMEOUT_MS = 120_000;  // 120s for LLM-dependent calls (chat, interview)
const DATA_TIMEOUT_MS = 30_000;  // 30s for data fetches (report)

function getBaseUrl(): string {
  return process.env.MIROFISH_URL || DEFAULT_BACKEND_URL;
}

interface ChatResponse {
  success: boolean;
  data?: {
    response: string;
    tool_calls?: unknown[];
    sources?: unknown[];
  };
  error?: string;
}

interface InterviewResponse {
  success: boolean;
  data?: {
    response: string;
    agent_id: number;
    result?: {
      platforms?: Record<string, { response?: string; platform?: string }>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  error?: string;
}

interface ReportResponse {
  success: boolean;
  data?: {
    report_id: string;
    simulation_id: string;
    status: string;
    markdown_content: string;
    outline?: unknown;
    created_at?: string;
    completed_at?: string;
  };
  error?: string;
  has_report?: boolean;
}

/**
 * Chat with the Report Agent about a completed simulation.
 */
export async function chatWithAgent(
  simId: string,
  message: string,
  chatHistory: { role: string; content: string }[] = [],
): Promise<ChatResponse> {
  const url = `${getBaseUrl()}/api/report/chat`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        simulation_id: simId,
        message,
        chat_history: chatHistory,
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { success: false, error: `Backend HTTP ${res.status}` };
    }
    return (await res.json()) as ChatResponse;
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, error: "Backend response timeout (120s). The LLM may be overloaded." };
    }
    throw err;
  }
}

/**
 * Interview a specific simulation agent.
 */
export async function interviewAgent(
  simId: string,
  agentId: number,
  question: string,
): Promise<InterviewResponse> {
  const url = `${getBaseUrl()}/api/simulation/interview`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        simulation_id: simId,
        agent_id: agentId,
        prompt: question,
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { success: false, error: `Backend HTTP ${res.status}` };
    }
    const json = (await res.json()) as InterviewResponse;
    // Backend returns response nested in data.result.platforms.{platform}.response
    // Flatten it to data.response for consumers
    if (json.success && json.data && !json.data.response && json.data.result?.platforms) {
      const platforms = json.data.result.platforms;
      const first = Object.values(platforms).find((p) => p.response);
      if (first?.response) {
        // Strip <think>...</think> tags from chain-of-thought
        json.data.response = first.response.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
      }
    }
    return json;
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, error: "Backend response timeout (120s). The LLM may be overloaded." };
    }
    throw err;
  }
}

/**
 * Get the latest simulation ID that has a report.
 * Tries stopped simulations in reverse chronological order, verifying each has a report.
 * Returns null if none found.
 */
export async function getLatestSimulationId(): Promise<string | null> {
  const url = `${getBaseUrl()}/api/simulation/list`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(DATA_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: Array<{ simulation_id: string; status: string; created_at?: string }> };
    // Find stopped simulations, sorted by most recent first
    const stopped = json.data?.filter((s) => s.status === "stopped");
    if (!stopped?.length) return null;
    stopped.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    // Check each until we find one with an actual report
    for (const sim of stopped) {
      const report = await getReport(sim.simulation_id);
      if (report.success && report.data?.markdown_content) {
        return sim.simulation_id;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get report by simulation ID.
 */
export async function getReport(simId: string): Promise<ReportResponse> {
  const url = `${getBaseUrl()}/api/report/by-simulation/${encodeURIComponent(simId)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(DATA_TIMEOUT_MS) });
    if (!res.ok) {
      return { success: false, error: `Backend HTTP ${res.status}` };
    }
    return (await res.json()) as ReportResponse;
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, error: "Backend response timeout (30s)." };
    }
    throw err;
  }
}

/**
 * Agent profile from a simulation.
 */
export interface AgentProfile {
  id: number;
  name: string;
  persona: string;
  age?: number;
  gender?: string;
  country?: string;
  mbti?: string;
}

/**
 * Get agent profiles for a simulation.
 */
export async function getSimulationAgents(
  simId: string,
  platform: string = "reddit",
): Promise<{ success: boolean; agents?: AgentProfile[]; error?: string }> {
  const url = `${getBaseUrl()}/api/simulation/${encodeURIComponent(simId)}/profiles?platform=${platform}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(DATA_TIMEOUT_MS) });
    if (!res.ok) {
      return { success: false, error: `Backend HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      success: boolean;
      data?: { profiles: Array<Record<string, unknown>> };
      error?: string;
    };
    if (!json.success || !json.data?.profiles) {
      return { success: false, error: json.error || "No profiles found" };
    }
    const agents: AgentProfile[] = json.data.profiles.map((p, i) => ({
      id: i,
      name: (p.name as string) || `Agent ${i}`,
      persona: ((p.persona as string) || "").slice(0, 200),
      age: p.age as number | undefined,
      gender: p.gender as string | undefined,
      country: p.country as string | undefined,
      mbti: p.mbti as string | undefined,
    }));
    return { success: true, agents };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, error: "Backend response timeout (30s)." };
    }
    throw err;
  }
}

/**
 * Get posts from a simulation (what agents said on social media).
 */
export async function getSimulationPosts(
  simId: string,
  platform: string = "twitter",
  limit: number = 20,
): Promise<{ success: boolean; posts?: Array<Record<string, unknown>>; total?: number; error?: string }> {
  const url = `${getBaseUrl()}/api/simulation/${encodeURIComponent(simId)}/posts?platform=${platform}&limit=${limit}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(DATA_TIMEOUT_MS) });
    if (!res.ok) {
      return { success: false, error: `Backend HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      success: boolean;
      data?: { posts: Array<Record<string, unknown>>; total: number };
      error?: string;
    };
    if (!json.success || !json.data) {
      return { success: false, error: json.error || "No posts found" };
    }
    return { success: true, posts: json.data.posts, total: json.data.total };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, error: "Backend response timeout (30s)." };
    }
    throw err;
  }
}

/**
 * Check if simulation environment is alive (can accept interview commands).
 */
export async function checkEnvAlive(
  simId: string,
): Promise<{ alive: boolean; twitter?: boolean; reddit?: boolean }> {
  const url = `${getBaseUrl()}/api/simulation/env-status`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simulation_id: simId }),
      signal: AbortSignal.timeout(DATA_TIMEOUT_MS),
    });
    if (!res.ok) return { alive: false };
    const json = (await res.json()) as {
      success: boolean;
      data?: { env_alive: boolean; twitter_available: boolean; reddit_available: boolean };
    };
    return {
      alive: json.data?.env_alive ?? false,
      twitter: json.data?.twitter_available,
      reddit: json.data?.reddit_available,
    };
  } catch {
    return { alive: false };
  }
}

/**
 * Get report summary (truncated markdown for chat-friendly display).
 */
export async function getReportSummary(
  simId: string,
  maxChars: number = 2000,
): Promise<{ summary: string; reportId: string } | null> {
  const report = await getReport(simId);
  if (!report.success || !report.data) return null;

  const md = report.data.markdown_content || "";
  const summary = md.length > maxChars
    ? md.slice(0, maxChars) + "\n\n...(報告已截斷，完整內容請使用 Canvas Dashboard)"
    : md;

  return { summary, reportId: report.data.report_id };
}
