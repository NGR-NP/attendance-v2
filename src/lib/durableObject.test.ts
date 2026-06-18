import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the cloudflare:workers module before importing the Durable Object
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

// Mock WebSocket class
class MockWebSocket {
  send = vi.fn();
  close = vi.fn();
}

// // Set up WebSocketPair global mock
// globalThis.WebSocketPair = class {
//   0 = new MockWebSocket();
//   1 = new MockWebSocket();
// } as any;

// Mock Response to bypass Node's status 101 RangeError
const OriginalResponse = globalThis.Response;
globalThis.Response = class MockResponse extends OriginalResponse {
  constructor(body?: any, init?: any) {
    if (init && init.status === 101) {
      super(body, { ...init, status: 200 });
      Object.defineProperty(this, "status", { value: 101 });
      Object.defineProperty(this, "webSocket", { value: init.webSocket });
      return;
    }
    super(body, init);
  }
} as any;

// Import the Durable Object
import { AttendanceSession } from "../do/AttendanceSession";

describe("AttendanceSession Durable Object", () => {
  let mockStorage: Map<string, any>;
  let mockCtx: any;
  let mockEnv: any;
  let mockWebSockets: MockWebSocket[];

  beforeEach(() => {
    mockStorage = new Map();
    mockWebSockets = [];
    mockEnv = {
      APP_URL: "https://lunar-test.example.com",
    };

    mockCtx = {
      storage: {
        get: vi.fn().mockImplementation(async (key: string) => mockStorage.get(key)),
        put: vi.fn().mockImplementation(async (key: string, val: any) => mockStorage.set(key, val)),
      },
      getWebSockets: vi.fn().mockImplementation(() => mockWebSockets),
      acceptWebSocket: vi.fn().mockImplementation((ws) => {
        mockWebSockets.push(ws);
      }),
    };
  });

  it("should initialize the session on /start POST request", async () => {
    const session = new AttendanceSession(mockCtx, mockEnv);

    const req = new Request("https://do-internal/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "session_123",
        classId: "class_cs101",
        appOrigin: "https://custom-origin.com",
      }),
    });

    const response = await session.fetch(req);
    expect(response.status).toBe(200);

    const json = await response.json<{ ok: boolean }>();
    expect(json).toEqual({ ok: true });

    // Verify stored state in ctx.storage
    const storedState = mockStorage.get("sessionState");
    expect(storedState).toEqual({
      sessionId: "session_123",
      classId: "class_cs101",
      appOrigin: "https://custom-origin.com",
      status: "active",
    });
  });

  it("should establish WebSocket and send initial connection URL on /ws", async () => {
    // Pre-seed storage state
    mockStorage.set("sessionState", {
      sessionId: "session_999",
      classId: "class_cs101",
      appOrigin: "https://custom-origin.com",
      status: "active",
    });

    const session = new AttendanceSession(mockCtx, mockEnv);
    const req = new Request("https://do-internal/ws");
    
    const response = await session.fetch(req);
    expect(response.status).toBe(101); // Switching Protocols

    // Verify socket accepted and welcomed
    expect(mockCtx.acceptWebSocket).toHaveBeenCalled();
    expect(mockWebSockets.length).toBe(1);
    
    const ws = mockWebSockets[0];
    expect(ws.send).toHaveBeenCalled();
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData).toEqual({
      type: "connected",
      url: "https://custom-origin.com/attend?s=session_999",
    });
  });

  it("should broadcast attend-broadcast messages to all active WebSockets", async () => {
    // Pre-seed state
    mockStorage.set("sessionState", {
      sessionId: "session_123",
      classId: "class_cs101",
      appOrigin: "https://custom-origin.com",
      status: "active",
    });

    const session = new AttendanceSession(mockCtx, mockEnv);

    // Mock two connected sockets
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();
    mockWebSockets.push(ws1 as any, ws2 as any);

    const req = new Request("https://do-internal/attend-broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: "Ada Lovelace",
        classCode: "CS101",
        className: "Intro to CS",
        alreadyMarked: false,
        checkedOut: false,
      }),
    });

    const response = await session.fetch(req);
    expect(response.status).toBe(200);

    // Verify both sockets received the broadcast payload
    expect(ws1.send).toHaveBeenCalled();
    expect(ws2.send).toHaveBeenCalled();

    const payload1 = JSON.parse(ws1.send.mock.calls[0][0]);
    expect(payload1).toEqual({
      type: "attended",
      studentName: "Ada Lovelace",
      classCode: "CS101",
      className: "Intro to CS",
      alreadyMarked: false,
      checkedOut: false,
    });
  });

  it("should close WebSocket connection gracefully on webSocketClose", async () => {
    const session = new AttendanceSession(mockCtx, mockEnv);
    const mockWs = new MockWebSocket();

    await session.webSocketClose(mockWs as any);
    expect(mockWs.close).toHaveBeenCalled();
  });
});
