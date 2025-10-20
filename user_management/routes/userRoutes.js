import express from "express";
import {loginUser, getAllUsers, inviteUser, acceptInvite, forgotPassword, resetPassword} from "../controllers/authController.js";
import { protect, authorizeRoles, verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/login", loginUser);

router.post("/", protect, authorizeRoles("super_admin", "site_admin"), getAllUsers);

router.post("/invite", verifyToken, inviteUser);

router.post("/accept-invite", acceptInvite);

router.post("/forgot-password", forgotPassword);

router.post("/reset-password", resetPassword);

export default router;