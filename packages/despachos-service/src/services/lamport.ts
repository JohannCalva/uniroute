export class LamportQueueManager {
  private queues: Record<string, { incomingClock: number, resolve: () => void, timer: NodeJS.Timeout }[]> = {};
  private lastSeenClock: Record<string, number> = {};

  async waitForTurn(busId: string, incomingClock: number): Promise<void> {
    if (this.lastSeenClock[busId] === undefined) {
      this.lastSeenClock[busId] = incomingClock;
      return Promise.resolve();
    }

    const expected = this.lastSeenClock[busId] + 1;
    
    if (incomingClock <= expected) {
      // Event is in order or from the past (process immediately)
      this.lastSeenClock[busId] = Math.max(this.lastSeenClock[busId], incomingClock);
      return Promise.resolve();
    }

    // Event is in the future, wait
    return new Promise((resolve) => {
      if (!this.queues[busId]) {
        this.queues[busId] = [];
      }

      const timer = setTimeout(() => {
        // Timeout reached, process anyway
        this.removeQueueItem(busId, incomingClock);
        this.lastSeenClock[busId] = Math.max(this.lastSeenClock[busId] ?? -1, incomingClock);
        this.processNext(busId);
        resolve();
      }, 5000);

      this.queues[busId].push({ incomingClock, resolve, timer });
      // Sort the queue so the lowest clock is at the end (or just sort ascending and process from start)
      this.queues[busId].sort((a, b) => a.incomingClock - b.incomingClock);
    });
  }

  notifyProcessed(busId: string, processedClock: number) {
    if (this.lastSeenClock[busId] === undefined) {
      this.lastSeenClock[busId] = processedClock;
    } else {
      this.lastSeenClock[busId] = Math.max(this.lastSeenClock[busId], processedClock);
    }
    this.processNext(busId);
  }

  private processNext(busId: string) {
    const queue = this.queues[busId];
    if (!queue || queue.length === 0) return;

    if (this.lastSeenClock[busId] === undefined) {
      // Should not happen if notifyProcessed or waitForTurn was called, but just in case
      this.lastSeenClock[busId] = -1;
    }

    const expected = this.lastSeenClock[busId] + 1;
    const nextItem = queue[0];

    if (nextItem.incomingClock <= expected) {
      // It's their turn
      clearTimeout(nextItem.timer);
      queue.shift();
      this.lastSeenClock[busId] = Math.max(this.lastSeenClock[busId], nextItem.incomingClock);
      nextItem.resolve();
      
      // Recursively check if the next one is also ready
      this.processNext(busId);
    }
  }

  private removeQueueItem(busId: string, incomingClock: number) {
    const queue = this.queues[busId];
    if (queue) {
      this.queues[busId] = queue.filter(item => item.incomingClock !== incomingClock);
    }
  }

  cleanupBus(busId: string) {
    if (this.queues[busId]) {
      this.queues[busId].forEach(item => clearTimeout(item.timer));
      delete this.queues[busId];
    }
    delete this.lastSeenClock[busId];
  }
}

export const lamportQueue = new LamportQueueManager();
