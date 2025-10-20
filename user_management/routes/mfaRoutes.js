import express from "express";
import { chooseMfa, verifyMfa } from "../controllers/mfaController.js";

const router = express.Router();

router.post("/choose-mfa", chooseMfa);
router.post("/verify-mfa", verifyMfa);

export default router;
