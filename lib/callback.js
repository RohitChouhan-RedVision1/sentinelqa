import crypto from "node:crypto";

export function verifyCallbackSignature(rawBody, signature, timestamp) {
  const secret = process.env.QA_CALLBACK_SECRET;
  if (!secret || !signature || !timestamp) return false;
  const age = Math.abs(Date.now() - Number(timestamp));
  if (!Number.isFinite(age) || age > 5 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const received = signature.replace(/^sha256=/, "");
  return received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function signCallback(rawBody, timestamp = Date.now()) { return `sha256=${crypto.createHmac("sha256", process.env.QA_CALLBACK_SECRET || "").update(`${timestamp}.${rawBody}`).digest("hex")}`; }
