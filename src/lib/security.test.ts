import { describe, it, expect, vi } from "vitest";
import { requestIp, rateLimit } from "./rateLimit";

// Mock KVNamespace implementation
function createMockKV() {
  const store = new Map<string, string>();
  
  const get = vi.fn().mockImplementation(async (key: string, type: string) => {
    const val = store.get(key);
    if (!val) return null;
    if (type === "json") return JSON.parse(val);
    return val;
  });

  const put = vi.fn().mockImplementation(async (key: string, val: string) => {
    store.set(key, val);
  });

  return {
    kv: {
      get,
      put,
    } as unknown as KVNamespace,
    store,
    getMock: get,
    putMock: put,
  };
}

describe("Security Guards - Rate Limiting & IP Detection", () => {
  describe("requestIp", () => {
    it("should prioritize cf-connecting-ip header", () => {
      const req = new Request("https://example.com/api", {
        headers: {
          "cf-connecting-ip": "1.1.1.1",
          "x-real-ip": "2.2.2.2",
          "x-forwarded-for": "3.3.3.3, 4.4.4.4",
        },
      });

      const ip = requestIp(req);
      expect(ip).toBe("1.1.1.1");
    });

    it("should use x-real-ip if cf-connecting-ip is missing", () => {
      const req = new Request("https://example.com/api", {
        headers: {
          "x-real-ip": "2.2.2.2",
          "x-forwarded-for": "3.3.3.3, 4.4.4.4",
        },
      });

      const ip = requestIp(req);
      expect(ip).toBe("2.2.2.2");
    });

    it("should use first address in x-forwarded-for if other headers missing", () => {
      const req = new Request("https://example.com/api", {
        headers: {
          "x-forwarded-for": "3.3.3.3, 4.4.4.4",
        },
      });

      const ip = requestIp(req);
      expect(ip).toBe("3.3.3.3");
    });

    it("should fall back to 'unknown' if no headers are set", () => {
      const req = new Request("https://example.com/api");

      const ip = requestIp(req);
      expect(ip).toBe("unknown");
    });

    it("should sanitize the IP key to prevent unsafe characters", () => {
      const req = new Request("https://example.com/api", {
        headers: {
          "x-real-ip": "12.34;drop table users;",
        },
      });

      const ip = requestIp(req);
      expect(ip).not.toContain(";");
      expect(ip).toBe("12.34_drop_table_users_");
    });
  });

  describe("rateLimit", () => {
    it("should allow first request and initialize KV bucket", async () => {
      const { kv, store, putMock } = createMockKV();
      
      const result = await rateLimit(kv, "test-ip", 3, 60);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
      expect(result.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(store.has("test-ip")).toBe(true);
      expect(putMock).toHaveBeenCalled();
    });

    it("should count up requests and then reject when exceeding limit", async () => {
      const { kv } = createMockKV();
      
      const res1 = await rateLimit(kv, "user_1", 2, 60);
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(1);

      const res2 = await rateLimit(kv, "user_1", 2, 60);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(0);

      const res3 = await rateLimit(kv, "user_1", 2, 60);
      expect(res3.allowed).toBe(false);
      expect(res3.remaining).toBe(0);
    });

    it("should reset count if the window has expired", async () => {
      const { kv, store } = createMockKV();
      
      // Seed with an expired bucket
      const expiredTime = Math.floor(Date.now() / 1000) - 10;
      store.set(
        "user_2",
        JSON.stringify({ count: 5, resetAt: expiredTime })
      );

      const result = await rateLimit(kv, "user_2", 5, 60);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.resetAt).toBeGreaterThan(expiredTime + 10);
    });

    it("should sanitize key before writing to KV", async () => {
      const { kv, store } = createMockKV();
      
      const unsafeKey = "test:key/with#special$chars";
      const sanitizedKey = "test:key_with_special_chars";

      await rateLimit(kv, unsafeKey, 5, 60);

      expect(store.has(sanitizedKey)).toBe(true);
      expect(store.has(unsafeKey)).toBe(false);
    });
  });
});
