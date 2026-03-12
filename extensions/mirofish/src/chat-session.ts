// extensions/mirofish/src/chat-session.ts
/**
 * Per-simulation chat history manager.
 * Maintains conversation context for Report Agent interactions.
 */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_HISTORY_LENGTH = 20;

export class ChatSessionManager {
  private sessions: Map<string, ChatMessage[]> = new Map();

  /** Add a user message to the session. */
  addUserMessage(simId: string, content: string): void {
    this.ensureSession(simId);
    this.sessions.get(simId)!.push({ role: "user", content });
    this.trim(simId);
  }

  /** Add an assistant response to the session. */
  addAssistantMessage(simId: string, content: string): void {
    this.ensureSession(simId);
    this.sessions.get(simId)!.push({ role: "assistant", content });
    this.trim(simId);
  }

  /** Get full chat history for a simulation. */
  getHistory(simId: string): ChatMessage[] {
    return this.sessions.get(simId) || [];
  }

  /** Clear history for a simulation. */
  clear(simId: string): void {
    this.sessions.delete(simId);
  }

  /** Clear all sessions. */
  clearAll(): void {
    this.sessions.clear();
  }

  /** Get number of active sessions. */
  get size(): number {
    return this.sessions.size;
  }

  private ensureSession(simId: string): void {
    if (!this.sessions.has(simId)) {
      this.sessions.set(simId, []);
    }
  }

  private trim(simId: string): void {
    const history = this.sessions.get(simId);
    if (history && history.length > MAX_HISTORY_LENGTH * 2) {
      // Keep only the last MAX_HISTORY_LENGTH pairs
      this.sessions.set(simId, history.slice(-MAX_HISTORY_LENGTH * 2));
    }
  }
}
