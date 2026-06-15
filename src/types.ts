export interface Env {
  durable_objects_lunar_attendance: DurableObjectNamespace;
  DB_lunar_attendance: D1Database;
  DB_external_dummy: D1Database;
  KV_lunar_attendance: KVNamespace;
  EXTERNAL_API: string;
  EXTERNAL_API_SECRET?: string;
  APP_URL: string;
  QR_SECRET: string;
  ADMIN_SECRET: string;
}
