import { User } from "../models/userModel.js";
import { generateToken } from "../utils/generateToken.js";
import { sendEmail } from "../../notifications/services/sendEmail.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Invite } from "../models/inviteModel.js";
import { Organization } from "../models/organizationModel.js";

// // register
// export const registerUser = async (req, res) => {
//   try {
//     const { name, email, password, role } = req.body;
//     const userExists = await User.findOne({ email });
//     if (userExists) return res.status(400).json({ message: "User already exists" });

//     const user = await User.create({ name, email, password, role });

//     // Generate a short-lived temp token for MFA setup
//     const tempToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
//       expiresIn: "10m",
//     });

//     res.status(201).json({
//       _id: user._id,
//       name: user.name,
//       email: user.email,
//       role: user.role,
//       tempToken,
//       message: "Please setup MFA before logging in."
//     });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };

// INVITE USER
export const inviteUser = async (req, res) => {
  try {
    const { email, role, organizationName } = req.body;
    const inviter = req.user;

    // Step 1: Validate invite permissions
    const rolePermissions = {
      super_admin: ["site_admin", "operator", "client_admin"],
      site_admin: ["client_admin", "operator"],
      operator: ["client_admin"],
      client_admin: ["client_user"],
    };

    if (!rolePermissions[inviter.role]?.includes(role)) {
      return res
        .status(403)
        .json({ message: "Not authorized to invite this role" });
    }

    //     // Check if invite already exists for that email
    // const existingInvite = await Invite.findOne({ email });
    // if (existingInvite) {
    //   return res.status(400).json({ message: "Invite already sent to this email" });
    // }

    // Step 2: Check if email already exists as user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Step 3: Organization logic
    let organization = null;

    // If creating client_admin, ensure org exists or create one
    if (role === "client_admin") {
      let existingOrg = await Organization.findOne({ name: organizationName });

      if (existingOrg && existingOrg.clientAdmin) {
        return res
          .status(400)
          .json({ message: "This organization already has a client admin" });
      }

      if (!existingOrg) {
        organization = await Organization.create({ name: organizationName });
      } else {
        organization = existingOrg;
      }
    }

    // If creating client_user, ensure inviter has org
    if (role === "client_user") {
      organization = await Organization.findOne({ clientAdmin: inviter._id });
      if (!organization) {
        return res.status(400).json({ message: "Your organization not found" });
      }
    }

    // Step 4: Create invite token
    const token = jwt.sign(
      { email, role, organizationName },
      process.env.JWT_SECRET,
      {
        expiresIn: "3d",
      }
    );

    const invite = await Invite.create({
      email,
      role,
      invitedBy: inviter._id,
      token,
      organization: organization?._id,
    });

    // Step 5: Send invite email
    const inviteLink = `${process.env.FRONTEND_URL}/accept-invite?token=${token}`;
    await sendEmail(
      email,
      "AccessFlow Invitation",
      `
  You've been invited to join AccessFlow as a **${role}**.
  ${organizationName ? `Organization: ${organizationName}` : ""}
  
  Click below to accept your invite:
  ${inviteLink}
  `
    );

    res.status(201).json({
      message: "Invitation sent successfully",
      inviteLink,
      expiresAt: invite.expiresAt,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ACCEPT INVITE
export const acceptInvite = async (req, res) => {
  try {
    const { token, name, password } = req.body;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { email, role, organizationName } = decoded;
    // console.log(decoded);

    // Find the invite
    const invite = await Invite.findOne({ email, token, accepted: false });
    if (!invite) {
      return res.status(400).json({ message: "Invalid or expired invite." });
    }

    // Create the user
    // const hashedPassword = await bcrypt.hash(password, 10);

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User with this email already exists." });
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
    });

    if (organizationName) {
      let org = await Organization.findOne({ name: organizationName });

      // Create organization if it doesn't exist (just in case)
      if (!org) {
        org = await Organization.create({ name: organizationName });
      }

      if (role === "client_admin") {
        org.clientAdmin = user._id;
      } else if (role === "client_user") {
        org.users.push(user._id);
      }

      user.organization = org._id;

      await user.save();

      await org.save();
    }

    invite.accepted = true;
    await invite.save();

    // Generate tempToken for MFA  (expires in 10 min)
    const tempToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "10m",
    });

    // Send welcome email
    await sendEmail(
      email,
      "Welcome to AccessFlow",
      `Hi ${name}, your account has been successfully created.`
    );

    res.json({
      message:
        "Invite accepted successfully. Please choose an MFA method before logging in.",
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        mfa: user.mfa,
      },
      tempToken,
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: "Invalid or expired token" });
  }
};

// login
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required." });
    }

    //  console.log("Login attempt for email:", email);

    const user = await User.findOne({ email });

    // console.log("Found user:", user);

    if (!user) {
      console.log("User not found in DB");
      return res.status(401).json({ message: "Invalid credentials" });
    }

    //     console.log("Found user:", {
    //   email: user.email,
    //   hashedPassword: user.password,
    //   role: user.role,
    //   status: user.status,
    // });

    // Check password
    const isMatch = await user.matchPassword(password);
    // console.log("Password match result:", isMatch);

    if (!isMatch) {
      console.log("Incorrect password entered");
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // If MFA not yet chosen, return tempToken for MFA setup
    if (user.mfa.method === "none") {
      const tempToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "10m",
      });

      return res.status(200).json({
        message:
          "MFA setup required. Please choose a method before logging in.",
        tempToken,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    }

    // Optional: Check user status
    if (user.status !== "active") {
      return res
        .status(403)
        .json({ message: `User is ${user.status}, cannot login.` });
    }

    if (user.mfa.method === "otp") {
      // Generate OTP automatically on login
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      user.mfa.otp = otpCode;
      user.mfa.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
      user.markModified("mfa");
      await user.save();

      // Send OTP via email
      await sendEmail(
        user.email,
        "AccessFlow Login OTP",
        `Your OTP code is ${otpCode}. It expires in 5 minutes.`
      );

      // Return temp token for OTP verification
      const mfaTempToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "10m",
      });

      return res.status(200).json({
        message: `OTP sent to your registered email. Please verify to continue. Your OTP code is ${otpCode}. It expires in 5 minutes.`,
        mfaTempToken,
      });
    }

    if (user.mfa.method === "totp") {
      // Return temp token for TOTP verification
      const mfaTempToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "10m",
      });

      return res.status(200).json({
        message: "Please verify your TOTP code from Google Authenticator.",
        mfaTempToken,
      });
    }

    // Success — generate token
    const token = generateToken(user);

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// get all users (admin only)
export const getAllUsers = async (req, res) => {
  const users = await User.find().select("-password");
  res.json(users);
};

// User requests password reset
export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: "No user found" });

  // Create token
  const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "15m",
  });

  // Save token in DB
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = Date.now() + 15 * 60 * 1000;
  await user.save();

  // Send email with link
  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  await sendEmail(
    user.email,
    "Reset Your Password",
    `Click here to reset: ${resetLink}`
  );

  res.json({ message: "Password reset link sent to your email." });
};

// User sets new password
export const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  // Find user with this token and make sure token not expired
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() },
  });
  if (!user)
    return res.status(400).json({ message: "Invalid or expired token" });

  // Update password
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  res.json({ message: "Password reset successful. You can now log in." });
};
