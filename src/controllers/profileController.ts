import type { Request, Response, NextFunction } from "express";
import { prisma } from "../server/db/prisma";

type AuthRequest = Request & {
  userId?: number;
};

export const THEMES = ["rosa", "lilas", "verde", "terracota", "azul", "amora", "dourado"] as const;
export const FONT_SCALES = ["normal", "grande", "maior"] as const;
export const AVATAR_ICONS = ["🌸", "🌷", "🌻", "🌙", "✨", "🦋", "🍓", "🌿", "☀️", "💜", "🐱", "🌈"] as const;
// Foto já reduzida no navegador (256x256); o limite evita registros gigantes no banco.
const MAX_AVATAR_LENGTH = 120_000;
const AVATAR_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

type ProfileUser = {
  id: number;
  username: string;
  displayName: string | null;
  cycleLength: number;
  theme: string;
  avatar?: string | null;
  avatarIcon?: string | null;
  motto?: string | null;
  fontScale?: string;
};

export function publicUser(user: ProfileUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? "",
    cycleLength: user.cycleLength,
    theme: user.theme,
    avatar: user.avatar ?? null,
    avatarIcon: user.avatarIcon ?? null,
    motto: user.motto ?? "",
    fontScale: user.fontScale ?? "normal",
  };
}

export async function updateProfile(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { displayName, cycleLength, theme, avatar, avatarIcon, motto, fontScale } = req.body ?? {};

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

    if (!(THEMES as readonly unknown[]).includes(theme)) {
      res.status(400).json({ error: "Tema inválido." });
      return;
    }

    // Campos opcionais: ausentes (undefined) mantêm o valor atual; null limpa.
    if (
      avatar !== undefined &&
      avatar !== null &&
      (typeof avatar !== "string" || avatar.length > MAX_AVATAR_LENGTH || !AVATAR_PATTERN.test(avatar))
    ) {
      res.status(400).json({ error: "Foto inválida. Use uma imagem JPG, PNG ou WebP." });
      return;
    }

    if (avatarIcon !== undefined && avatarIcon !== null && !(AVATAR_ICONS as readonly unknown[]).includes(avatarIcon)) {
      res.status(400).json({ error: "Ícone inválido." });
      return;
    }

    if (motto !== undefined && (typeof motto !== "string" || motto.trim().length > 140)) {
      res.status(400).json({ error: "A frase pode ter até 140 caracteres." });
      return;
    }

    if (fontScale !== undefined && !(FONT_SCALES as readonly unknown[]).includes(fontScale)) {
      res.status(400).json({ error: "Tamanho de texto inválido." });
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
        ...(avatar !== undefined ? { avatar } : {}),
        ...(avatarIcon !== undefined ? { avatarIcon } : {}),
        ...(motto !== undefined ? { motto: motto.trim() || null } : {}),
        ...(fontScale !== undefined ? { fontScale } : {}),
      },
    });

    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
}
