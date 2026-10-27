
import { Router } from "express";
import { updateProfile } from "../controllers/profileController";

const router = Router();

router.patch("/", updateProfile);

export default router;
