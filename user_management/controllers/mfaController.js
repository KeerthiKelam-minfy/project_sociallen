import jwt from "jsonwebtoken";
import { User } from "../models/userModel.js";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { generateToken } from "../utils/generateToken.js";

dotenv.config();

// Email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});


// Choose MFA Method
export const chooseMfa = async (req, res) => {
  try {
    const tempToken = req.headers.authorization?.split(" ")[1];
    if (!tempToken)
      return res.status(401).json({ error: "Temp token missing" });

    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Invalid or expired temp token" });
    }

    const user = await User.findById(payload.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const { method } = req.body;
    if (!["otp", "totp"].includes(method))
      return res.status(400).json({ error: "Invalid MFA method" });

    user.mfa.method = method;

    if (method === "totp") {
      // Generate secret for Google Authenticator
      const secret = authenticator.generateSecret();
      user.mfa.secret = secret;
      await user.save();

      const otpauth = authenticator.keyuri(user.email, "AccessFlow", secret);

      // Generate QR code Data URL
      const qrCodeDataURL = await QRCode.toDataURL(otpauth);

      return res.json({
        message: "TOTP selected. Scan this QR code in Google Authenticator.",
        otpauthUrl: otpauth,
        qrCode: qrCodeDataURL,
      });

    } else if (method === "otp") {
      // Generate random OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      user.mfa.otp = otpCode;
      user.mfa.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await user.save();

      // Send OTP via email
      await transporter.sendMail({
        from: `"AccessFlow" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: "Your OTP Code",
        text: `Your OTP Code is: ${otpCode}. It expires in 5 minutes.`,
      });

      return res.json({
        message: "OTP generated and sent to your email.",
      });
    }
  } catch (err) {
    console.error("❌ MFA setup error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// Verify MFA

export const verifyMfa = async (req, res) => {
  try {
    const mfaTempToken = req.headers.authorization?.split(" ")[1];
    if (!mfaTempToken)
      return res.status(401).json({ error: "Temp token missing" });

    let payload;
    try {
      payload = jwt.verify(mfaTempToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Invalid or expired temp token" });
    }

    const user = await User.findById(payload.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "MFA code is required" });

    // ----- Handle TOTP -----
    if (user.mfa.method === "totp") {
      const isValid = authenticator.verify({
        token: code,
        secret: user.mfa.secret,
        window: 1,
      });

      if (!isValid)
        return res.status(401).json({ error: "Invalid TOTP code" });

    // ----- Handle OTP -----
    } else if (user.mfa.method === "otp") {
      if (user.mfa.otp !== code)
        return res.status(401).json({ error: "Invalid OTP code" });

      if (!user.mfa.otpExpiresAt || user.mfa.otpExpiresAt < new Date())
        return res.status(401).json({ error: "OTP code expired" });

      // Clear OTP
      user.mfa.otp = null;
      user.mfa.otpExpiresAt = null;
      user.markModified("mfa");
      await user.save();
    } else {
      return res.status(400).json({ error: "MFA method not configured" });
    }

    // Success: issue permanent JWT
    const token = generateToken(user);

    res.json({
      message: "MFA verified successfully",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("❌ MFA verification error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
