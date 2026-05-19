type WriteHandler = (text: string) => void;
type OpenHandler = () => void;
type StartClaudeHandler = (initialPrompt: string) => void;

class CoachBus {
  private writeHandler: WriteHandler | null = null;
  private openHandler: OpenHandler | null = null;
  private startClaudeHandler: StartClaudeHandler | null = null;
  private claudeRunning = false;

  registerWrite(h: WriteHandler): void {
    this.writeHandler = h;
  }

  registerOpen(h: OpenHandler): void {
    this.openHandler = h;
  }

  registerStartClaude(h: StartClaudeHandler): void {
    this.startClaudeHandler = h;
  }

  setClaudeRunning(active: boolean): void {
    this.claudeRunning = active;
  }

  unregister(): void {
    this.writeHandler = null;
    this.openHandler = null;
    this.startClaudeHandler = null;
    this.claudeRunning = false;
  }

  /**
   * Send a prompt to the coach.
   * - Always opens the sidebar (uncollapses if collapsed).
   * - If claude is currently running in the active terminal, types the prompt + Enter.
   * - Otherwise, asks the sidebar to launch a fresh `claude '<prompt>'` so the message is
   *   delivered as the user's first turn without requiring manual paste.
   */
  send(text: string): void {
    if (this.openHandler) this.openHandler();
    if (this.claudeRunning && this.writeHandler) {
      this.writeHandler(text + '\r');
      return;
    }
    if (this.startClaudeHandler) {
      this.startClaudeHandler(text);
      return;
    }
    console.warn('Coach sidebar not mounted yet — prompt dropped:', text.slice(0, 80));
  }

  ready(): boolean {
    return this.writeHandler !== null;
  }
}

export const coachBus = new CoachBus();
