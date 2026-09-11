import mongoose, { Schema } from "mongoose";

// User model supporting Google OAuth and session tokens
const userSchema = new Schema({
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String },
    googleId: { type: String },
    avatar: { type: String },
    password: { type: String, required: false },
    token: { type: String }
});

const User = mongoose.model("User",userSchema);

export {User};