import mongoose, { Document, Model, Schema } from "mongoose";

export interface IUser extends Document {
    name: string;
    username: string;
    email?: string;
    googleId?: string;
    avatar?: string;
    password?: string;
    token?: string;
}

// User model supporting Google OAuth and session tokens
const userSchema = new Schema<IUser>({
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String },
    googleId: { type: String },
    avatar: { type: String },
    password: { type: String, required: false },
    token: { type: String }
});

const User: Model<IUser> = mongoose.model<IUser>("User", userSchema);

export { User };
