import { describe, expect, it } from "vitest";
import { createCoalescer } from "../src/coalescer.js";

function makeClock() {
  let t = 0;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

describe("createCoalescer", () => {
  it("push 后未到间隔不吐；到间隔吐出全部", () => {
    const clock = makeClock();
    const c = createCoalescer<number>(60, { now: clock.now });
    c.push(1);
    c.push(2);
    expect(c.drainDue(clock.now())).toEqual([]); // t=0 刚 push
    clock.tick(60);
    expect(c.drainDue(clock.now())).toEqual([1, 2]);
    expect(c.size).toBe(0);
  });

  it("FIFO 顺序保持", () => {
    const clock = makeClock();
    const c = createCoalescer<string>(60, { now: clock.now });
    c.push("a");
    c.push("b");
    c.push("c");
    clock.tick(100);
    expect(c.drainDue(clock.now())).toEqual(["a", "b", "c"]);
  });

  it("flushNow 立即吐出（terminal 事件）", () => {
    const clock = makeClock();
    const c = createCoalescer<number>(60, { now: clock.now });
    c.push(1);
    expect(c.flush()).toEqual([1]);
    expect(c.flush()).toEqual([]); // 空队列不崩溃
  });

  it("flush 后重新计时", () => {
    const clock = makeClock();
    const c = createCoalescer<number>(60, { now: clock.now });
    c.push(1);
    c.flush();
    c.push(2);
    clock.tick(30);
    expect(c.drainDue(clock.now())).toEqual([]); // flush 重置了 lastFlushAt
    clock.tick(30);
    expect(c.drainDue(clock.now())).toEqual([2]);
  });

  it("空队列 drainDue → []", () => {
    const clock = makeClock();
    const c = createCoalescer<number>(60, { now: clock.now });
    clock.tick(1000);
    expect(c.drainDue(clock.now())).toEqual([]);
  });

  it("intervalMs=0 → 每次 drainDue 都吐", () => {
    const clock = makeClock();
    const c = createCoalescer<number>(0, { now: clock.now });
    c.push(1);
    expect(c.drainDue(clock.now())).toEqual([1]);
  });

  it("容量上限保留最新", () => {
    const clock = makeClock();
    const c = createCoalescer<number>(60, { now: clock.now, maxQueue: 3 });
    for (let i = 0; i < 10; i++) c.push(i);
    expect(c.size).toBe(3);
    clock.tick(60);
    expect(c.drainDue(clock.now())).toEqual([7, 8, 9]);
  });

  it("默认时钟 Date.now 可用", () => {
    const c = createCoalescer<number>(1);
    c.push(1);
    expect(c.size).toBe(1);
  });
});
