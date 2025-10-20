import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "./models/userModel.js";

dotenv.config();

const seedSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected.");

    const existingSuperAdmin = await User.findOne({ role: "super_admin" });
    if (existingSuperAdmin) {
      console.log("Super admin already exists. Aborting seed.");
      process.exit(0);
    }

    const superAdmin = await User.create({
      name: "Super Admin",
      email: "superadmin@example.com",
      password: "SuperAdmin@123",
      role: "super_admin",
      status: "active",
    }); 

    console.log("Super admin created successfully!!");

    process.exit(0);
  } catch (error) {
    console.error("Error seeding super admin:", error);
    process.exit(1);
  }
};

seedSuperAdmin();
