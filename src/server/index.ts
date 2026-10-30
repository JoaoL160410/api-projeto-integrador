import "dotenv/config";
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "./db/prisma";
import profileRoutes from "../routes/profileRoutes";
import { requireAuth, type AuthRequest } from "./middleware/requireAuth";

const scrypt = promisify(scryptCallback);
const app = express();
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET deve conter ao menos 32 caracteres aleatórios.");
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));

const cookieName = "florescer_session";
const sessionDurationSeconds = 60 * 60 * 24 * 7;

type SessionPayload = { userId: number; expiresAt: number };


type RecordInput = {
  date: string;
  flow?: string | null;
  mood?: string | null;
  symptoms?: string[];
  note?: string | null;
  menstruation?: boolean;
  quick?: string[];
};

function signSession(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret!).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifySession(token?: string): SessionPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", sessionSecret!).update(encoded).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "base64url"); } catch { return null; }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!Number.isSafeInteger(payload.userId) || payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch { return null; }
}

function setSessionCookie(res: Response, userId: number): void {
  const value = signSession({ userId, expiresAt: Date.now() + sessionDurationSeconds * 1000 });
  res.cookie(cookieName, value, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: sessionDurationSeconds * 1000,
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(cookieName, { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" });
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    if (pair.slice(0, index).trim() === name) {
      try { return decodeURIComponent(pair.slice(index + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}



function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase().replace(/\s+/g, "");
  return /^[a-z0-9_.-]{3,50}$/.test(username) ? username : null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) return undefined;
  return value;
}

function stringArray(value: unknown, maxItems = 30): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string" || item.length > 80)) return null;
  return value;
}

function parseRecord(value: unknown): RecordInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!validDate(input.date)) return null;
  const flow = optionalText(input.flow, 30);
  const mood = optionalText(input.mood, 30);
  const note = optionalText(input.note, 5000);
  const symptoms = stringArray(input.symptoms);
  const quick = stringArray(input.quick);
  if (flow === undefined || mood === undefined || note === undefined || !symptoms || !quick) return null;
  if (input.menstruation !== undefined && typeof input.menstruation !== "boolean") return null;
  return { date: input.date, flow, mood, note, symptoms, quick, menstruation: input.menstruation === true };
}

function recordData(input: RecordInput) {
  return {
    date: new Date(`${input.date}T00:00:00.000Z`),
    flow: input.flow ?? null,
    mood: input.mood ?? null,
    note: input.note ?? null,
    symptoms: input.symptoms as Prisma.InputJsonValue,
    quick: input.quick as Prisma.InputJsonValue,
    menstruation: input.menstruation ?? false,
  };
}

function publicRecord(record: { date: Date; flow: string | null; mood: string | null; symptoms: Prisma.JsonValue | null; note: string | null; menstruation: boolean; quick: Prisma.JsonValue | null }) {
  const jsonArray = (value: Prisma.JsonValue | null): string[] => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  return {
    date: record.date.toISOString().slice(0, 10),
    flow: record.flow,
    mood: record.mood,
    symptoms: jsonArray(record.symptoms),
    note: record.note,
    menstruation: record.menstruation,
    quick: jsonArray(record.quick),
  };
}

function publicUser(user: { id: number; username: string; displayName: string | null; cycleLength: number; theme: string }) {
  return { id: user.id, username: user.username, displayName: user.displayName ?? "", cycleLength: user.cycleLength, theme: user.theme };
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}

async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, expectedHex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." } });

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "ok" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});

app.post("/api/auth/register", authLimiter, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = req.body?.password;
    const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
    if (!username) { res.status(400).json({ error: "Usuário: 3 a 50 caracteres (letras, números, ponto, hífen ou sublinhado)." }); return; }
    if (typeof password !== "string" || password.length < 8 || password.length > 200) { res.status(400).json({ error: "A senha deve ter entre 8 e 200 caracteres." }); return; }
    if (!displayName || displayName.length > 100) { res.status(400).json({ error: "Informe um nome de exibição de até 100 caracteres." }); return; }
    const user = await prisma.user.create({ data: { username, passwordHash: await hashPassword(password), displayName } });
    setSessionCookie(res, user.id);
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { res.status(409).json({ error: "Esse nome de usuário já está em uso." }); return; }
    next(error);
  }
});

app.post("/api/auth/login", authLimiter, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = req.body?.password;
    if (!username || typeof password !== "string") { res.status(400).json({ error: "Informe usuário e senha." }); return; }
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await checkPassword(password, user.passwordHash))) { res.status(401).json({ error: "Usuário ou senha incorretos." }); return; }
    setSessionCookie(res, user.id);
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

app.post("/api/auth/logout", (_req, res) => { clearSessionCookie(res); res.status(204).end(); });

app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) { clearSessionCookie(res); res.status(401).json({ error: "Sessão inválida." }); return; }
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

app.patch("/api/profile", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const displayName = req.body?.displayName;
    const cycleLength = req.body?.cycleLength;
    const theme = req.body?.theme;
    if (typeof displayName !== "string" || displayName.trim().length < 1 || displayName.trim().length > 100) { res.status(400).json({ error: "Nome inválido." }); return; }
    if (!Number.isInteger(cycleLength) || cycleLength < 20 || cycleLength > 45) { res.status(400).json({ error: "A duração do ciclo deve ficar entre 20 e 45 dias." }); return; }
    if (!(["rosa", "lilas", "verde", "terracota"] as unknown[]).includes(theme)) { res.status(400).json({ error: "Tema inválido." }); return; }
    const user = await prisma.user.update({ where: { id: req.userId! }, data: { displayName: displayName.trim(), cycleLength, theme } });
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

app.get("/api/records", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const records = await prisma.cycleRecord.findMany({ where: { userId: req.userId! }, orderBy: { date: "asc" } });
    res.json({ records: records.map(publicRecord) });
  } catch (error) { next(error); }
});

app.put("/api/records/:date", requireAuth, async (req: AuthRequest, res, next) => {
  if (req.params.date === "import") { next(); return; }
  try {
    const input = parseRecord({ ...req.body, date: req.params.date });
    if (!input) { res.status(400).json({ error: "Dados do registro inválidos." }); return; }
    const data = recordData(input);
    const record = await prisma.cycleRecord.upsert({
      where: { userId_date: { userId: req.userId!, date: data.date } },
      create: { userId: req.userId!, ...data },
      update: data,
    });
    res.json({ record: publicRecord(record) });
  } catch (error) { next(error); }
});

app.delete("/api/records/:date", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!validDate(req.params.date)) { res.status(400).json({ error: "Data inválida." }); return; }
    await prisma.cycleRecord.deleteMany({ where: { userId: req.userId!, date: new Date(`${req.params.date}T00:00:00.000Z`) } });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.put("/api/records/import", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const source = req.body?.records;
    if (!Array.isArray(source) || source.length > 1000) { res.status(400).json({ error: "A cópia deve conter até 1.000 registros." }); return; }
    const parsed = source.map(parseRecord);
    if (parsed.some((record) => record === null)) { res.status(400).json({ error: "A cópia contém registros inválidos." }); return; }
    const records = parsed as RecordInput[];
    const dates = records.map((record) => record.date);
    if (new Set(dates).size !== dates.length) { res.status(400).json({ error: "A cópia contém datas repetidas." }); return; }
    await prisma.$transaction(async (tx) => {
      await tx.cycleRecord.deleteMany({ where: { userId: req.userId! } });
      for (const input of records) {
        await tx.cycleRecord.create({ data: { userId: req.userId!, ...recordData(input) } });
      }
    });
    res.json({ imported: records.length });
  } catch (error) { next(error); }
});

if (isProduction) {
  const distPath = path.resolve(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api/")) { next(); return; }
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Erro interno da API:", error);
  res.status(500).json({ error: "Ocorreu um erro interno. Tente novamente." });
});

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, "0.0.0.0", () => console.log(`Florescer API disponível na porta ${port}`));

async function shutdown(): Promise<void> {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
