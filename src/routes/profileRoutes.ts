
import { Router } from "express";
import { updateProfile } from "../controllers/profileController";
import { requireAuth } from "../server/middleware/requireAuth";

const router = Router();

router.patch("/", requireAuth, updateProfile);

export default router;
