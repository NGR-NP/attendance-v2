import { DurableObject } from "cloudflare:workers";
import { Env } from "../types";

interface StoredSessionState {
  sessionId: string;
  classId: string;
  appOrigin: string;
  status: "active" | "paused" | "ended";
}

type WsMessage =
  | { type: "connected"; url: string }
  | {
      type: "attended";
      studentName: string;
      className?: string;
      classCode?: string;
      alreadyMarked?: boolean;
      checkedOut?: boolean;
    }
  | { type: "error"; message: string };

export class AttendanceSession extends DurableObject<Env> {
  private sessionId: string = "";
  private classId: string = "";
  private appOrigin: string = "";
  private status: "active" | "paused" | "ended" = "active";
  private stateLoaded = false;

  private async loadState() {
    if (this.stateLoaded) return;
    const state = await this.ctx.storage.get<StoredSessionState>("sessionState");
    if (state) {
      this.sessionId = state.sessionId;
      this.classId = state.classId ?? "";
      this.appOrigin = state.appOrigin ?? "";
      this.status = state.status;
    }
    this.stateLoaded = true;
  }

  private async saveState() {
    await this.ctx.storage.put("sessionState", {
      sessionId: this.sessionId,
      classId: this.classId,
      appOrigin: this.appOrigin,
      status: this.status,
    } satisfies StoredSessionState);
  }

  private attendUrl(): string {
    const origin = this.appOrigin || this.env.APP_URL;
    return `${origin}/attend?s=${this.sessionId}`;
  }

  private broadcast(msg: WsMessage) {
    const payload = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {}
    }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    await this.loadState();

    if (url.pathname === "/ws") {
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);
      server.send(
        JSON.stringify({
          type: "connected",
          url: this.attendUrl(),
        } satisfies WsMessage),
      );
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/start" && req.method === "POST") {
      const { sessionId, classId, appOrigin } = await req.json<{
        sessionId: string;
        classId: string;
        appOrigin?: string;
      }>();
      this.sessionId = sessionId;
      this.classId = classId;
      this.appOrigin = appOrigin ?? this.env.APP_URL;
      this.status = "active";
      await this.saveState();
      
      this.broadcast({
        type: "connected",
        url: this.attendUrl(),
      });
      return Response.json({ ok: true });
    }

    if (url.pathname === "/attend-broadcast" && req.method === "POST") {
      const { studentName, alreadyMarked, checkedOut, className, classCode } = await req.json<{
        studentName: string;
        alreadyMarked?: boolean;
        checkedOut?: boolean;
        className?: string;
        classCode?: string;
      }>();

      this.broadcast({
        type: "attended",
        studentName,
        className,
        classCode,
        alreadyMarked,
        checkedOut,
      });

      return Response.json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketClose(ws: WebSocket) {
    ws.close();
  }
}
