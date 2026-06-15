import { DurableObject } from "cloudflare:workers";
import { Env } from "../types";
import {
  AttendanceScanMetadata,
  markExternalAttendance,
  rotateStudentAccessToken,
  verifyStudentAccessForClass,
} from "../lib/externalDummy";
import { localDateKey } from "../lib/date";

interface QrState {
  token: string;
  expiresAt: number; // ms timestamp
}

interface StoredSessionState {
  sessionId: string;
  classId: string;
  appOrigin: string;
  currentQr: QrState | null;
  status: "active" | "paused" | "ended";
}

// Messages broadcast over WebSocket to teacher dashboard
type WsMessage =
  | { type: "qr_ready"; qr: QrState; url: string }
  | {
      type: "attended";
      studentName: string;
      studentId: string;
      alreadyMarked?: boolean;
      nextQr: QrState;
      url: string;
    }
  | { type: "error"; message: string };

export class AttendanceSession extends DurableObject<Env> {
  private sessionId: string = "";
  private classId: string = "";
  private appOrigin: string = "";
  private currentQr: QrState | null = null;
  private status: "active" | "paused" | "ended" = "active";
  private stateLoaded = false;

  private async loadState() {
    if (this.stateLoaded) return;

    const state =
      await this.ctx.storage.get<StoredSessionState>("sessionState");
    if (state) {
      this.sessionId = state.sessionId;
      this.classId = state.classId ?? "";
      this.appOrigin = state.appOrigin ?? "";
      this.currentQr = state.currentQr;
      this.status = state.status;
    }
    this.stateLoaded = true;
  }

  private async saveState() {
    await this.ctx.storage.put("sessionState", {
      sessionId: this.sessionId,
      classId: this.classId,
      appOrigin: this.appOrigin,
      currentQr: this.currentQr,
      status: this.status,
    } satisfies StoredSessionState);
  }

  private makeQrToken(): QrState {
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    return { token, expiresAt: Date.now() + 90_000 }; // 90s TTL
  }

  private attendUrl(qr: QrState): string {
    const origin = this.appOrigin || this.env.APP_URL;
    return `${origin}/attend?s=${this.sessionId}&q=${qr.token}`;
  }

  private todayKey(): string {
    return localDateKey();
  }

  private async rotateQr() {
    this.currentQr = this.makeQrToken();
    await this.saveState();
    await this.ctx.storage.setAlarm(this.currentQr.expiresAt);
    return this.currentQr;
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

    // ── WebSocket upgrade (teacher dashboard) ──────────────────────
    if (url.pathname === "/ws") {
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);
      // Send current QR immediately on connect
      if (this.currentQr) {
        server.send(
          JSON.stringify({
            type: "qr_ready",
            qr: this.currentQr,
            url: this.attendUrl(this.currentQr),
          } satisfies WsMessage),
        );
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    // ── Start session / generate first QR ─────────────────────────
    if (url.pathname === "/start" && req.method === "POST") {
      const { sessionId, classId, appOrigin } = await req.json<{
        sessionId: string;
        classId: string;
        appOrigin?: string;
      }>();
      this.sessionId = sessionId;
      this.classId = classId;
      this.appOrigin = appOrigin ?? this.env.APP_URL;
      this.currentQr = this.makeQrToken();
      this.status = "active";
      await this.saveState();
      // Alarm to auto-expire QR
      await this.ctx.storage.setAlarm(this.currentQr.expiresAt);
      this.broadcast({
        type: "qr_ready",
        qr: this.currentQr,
        url: this.attendUrl(this.currentQr),
      });
      return Response.json({ ok: true });
    }

    // ── Student submits token ──────────────────────────────────────
    if (url.pathname === "/attend" && req.method === "POST") {
      const { qrToken, accessToken, metadata } = await req.json<{
        qrToken: string;
        accessToken: string;
        metadata?: AttendanceScanMetadata;
      }>();

      if (this.status !== "active") {
        return Response.json(
          { ok: false, error: "Session not active" },
          { status: 409 },
        );
      }
      if (!this.currentQr || qrToken !== this.currentQr.token) {
        return Response.json(
          { ok: false, error: "QR token invalid or expired" },
          { status: 400 },
        );
      }
      if (Date.now() > this.currentQr.expiresAt) {
        return Response.json(
          { ok: false, error: "QR expired" },
          { status: 410 },
        );
      }

      // ── Validate student access against the external dummy DB ───
      let studentName: string;
      let studentId: string;
      let nextAccessToken: string | undefined;
      try {
        const student = await verifyStudentAccessForClass(
          this.env.DB_external_dummy,
          accessToken,
          this.classId,
        );
        if (!student) {
          return Response.json(
            { ok: false, error: "Student is not enrolled in this class" },
            { status: 401 },
          );
        }
        studentName = student.studentName;
        studentId = student.studentId;
      } catch {
        return Response.json(
          { ok: false, error: "External dummy DB unreachable" },
          { status: 502 },
        );
      }

      // ── Persist to the external source of truth ─────────────────
      try {
        const attendanceDay = this.todayKey();
        const result = await markExternalAttendance(
          this.env.DB_external_dummy,
          {
            sessionId: this.sessionId,
            classId: this.classId,
            studentId,
            studentName,
            attendanceDay,
            metadata,
          },
        );

        if (result.alreadyMarked) {
          const rotated = await rotateStudentAccessToken(
            this.env.DB_external_dummy,
            accessToken,
            studentId,
          );
          if (!rotated) {
            return Response.json(
              { ok: false, error: "Access token expired. Claim access again." },
              { status: 401 },
            );
          }
          const nextQr = await this.rotateQr();
          this.broadcast({
            type: "attended",
            studentName: result.studentName,
            studentId,
            alreadyMarked: true,
            nextQr,
            url: this.attendUrl(nextQr),
          });
          return Response.json({
            ok: true,
            alreadyMarked: true,
            studentName: result.studentName,
            nextAccessToken: rotated.accessToken,
          });
        }
      } catch (error) {
        return Response.json(
          { ok: false, error: "Could not save attendance" },
          { status: 500 },
        );
      }

      const rotated = await rotateStudentAccessToken(
        this.env.DB_external_dummy,
        accessToken,
        studentId,
      );
      if (!rotated) {
        return Response.json(
          { ok: false, error: "Access token expired. Claim access again." },
          { status: 401 },
        );
      }
      nextAccessToken = rotated.accessToken;

      // ── Generate next QR and broadcast ─────────────────────────
      const nextQr = await this.rotateQr();
      this.broadcast({
        type: "attended",
        studentName,
        studentId,
        nextQr,
        url: this.attendUrl(nextQr),
      });

      return Response.json({ ok: true, studentName, nextAccessToken });
    }

    return new Response("Not found", { status: 404 });
  }

  // QR auto-expired — regenerate and push to teacher
  async alarm() {
    await this.loadState();
    if (this.status !== "active") return;
    this.currentQr = this.makeQrToken();
    await this.saveState();
    await this.ctx.storage.setAlarm(this.currentQr.expiresAt);
    this.broadcast({
      type: "qr_ready",
      qr: this.currentQr,
      url: this.attendUrl(this.currentQr),
    });
  }

  async webSocketClose(ws: WebSocket) {
    ws.close();
  }
}
