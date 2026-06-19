import { Context } from "hono";
import { getCookie } from "hono/cookie";
import { Env } from "../types";
import { getTeacherBySessionToken } from "./externalDummy";

export const ADMIN_COOKIE = "admin_session";
export const TEACHER_SESSION_COOKIE = "teacher_session";

export async function verifyAdminToken(
  token: string,
  secret: string,
): Promise<boolean> {
  try {
    if (!token) return false;

    console.log("Admin token :", token);
    const decoded = decodeURIComponent(token);

    const [payload, hex] = decoded.split(".");
    if (!payload || !hex) return false;

    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const sigBytes = Uint8Array.from(
      hex.match(/.{2}/g) ?? [],
      (b) => parseInt(b, 16),
    );

    if (sigBytes.length === 0) return false;

    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(payload),
    );
  } catch (err) {
    console.error("verifyAdminToken error:", err);
    return false;
  }
}
export async function signAdminToken(secret: string): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const payload = "admin:authenticated";

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );

  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${payload}.${hex}`;
}
export async function currentAdmin(
  c: Context<{ Bindings: Env }>,
): Promise<boolean> {
  const token =  getCookie(c, ADMIN_COOKIE);


  if (!token) return false;

  return  await verifyAdminToken(token, c.env.ADMIN_SECRET);
}
export async function currentTeacher(c: Context<{ Bindings: Env }>) {
  const token = getCookie(c, TEACHER_SESSION_COOKIE);
  if (!token) return null;
  return getTeacherBySessionToken(c.env.DB_lunar_attendance, token);
}

export async function currentTeacherSession(c: Context<{ Bindings: Env }>) {
  const token = getCookie(c, TEACHER_SESSION_COOKIE);
  if (!token) return null;
  const teacher = await getTeacherBySessionToken(
    c.env.DB_lunar_attendance,
    token,
  );
  return teacher ? { token, teacher } : null;
}


function normalizeToken(token: string | undefined | null): string | null {
  if (!token) return null;
  try {
    return decodeURIComponent(token);
  } catch {
    return token; // fallback if already decoded
  }
}