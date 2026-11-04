
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../server/db/prisma";

type AuthRequest = Request & {
  userId?: number;
};

function publicUser(user: {
  id: number;
  username: string;
  displayName: string | null;
  cycleLength: number;
  theme: string;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? "",
    cycleLength: user.cycleLength,
    theme: user.theme,
  };
}

export async function updateProfile(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const displayName = req.body?.displayName;
    const cycleLength = req.body?.cycleLength;
    const theme = req.body?.theme;

    if (
      typeof displayName !== "string" ||
      displayName.trim().length < 1 ||
      displayName.trim().length > 100
    ) {
      res.status(400).json({ error: "Nome inválido." });
      return;
    }

    if (
      !Number.isInteger(cycleLength) ||
      cycleLength < 20 ||
      cycleLength > 45
    ) {
      res.status(400).json({
        error: "A duração do ciclo deve ficar entre 20 e 45 dias.",
      });
      return;
    }

    if (
      !(["rosa", "lilas", "verde", "terracota"] as unknown[]).includes(theme)
    ) {
      res.status(400).json({ error: "Tema inválido." });
      return;
    }

    if (!req.userId) {
      res.status(401).json({ error: "Faça login para continuar." });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        displayName: displayName.trim(),
        cycleLength,
        theme,
      },
    });

    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
}
