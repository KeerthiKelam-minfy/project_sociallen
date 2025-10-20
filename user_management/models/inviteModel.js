import mongoose from "mongoose";

const inviteSchema = new mongoose.Schema({
  email: { type: String, required: true },
  role: { type: String, required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization" },
  token: { type: String, required: true },
  accepted: { type: Boolean, default: false },
  expiresAt: { type: Date, default: () => Date.now() + 1000 * 60 * 60 * 24 } // 24h
});

export const Invite = mongoose.model("Invite", inviteSchema);
