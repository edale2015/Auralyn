import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export function validateTwilioSignature(req: Request, res: Response, next: NextFunction) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn("TWILIO_AUTH_TOKEN not set — skipping signature validation");
    return next();
  }

  const signature = req.headers["x-twilio-signature"] as string | undefined;
  if (!signature) {
    console.warn("Missing X-Twilio-Signature header on webhook request");
    return res.status(403).send("Forbidden");
  }

  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["host"] || "localhost";
  const url = `${protocol}://${host}${req.originalUrl}`;

  const params = req.body || {};
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.reduce((acc, key) => acc + key + params[key], "");

  const data = url + paramString;
  const expected = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    console.warn("Invalid Twilio signature — rejecting webhook request");
    return res.status(403).send("Forbidden");
  }

  next();
}
