type Handler = (text: string) => void;
type OpenHandler = () => void;

class CoachBus {
  private writeHandler: Handler | null = null;
  private openHandler: OpenHandler | null = null;

  registerWrite(h: Handler): void {
    this.writeHandler = h;
  }

  registerOpen(h: OpenHandler): void {
    this.openHandler = h;
  }

  unregister(): void {
    this.writeHandler = null;
    this.openHandler = null;
  }

  /** Send raw text + newline to the active coach terminal. Auto-opens sidebar if closed. */
  send(text: string): void {
    if (this.openHandler) this.openHandler();
    if (!this.writeHandler) {
      console.warn('Coach terminal not running. Open the sidebar and start a session first.');
      return;
    }
    // Send the text + carriage return so claude treats it as a complete prompt.
    this.writeHandler(text + '\r');
  }

  ready(): boolean {
    return this.writeHandler !== null;
  }
}

export const coachBus = new CoachBus();
