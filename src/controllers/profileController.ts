
import { Request, Response, NextFunction } from "express";

export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.status(501).json({
      message: "Atualização de perfil ainda não implementada."
    });
  } catch (error) {
    next(error);
  }
}
