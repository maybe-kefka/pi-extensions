import { describe, expect, it, vi } from "vitest";
import { portAlive } from "./net-probe";

describe("portAlive", () => {
  it("端口可连接 → true", async () => {
    const listeners = new Map<string, () => void>();
    const connect2 = vi.fn(() => {
      const s = {
        setTimeout: vi.fn(),
        destroy: vi.fn(),
        once: (evt: string, cb: () => void) => {
          listeners.set(evt, cb);
        },
      } as never;
      return s as never;
    });
    const p = portAlive(80, connect2 as never);
    listeners.get("connect")?.();
    expect(await p).toBe(true);
  });

  it("连接错误/超时 → false", async () => {
    const listeners = new Map<string, () => void>();
    const connectErr = vi.fn(() => {
      const s = {
        setTimeout: vi.fn(),
        destroy: vi.fn(),
        once: (evt: string, cb: () => void) => {
          listeners.set(evt, cb);
        },
      } as never;
      return s as never;
    });
    const p1 = portAlive(80, connectErr as never);
    listeners.get("error")?.();
    expect(await p1).toBe(false);

    const listeners2 = new Map<string, () => void>();
    const connectTimeout = vi.fn(() => {
      const s = {
        setTimeout: vi.fn(),
        destroy: vi.fn(),
        once: (evt: string, cb: () => void) => {
          listeners2.set(evt, cb);
        },
      } as never;
      return s as never;
    });
    const p2 = portAlive(80, connectTimeout as never);
    listeners2.get("timeout")?.();
    expect(await p2).toBe(false);
  });
});
