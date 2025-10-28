import { inviteUser, acceptInvite, loginUser, forgotPassword, resetPassword } from "../controllers/authController.js";
import { User } from "../models/userModel.js";
import { Invite } from "../models/inviteModel.js";
import { Organization } from "../models/organizationModel.js";
import { sendEmail } from "../../notifications/services/sendEmail.js";
import { generateToken } from "../utils/generateToken.js";
import jwt from "jsonwebtoken";

// Mock all external dependencies
jest.mock("../models/userModel.js");
jest.mock("../models/inviteModel.js");
jest.mock("../models/organizationModel.js");
jest.mock("../../notifications/services/sendEmail.js");
jest.mock("../utils/generateToken.js");
jest.mock("jsonwebtoken");

describe("inviteUser Controller", () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {
        email: "test@example.com",
        role: "client_admin",
        organizationName: "TestOrg",
      },
      user: { _id: "123", role: "super_admin" },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
  });

  it("should return 400 if user already exists", async () => {
    User.findOne.mockResolvedValueOnce({ email: "test@example.com" });

    await inviteUser(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: "test@example.com" });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "User already exists" });
  });

  it("should return 403 if inviter not authorized to invite this role", async () => {
    req.user.role = "client_user";

    await inviteUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Not authorized to invite this role",
    });
  });

  it("should create invite and send email successfully", async () => {
    User.findOne.mockResolvedValueOnce(null);
    Organization.findOne.mockResolvedValueOnce(null);
    Organization.create.mockResolvedValueOnce({ _id: "org123" });
    Invite.create.mockResolvedValueOnce({
      _id: "invite123",
      expiresAt: new Date(),
    });
    jwt.sign.mockReturnValue("mockToken");
    sendEmail.mockResolvedValueOnce();

    await inviteUser(req, res);

    expect(Invite.create).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Invitation sent successfully",
        inviteLink: expect.any(String),
      })
    );
  });
});


describe("acceptInvite Controller", () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {
        token: "mockToken",
        name: "John Doe",
        password: "password123",
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
  });

  it("should return 400 if invite not found", async () => {
    jwt.verify.mockReturnValue({
      email: "test@example.com",
      role: "client_admin",
      organizationName: "TestOrg",
    });
    Invite.findOne.mockResolvedValueOnce(null);

    await acceptInvite(req, res);

    expect(Invite.findOne).toHaveBeenCalledWith({
      email: "test@example.com",
      token: "mockToken",
      accepted: false,
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid or expired invite.",
    });
  });

  it("should return 400 if user with email already exists", async () => {
    jwt.verify.mockReturnValue({
      email: "test@example.com",
      role: "client_admin",
      organizationName: "TestOrg",
    });
    Invite.findOne.mockResolvedValueOnce({ email: "test@example.com" });
    User.findOne.mockResolvedValueOnce({ email: "test@example.com" });

    await acceptInvite(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "User with this email already exists.",
    });
  });

  it("should create user, org, and accept invite successfully", async () => {
    jwt.verify.mockReturnValue({
      email: "test@example.com",
      role: "client_admin",
      organizationName: "TestOrg",
    });

    Invite.findOne.mockResolvedValueOnce({ email: "test@example.com", save: jest.fn() });
    User.findOne.mockResolvedValueOnce(null);
    User.create.mockResolvedValueOnce({
      _id: "user123",
      name: "John Doe",
      email: "test@example.com",
      role: "client_admin",
      save: jest.fn(),
    });

    Organization.findOne.mockResolvedValueOnce(null);
    Organization.create.mockResolvedValueOnce({
      _id: "org123",
      save: jest.fn(),
    });

    jwt.sign.mockReturnValue("tempToken123");
    sendEmail.mockResolvedValueOnce();

    await acceptInvite(req, res);

    expect(User.create).toHaveBeenCalled();
    expect(Organization.create).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(
      "test@example.com",
      "Welcome to AccessFlow",
      expect.stringContaining("your account has been successfully created")
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Invite accepted successfully"),
        tempToken: "tempToken123",
      })
    );
  });

  it("should handle invalid token in catch block", async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("Invalid token");
    });

    await acceptInvite(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid or expired token",
    });
  });
});


describe("loginUser Controller", () => {
  let req, res, mockUser;

  beforeEach(() => {
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();

    // Base user object
    mockUser = {
      _id: "user123",
      name: "John Doe",
      email: "test@example.com",
      role: "client_admin",
      password: "hashedpassword",
      status: "active",
      mfa: { method: "completed" }, // default = MFA completed
      matchPassword: jest.fn(),
      save: jest.fn(),
      markModified: jest.fn(),
    };
  });

  it("should return 400 if email or password is missing", async () => {
    req.body = {};
    await loginUser(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Email and password are required.",
    });
  });

  it("should return 401 if user not found", async () => {
    req.body = { email: "test@example.com", password: "password123" };
    User.findOne.mockResolvedValueOnce(null);

    await loginUser(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid credentials" });
  });

  it("should return 401 if password does not match", async () => {
    req.body = { email: "test@example.com", password: "wrongpass" };
    User.findOne.mockResolvedValueOnce(mockUser);
    mockUser.matchPassword.mockResolvedValueOnce(false);

    await loginUser(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid credentials" });
  });

  it("should return tempToken if MFA method is 'none'", async () => {
    req.body = { email: "test@example.com", password: "password123" };
    mockUser.mfa.method = "none";
    User.findOne.mockResolvedValueOnce(mockUser);
    mockUser.matchPassword.mockResolvedValueOnce(true);

    jwt.sign.mockReturnValueOnce("mockTempToken");

    await loginUser(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "MFA setup required. Please choose a method before logging in.",
      tempToken: "mockTempToken",
      user: {
        _id: mockUser._id,
        name: mockUser.name,
        email: mockUser.email,
        role: mockUser.role,
      },
    });
  });

  it("should return 403 if user status is not active", async () => {
    req.body = { email: "test@example.com", password: "password123" };
    mockUser.status = "inactive";
    User.findOne.mockResolvedValueOnce(mockUser);
    mockUser.matchPassword.mockResolvedValueOnce(true);

    await loginUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: `User is inactive, cannot login.`,
    });
  });

  it("should send OTP and return mfaTempToken if MFA method is 'otp'", async () => {
    req.body = { email: "test@example.com", password: "password123" };
    mockUser.mfa.method = "otp";
    User.findOne.mockResolvedValueOnce(mockUser);
    mockUser.matchPassword.mockResolvedValueOnce(true);
    jwt.sign.mockReturnValueOnce("mockMfaTempToken");
    sendEmail.mockResolvedValueOnce();

    await loginUser(req, res);

    expect(mockUser.save).toHaveBeenCalled();
    expect(mockUser.markModified).toHaveBeenCalledWith("mfa");
    expect(sendEmail).toHaveBeenCalledWith(
      mockUser.email,
      "AccessFlow Login OTP",
      expect.stringContaining("Your OTP code is")
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: expect.stringContaining("OTP sent to your registered email"),
      mfaTempToken: "mockMfaTempToken",
    });
  });

  it("should return mfaTempToken if MFA method is 'totp'", async () => {
    req.body = { email: "test@example.com", password: "password123" };
    mockUser.mfa.method = "totp";
    User.findOne.mockResolvedValueOnce(mockUser);
    mockUser.matchPassword.mockResolvedValueOnce(true);
    jwt.sign.mockReturnValueOnce("mockTotpTempToken");

    await loginUser(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Please verify your TOTP code from Google Authenticator.",
      mfaTempToken: "mockTotpTempToken",
    });
  });

  it("should return token if login is successful and MFA is not required", async () => {
    req.body = { email: "test@example.com", password: "password123" };
    mockUser.mfa.method = "completed"; // simulate fully set MFA
    User.findOne.mockResolvedValueOnce(mockUser);
    mockUser.matchPassword.mockResolvedValueOnce(true);
    generateToken.mockReturnValue("mockToken");

    await loginUser(req, res);

    expect(generateToken).toHaveBeenCalledWith(mockUser);
    expect(res.json).toHaveBeenCalledWith({
      _id: mockUser._id,
      name: mockUser.name,
      email: mockUser.email,
      role: mockUser.role,
      token: "mockToken",
    });
  });

  it("should return 500 if an unexpected error occurs", async () => {
    req.body = { email: "test@example.com", password: "password123" };
    User.findOne.mockImplementation(() => {
      throw new Error("DB error");
    });

    await loginUser(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "Server error" });
  });
});


describe("forgotPassword Controller", () => {
  let req, res, mockUser;

  beforeEach(() => {
    req = { body: { email: "test@example.com" } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();

    // Base mock user
    mockUser = {
      _id: "user123",
      email: "test@example.com",
      save: jest.fn(),
    };
  });

  it("should return 404 if user not found", async () => {
    User.findOne.mockResolvedValueOnce(null);

    await forgotPassword(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: "test@example.com" });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "No user found" });
  });

  it("should generate reset token, save user, and send email", async () => {
    User.findOne.mockResolvedValueOnce(mockUser);
    jwt.sign.mockReturnValueOnce("mockResetToken");
    sendEmail.mockResolvedValueOnce();

    process.env.FRONTEND_URL = "http://localhost:3000";
    process.env.JWT_SECRET = "secret123";

    await forgotPassword(req, res);

    expect(jwt.sign).toHaveBeenCalledWith(
      { id: mockUser._id },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
    expect(mockUser.resetPasswordToken).toBe("mockResetToken");
    expect(mockUser.resetPasswordExpires).toBeGreaterThan(Date.now() - 1000);
    expect(mockUser.save).toHaveBeenCalled();

    expect(sendEmail).toHaveBeenCalledWith(
      mockUser.email,
      "Reset Your Password",
      expect.stringContaining(
        "http://localhost:3000/reset-password?token=mockResetToken"
      )
    );

    expect(res.json).toHaveBeenCalledWith({
      message: "Password reset link sent to your email.",
    });
  });

  it("should return 500 if an unexpected error occurs", async () => {
    User.findOne.mockImplementation(() => {
      throw new Error("DB error");
    });

    await forgotPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "Server error" });
  });
});


describe("resetPassword Controller", () => {
  let req, res, mockUser;

  beforeEach(() => {
    req = {
      body: {
        token: "mockResetToken",
        newPassword: "newPassword123",
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();

    // Mock user returned by DB
    mockUser = {
      _id: "user123",
      password: "oldHashedPassword",
      resetPasswordToken: "mockResetToken",
      resetPasswordExpires: Date.now() + 10 * 60 * 1000, // 10 mins in future
      save: jest.fn(),
    };
  });

  it("should return 400 if token is invalid or expired", async () => {
    User.findOne.mockResolvedValueOnce(null);

    await resetPassword(req, res);

    expect(User.findOne).toHaveBeenCalledWith({
      resetPasswordToken: "mockResetToken",
      resetPasswordExpires: { $gt: expect.any(Number) },
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid or expired token",
    });
  });

  it("should reset password successfully", async () => {
    User.findOne.mockResolvedValueOnce(mockUser);

    await resetPassword(req, res);

    expect(mockUser.password).toBe("newPassword123");
    expect(mockUser.resetPasswordToken).toBeUndefined();
    expect(mockUser.resetPasswordExpires).toBeUndefined();
    expect(mockUser.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      message: "Password reset successful. You can now log in.",
    });
  });

  it("should return 500 if an unexpected error occurs", async () => {
    User.findOne.mockImplementation(() => {
      throw new Error("DB error");
    });

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "Server error" });
  });
});