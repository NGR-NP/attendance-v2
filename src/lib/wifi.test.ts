import { describe, expect, it } from "vitest";
import {
  normalizeIpAddress,
  wifiAccessDecisionFromEntries,
} from "./wifi";

describe("Wi-Fi IP allowlist", () => {
  it("normalizes IPv4 addresses", () => {
    expect(normalizeIpAddress(" 010.000.001.255 ")).toBe("10.0.1.255");
  });

  it("normalizes bracketed IPv6 addresses", () => {
    expect(normalizeIpAddress("[2407:1400:aa7e:6e98:0000:0000:0000:0001]")).toBe(
      "2407:1400:aa7e:6e98:0000:0000:0000:0001",
    );
  });

  it("rejects invalid IP addresses", () => {
    expect(normalizeIpAddress("999.1.1.1")).toBeNull();
    expect(normalizeIpAddress("unknown")).toBeNull();
    expect(normalizeIpAddress("12.34_drop_table_users_")).toBeNull();
  });

  it("reports unconfigured when no enabled allowlist entries exist", () => {
    const decision = wifiAccessDecisionFromEntries("203.0.113.10", [
      { ipAddress: "203.0.113.10", enabled: false },
    ]);

    expect(decision).toEqual({
      configured: false,
      allowed: true,
      normalizedIp: "203.0.113.10",
    });
  });

  it("allows requester IPs that match an enabled entry", () => {
    const decision = wifiAccessDecisionFromEntries("203.0.113.10", [
      { ipAddress: "198.51.100.20", enabled: true },
      { ipAddress: "203.0.113.10", enabled: true },
    ]);

    expect(decision.configured).toBe(true);
    expect(decision.allowed).toBe(true);
  });

  it("blocks requester IPs outside the enabled allowlist", () => {
    const decision = wifiAccessDecisionFromEntries("203.0.113.10", [
      { ipAddress: "198.51.100.20", enabled: true },
    ]);

    expect(decision.configured).toBe(true);
    expect(decision.allowed).toBe(false);
  });
});
