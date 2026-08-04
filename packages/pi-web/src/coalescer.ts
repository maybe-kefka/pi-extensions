/**
 * 流式合并节流器（可注入时钟）。
 * SPEC §4.2：~60ms flush 一次，terminal 事件立即 flushNow。
 */

export interface Coalescer<T> {
  push(item: T): void;
  /** 立即吐出全部并清空（对应 message_end / tool_execution_end） */
  flush(): T[];
  /** 距上次 flush 超过间隔则吐出全部，否则 [] */
  drainDue(now: number): T[];
  readonly size: number;
}

const DEFAULT_MAX_QUEUE = 1000;

export function createCoalescer<T>(
  intervalMs: number,
  options?: { maxQueue?: number; now?: () => number },
): Coalescer<T> {
  const maxQueue = options?.maxQueue ?? DEFAULT_MAX_QUEUE;
  const nowFn = options?.now ?? Date.now;

  let buffer: T[] = [];
  let lastFlushAt = nowFn();

  function flush(): T[] {
    const out = buffer;
    buffer = [];
    lastFlushAt = nowFn();
    return out;
  }

  return {
    push(item) {
      buffer.push(item);
      if (buffer.length > maxQueue) {
        // 保留最新，丢弃最旧
        buffer = buffer.slice(-maxQueue);
      }
    },
    flush,
    drainDue(now) {
      if (buffer.length === 0) return [];
      if (now - lastFlushAt >= intervalMs) return flush();
      return [];
    },
    get size() {
      return buffer.length;
    },
  };
}
