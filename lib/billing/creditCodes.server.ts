import { createHash, randomBytes } from "node:crypto";

const codePattern = /^[A-Z0-9-]{4,32}$/;
const automaticAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeCreditCode(value: string) {
  return value.trim().toUpperCase();
}

export function isValidCreditCode(value: string) {
  return codePattern.test(normalizeCreditCode(value));
}

export function hashCreditCode(value: string) {
  return createHash("sha256").update(normalizeCreditCode(value), "utf8").digest("hex");
}

export function createCreditCodePreview(value: string) {
  const normalized = normalizeCreditCode(value);
  if (normalized.length <= 6) return `${normalized.slice(0, 2)}${"•".repeat(Math.max(2, normalized.length - 2))}`;
  return `${normalized.slice(0, 4)}-${"•".repeat(4)}-${normalized.slice(-4)}`;
}

export function generateCreditCode() {
  const bytes = randomBytes(12);
  const characters = Array.from(bytes, (byte) => automaticAlphabet[byte % automaticAlphabet.length]).join("");
  return `${characters.slice(0, 4)}-${characters.slice(4, 8)}-${characters.slice(8, 12)}`;
}
