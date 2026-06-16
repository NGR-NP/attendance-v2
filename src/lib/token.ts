// src/lib/token.ts

export type OnboardingTokenPayload =
  | { type: "new_student"; classId: string; exp: number }
  | { type: "returning_student"; studentId: string; exp: number };

async function getEncryptionKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  // Hash the secret to ensure it's exactly 256 bits (32 bytes) for AES-256
  const keyMaterial = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(secret)
  );
  
  return await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function createToken(
  payload: OnboardingTokenPayload,
  secret: string
): Promise<string> {
  const key = await getEncryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedPayload = new TextEncoder().encode(JSON.stringify(payload));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedPayload
  );

  // Combine iv and encrypted content, then base64url encode
  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuffer), iv.length);

  return arrayBufferToBase64Url(combined);
}

export async function verifyToken(
  token: string,
  secret: string
): Promise<OnboardingTokenPayload | null> {
  try {
    const key = await getEncryptionKey(secret);
    const combined = base64UrlToArrayBuffer(token);
    
    // Extract IV (first 12 bytes) and ciphertext
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );

    const decodedPayload = new TextDecoder().decode(decryptedBuffer);
    const payload = JSON.parse(decodedPayload) as OnboardingTokenPayload;

    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }

    return payload;
  } catch (error) {
    return null; // Decryption failed or invalid format
  }
}

// Helpers
function arrayBufferToBase64Url(buffer: Uint8Array): string {
  let binary = "";
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToArrayBuffer(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}
