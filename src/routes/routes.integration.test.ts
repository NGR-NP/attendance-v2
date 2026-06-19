import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the cloudflare:workers module before importing Hono app
vi.mock("cloudflare:workers", () => {
  return {
    DurableObject: class DurableObjectMock {
      ctx: any;
      env: any;
      constructor(ctx: any, env: any) {
        this.ctx = ctx;
        this.env = env;
      }
    },
  };
});

import app from "../index";

// Mock D1Database helper
function createMockDb() {
  const mockAll = vi.fn().mockResolvedValue({ results: [] });
  const mockFirst = vi.fn().mockResolvedValue(null);
  const mockRun = vi.fn().mockResolvedValue({ success: true });
  
  const mockBind = vi.fn().mockReturnValue({
    all: mockAll,
    first: mockFirst,
    run: mockRun,
  });
  
  const mockPrepare = vi.fn().mockReturnValue({
    bind: mockBind,
    first: mockFirst,
    all: mockAll,
    run: mockRun,
  });

  return {
    db: {
      prepare: mockPrepare,
    } as unknown as D1Database,
    mockPrepare,
    mockBind,
    mockAll,
    mockFirst,
    mockRun,
  };
}

describe("Hono Routes Integration Tests", () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let mockEnv: any;

  beforeEach(() => {
    mockDb = createMockDb();
    mockEnv = {
      DB_lunar_attendance: mockDb.db,
      KV_lunar_attendance: {
        get: vi.fn(),
        put: vi.fn(),
      },
      ADMIN_SECRET: "admin-secret-key-xyz",
      QR_SECRET: "qr-secret",
      APP_URL: "https://lunar.example.com",
    };
  });

  describe("Admin Area Auth", () => {
    it("should redirect unauthenticated admin requests to login page", async () => {
      const res = await app.request("/admin", { method: "GET" }, mockEnv);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/admin/login");
    });

    it("should render login form on /admin/login", async () => {
      const res = await app.request("/admin/login", { method: "GET" }, mockEnv);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Admin Login");
      expect(text).toContain("Admin Secret");
    });
  });

  describe("Teacher Area Auth", () => {
    it("should show login view if no session cookie is present on teacher dashboard", async () => {
      const res = await app.request("/teacher/class", { method: "GET" }, mockEnv);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Open your attendance workspace");
      expect(html).toContain("PIN");
    });
  });

  describe("Student Registration", () => {
    it("should show error page when register is loaded without query token", async () => {
      const res = await app.request("/register", { method: "GET" }, mockEnv);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Missing QR Token");
      expect(html).toContain("Error");
    });
  });
});
