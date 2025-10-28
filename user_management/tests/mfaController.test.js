import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import QRCode from "qrcode";

jest.mock("nodemailer", () => {
  const sendMail = jest.fn();
  return {
    createTransport: jest.fn(() => ({ sendMail })),
    __mockSendMail: sendMail,
  };
});

import nodemailer from "nodemailer";
import { User } from "../models/userModel.js";
import { chooseMfa, verifyMfa } from "../controllers/mfaController.js"
import { generateToken } from "../utils/generateToken.js";


jest.mock("jsonwebtoken");
jest.mock("otplib");
jest.mock("qrcode");
jest.mock("nodemailer");
jest.mock("../models/userModel.js");
jest.mock("../utils/generateToken.js");

const mockSendMail = nodemailer.__mockSendMail;

describe("AuthController - MFA", () => {
  let req, res, user;

  beforeEach(() => {
    req = {
      headers: { authorization: "Bearer fakeTempToken" },
      body: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    user = {
      _id: "user123",
      email: "test@example.com",
      mfa: {},
      save: jest.fn(),
      markModified: jest.fn(),
    };

    jest.clearAllMocks();
  });

  // ---------- CHOOSE MFA ----------

  describe("chooseMfa", () => {
    it("should return 401 if no token is provided", async () => {
      req.headers.authorization = null;

      await chooseMfa(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Temp token missing" });
    });

    it("should return 401 if token is invalid", async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("Invalid token");
      });

      await chooseMfa(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid or expired temp token" });
    });

    it("should return 404 if user not found", async () => {
      jwt.verify.mockReturnValue({ id: "user123" });
      User.findById.mockResolvedValue(null);

      await chooseMfa(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "User not found" });
    });

    it("should handle TOTP method successfully", async () => {
      jwt.verify.mockReturnValue({ id: "user123" });
      User.findById.mockResolvedValue(user);
      req.body.method = "totp";

      authenticator.generateSecret.mockReturnValue("SECRET123");
      authenticator.keyuri.mockReturnValue("otpauth://...");
      QRCode.toDataURL.mockResolvedValue("QR_CODE_URL");

      await chooseMfa(req, res);

      expect(user.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: "TOTP selected. Scan this QR code in Google Authenticator.",
        otpauthUrl: "otpauth://...",
        qrCode: "QR_CODE_URL",
      });
    });

    it("should handle OTP method successfully", async () => {
      jwt.verify.mockReturnValue({ id: "user123" });
      User.findById.mockResolvedValue(user);
      req.body.method = "otp";

      await chooseMfa(req, res);

      expect(user.save).toHaveBeenCalled();
      expect(mockSendMail).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: "OTP generated and sent to your email.",
      });
    });
  });

  // ---------- VERIFY MFA ----------

  describe("verifyMfa", () => {
    it("should return 401 if token missing", async () => {
      req.headers.authorization = null;

      await verifyMfa(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Temp token missing" });
    });

    it("should return 401 if invalid token", async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("Invalid token");
      });

      await verifyMfa(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid or expired temp token" });
    });

    it("should return 404 if user not found", async () => {
      jwt.verify.mockReturnValue({ id: "user123" });
      User.findById.mockResolvedValue(null);

      await verifyMfa(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "User not found" });
    });

    it("should verify TOTP successfully", async () => {
      jwt.verify.mockReturnValue({ id: "user123" });
      user.mfa.method = "totp";
      user.mfa.secret = "SECRET123";
      User.findById.mockResolvedValue(user);
      authenticator.verify.mockReturnValue(true);
      generateToken.mockReturnValue("permToken");
      req.body.code = "123456";

      await verifyMfa(req, res);

      expect(generateToken).toHaveBeenCalledWith(user);
      expect(res.json).toHaveBeenCalledWith({
        message: "MFA verified successfully",
        token: "permToken",
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    });

    it("should return error for invalid OTP", async () => {
      jwt.verify.mockReturnValue({ id: "user123" });
      user.mfa.method = "otp";
      user.mfa.otp = "111111";
      user.mfa.otpExpiresAt = new Date(Date.now() + 60000);
      User.findById.mockResolvedValue(user);
      req.body.code = "999999";

      await verifyMfa(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid OTP code" });
    });
  });
});
