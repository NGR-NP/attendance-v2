import QRCode from "qrcode";

/**
 * Generate a QR code as a base64 data URL (PNG).
 * Works server-side in Cloudflare Workers via the `qrcode` package.
 */
export async function qrDataUrl(text: string, size = 300): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#ffffff" },
  });
}
