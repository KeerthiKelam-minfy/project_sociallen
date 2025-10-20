import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: [
        "super_admin",
        "site_admin",
        "operator",
        "client_admin",
        "client_user",
      ],
      default: "client_user",
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: false,
    },
    mfa: {
      method: {
        type: String,
        enum: ["otp", "totp", "none"],
        default: "none",
      },
      secret: { type: String }, // for TOTP (Google Auth)
      otp: { type: String }, // for email OTP
      otpExpiresAt: { type: Date },
    },
    status: {
      type: String,
      enum: ["invited", "active", "disabled"],
      default: "active",
    },
    inviteToken: { type: String },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
  },
  { timestamps: true }
);

// password hashing
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export const User = mongoose.model("User", userSchema);
