
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const cookieName = "florescer_session";

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error(
    "SESSION_SECRET deve conter ao menos 32 caracteres aleatórios."
  );
}

type SessionPayload = {
  userId: number;
  expiresAt: number;
};

export type AuthRequest = Request & {
  userId?: number;
};

function readCookie(
  req: Request,
  name: string
): string | undefined {
  const header = req.headers.cookie;

  if (!header) return undefined;

  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");

    if (index < 0) continue;

    if (pair.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(pair.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

function verifySession(
  token?: string
): SessionPayload | null {
  if (!token) return null;

  const [encoded, signature] = token.split(".");

  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", sessionSecret!)
    .update(encoded)
    .digest();

  let received: Buffer;

  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }

  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as SessionPayload;

    if (
      !Number.isSafeInteger(payload.userId) ||
      typeof payload.expiresAt !== "number" ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const session = verifySession(
    readCookie(req, cookieName)
  );

  if (!session) {
    res.status(401).json({
      error: "Faça login para continuar.",
    });
    return;
  }

  req.userId = session.userId;
  next();
}
