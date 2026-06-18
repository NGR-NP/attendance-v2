export interface AllowedWifiIp {
  id: string;
  label: string;
  ipAddress: string;
  enabled: boolean;
  createdAt: number;
}

interface AllowedWifiIpRow {
  id: string;
  label: string;
  ipAddress: string;
  enabled: number;
  createdAt: number;
}

export interface WifiAccessDecision {
  configured: boolean;
  allowed: boolean;
  normalizedIp: string | null;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function normalizeIpv4(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4) return null;

  const normalized = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const numeric = Number(part);
    if (numeric < 0 || numeric > 255) return null;
    normalized.push(String(numeric));
  }

  return normalized.join(".");
}

function isValidIpv6(value: string) {
  if (!value.includes(":")) return false;
  if (!/^[0-9a-f:]+$/.test(value)) return false;
  if ((value.match(/::/g) ?? []).length > 1) return false;

  const parts = value.split(":");
  const validPart = (part: string) => part === "" || /^[0-9a-f]{1,4}$/.test(part);

  if (value.includes("::")) {
    return parts.length <= 8 && parts.every(validPart);
  }

  return parts.length === 8 && parts.every((part) => /^[0-9a-f]{1,4}$/.test(part));
}

export function normalizeIpAddress(value: string | undefined | null) {
  const trimmed = String(value ?? "").trim().toLowerCase();
  if (!trimmed || trimmed === "unknown") return null;

  const unwrapped =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;

  return normalizeIpv4(unwrapped) ?? (isValidIpv6(unwrapped) ? unwrapped : null);
}

export function cleanWifiLabel(value: string | undefined | null) {
  const label = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 80);
  return label || "Allowed Wi-Fi";
}

export function wifiAccessDecisionFromEntries(
  requesterIp: string,
  entries: Pick<AllowedWifiIp, "ipAddress" | "enabled">[],
): WifiAccessDecision {
  const enabledEntries = entries.filter((entry) => entry.enabled);
  const normalizedIp = normalizeIpAddress(requesterIp);

  if (enabledEntries.length === 0) {
    return { configured: false, allowed: true, normalizedIp };
  }

  if (!normalizedIp) {
    return { configured: true, allowed: false, normalizedIp };
  }

  return {
    configured: true,
    allowed: enabledEntries.some(
      (entry) => normalizeIpAddress(entry.ipAddress) === normalizedIp,
    ),
    normalizedIp,
  };
}

export async function listAllowedWifiIps(
  db: D1Database,
): Promise<AllowedWifiIp[]> {
  const { results } = await db
    .prepare(
      `SELECT id,
              label,
              ip_address AS ipAddress,
              enabled,
              created_at AS createdAt
         FROM allowed_wifi_ips
        ORDER BY enabled DESC, label COLLATE NOCASE, ip_address`,
    )
    .all<AllowedWifiIpRow>();

  return (results ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    ipAddress: row.ipAddress,
    enabled: Boolean(row.enabled),
    createdAt: row.createdAt,
  }));
}

export async function saveAllowedWifiIp(
  db: D1Database,
  label: string,
  ipAddress: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalizedIp = normalizeIpAddress(ipAddress);
  if (!normalizedIp) {
    return { ok: false, error: "invalid-ip" };
  }

  const cleanLabel = cleanWifiLabel(label);
  const existing = await db
    .prepare(`SELECT id FROM allowed_wifi_ips WHERE ip_address = ? LIMIT 1`)
    .bind(normalizedIp)
    .first<{ id: string }>();

  if (existing) {
    await db
      .prepare(
        `UPDATE allowed_wifi_ips
            SET label = ?, enabled = 1
          WHERE id = ?`,
      )
      .bind(cleanLabel, existing.id)
      .run();
    return { ok: true };
  }

  await db
    .prepare(
      `INSERT INTO allowed_wifi_ips (id, label, ip_address, enabled, created_at)
       VALUES (?, ?, ?, 1, ?)`,
    )
    .bind(crypto.randomUUID(), cleanLabel, normalizedIp, nowSeconds())
    .run();

  return { ok: true };
}

export async function setAllowedWifiIpEnabled(
  db: D1Database,
  id: string,
  enabled: boolean,
) {
  await db
    .prepare(`UPDATE allowed_wifi_ips SET enabled = ? WHERE id = ?`)
    .bind(enabled ? 1 : 0, id)
    .run();
}

export async function deleteAllowedWifiIp(db: D1Database, id: string) {
  await db.prepare(`DELETE FROM allowed_wifi_ips WHERE id = ?`).bind(id).run();
}

export async function getWifiAccessDecision(
  db: D1Database,
  requesterIp: string,
) {
  const entries = await listAllowedWifiIps(db);
  return wifiAccessDecisionFromEntries(requesterIp, entries);
}
