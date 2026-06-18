import { describe, it, expect } from "vitest";
import { createToken, verifyToken, OnboardingTokenPayload } from "./token";

const SECRET = "test-secret-key-12345-extremely-secure";

describe("Onboarding and Access Tokens", () => {
  it("should create and verify a valid new_student token", async () => {
    const exp = Date.now() + 1000 * 60; // 1 min in future
    const payload: OnboardingTokenPayload = {
      type: "new_student",
      classId: "class_cs101",
      exp,
    };

    const token = await createToken(payload, SECRET);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);

    const verified = await verifyToken(token, SECRET);
    expect(verified).toEqual(payload);
  });

  it("should create and verify a valid returning_student token", async () => {
    const exp = Date.now() + 1000 * 60;
    const payload: OnboardingTokenPayload = {
      type: "returning_student",
      studentId: "student_999",
      exp,
    };

    const token = await createToken(payload, SECRET);
    const verified = await verifyToken(token, SECRET);
    expect(verified).toEqual(payload);
  });

  it("should fail verification if token has expired", async () => {
    const exp = Date.now() - 1000; // 1 sec in past
    const payload: OnboardingTokenPayload = {
      type: "new_student",
      classId: "class_cs101",
      exp,
    };

    const token = await createToken(payload, SECRET);
    const verified = await verifyToken(token, SECRET);
    expect(verified).toBeNull();
  });

  it("should fail verification if secret is incorrect", async () => {
    const exp = Date.now() + 1000 * 60;
    const payload: OnboardingTokenPayload = {
      type: "new_student",
      classId: "class_cs101",
      exp,
    };

    const token = await createToken(payload, SECRET);
    const verified = await verifyToken(token, "wrong-secret-key");
    expect(verified).toBeNull();
  });

  it("should return null for malformed tokens", async () => {
    const verifiedMalformed = await verifyToken("not-a-valid-token-at-all", SECRET);
    expect(verifiedMalformed).toBeNull();
  });

  it("should return null for tampered base64url content", async () => {
    const exp = Date.now() + 1000 * 60;
    const payload: OnboardingTokenPayload = {
      type: "new_student",
      classId: "class_cs101",
      exp,
    };

    const token = await createToken(payload, SECRET);
    // Tamper with a character in the middle of the token
    const tampered = token.slice(0, 10) + (token[10] === "A" ? "B" : "A") + token.slice(11);
    const verified = await verifyToken(tampered, SECRET);
    expect(verified).toBeNull();
  });
});
