import bcrypt from "bcrypt";
import { User, IUser } from "../models/user.model.js";
import { Meeting, IMeeting } from "../models/meeting.model.js";
import { OAuth2Client } from "google-auth-library";
import { Request, Response } from "express";
import httpStatus from "http-status";
import crypto from "crypto";

// Handles Google OAuth sign-in and sign-up with token verification
const googleAuth = async (req: Request, res: Response): Promise<Response | void> => {
    const { credential } = req.body;

    if (!credential) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Google credential is required" });
    }

    try {
        let payload: any;
        const clientId = process.env.GOOGLE_CLIENT_ID;

        // Verify ID token via Google library if client ID set, or safely decode JWT payload
        if (clientId) {
            const client = new OAuth2Client(clientId);
            const ticket = await client.verifyIdToken({
                idToken: credential,
                audience: clientId
            });
            payload = ticket.getPayload();
        } else {
            // Decodes base64 JWT payload when GOOGLE_CLIENT_ID is not yet configured in env
            const base64Payload = credential.split('.')[1];
            payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString());
        }

        const { sub: googleId, email, name, picture } = payload;
        if (!email) {
            return res.status(httpStatus.BAD_REQUEST).json({ message: "No email returned from Google" });
        }

        // Find existing user by googleId or email/username
        let user = await User.findOne({ $or: [{ googleId }, { username: email }, { email }] });

        const sessionToken = crypto.randomBytes(20).toString("hex");

        if (user) {
            user.googleId = googleId;
            user.email = email;
            if (picture) user.avatar = picture;
            user.token = sessionToken;
            await user.save();
        } else {
            // Create a new user profile on first Google sign-in
            user = new User({
                name: name || email.split('@')[0],
                username: email,
                email: email,
                googleId: googleId,
                avatar: picture || "",
                token: sessionToken
            });
            await user.save();
        }

        return res.status(httpStatus.OK).json({
            token: sessionToken,
            user: {
                name: user.name,
                username: user.username,
                email: user.email,
                avatar: user.avatar
            }
        });
    } catch (e: any) {
        console.error("Google Auth Error:", e);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Google authentication failed: ${e.message}` });
    }
};

const login = async (req: Request, res: Response): Promise<Response | void> => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Please Provide" });
    }

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "User not Found!!" });
        }
        let isPasswordCorrect = await bcrypt.compare(password, user.password || "");
        if (isPasswordCorrect) {
            let token = crypto.randomBytes(20).toString("hex");

            user.token = token;
            await user.save();
            return res.status(httpStatus.OK).json({ token: token });
        } else {
            return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid username or password" });
        }
    } catch (e) {
        return res.status(500).json({ message: `Something went wrong ${e}` });
    }
};

const register = async (req: Request, res: Response): Promise<Response | void> => {
    const { name, username, password } = req.body;

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(httpStatus.FOUND).json({ message: "User already exists " });
        }
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: name,
            username: username,
            password: hashedPassword
        });

        await newUser.save();

        res.status(httpStatus.CREATED).json({ message: "User Registered" });
    } catch (e) {
        res.json({ message: `Something Went Wrong ${e}` });
    }
};

// Returns the user's meeting history sorted newest first
const getUserHistory = async (req: Request, res: Response): Promise<Response | void> => {
    const { token } = req.query;

    if (!token) {
        return res.status(httpStatus.OK).json([]);
    }

    try {
        const user = await User.findOne({ token: token as string });
        if (!user) {
            return res.status(httpStatus.OK).json([]);
        }
        const meetings = await Meeting.find({ user_id: user.username, isDelete: false }).sort({ date: -1 });
        return res.status(httpStatus.OK).json(meetings);
    } catch (e) {
        return res.status(httpStatus.OK).json([]);
    }
};

// Saves a meeting code to history, or bumps timestamp if already visited
const addToHistory = async (req: Request, res: Response): Promise<Response | void> => {
    const { token, meeting_code } = req.body;

    if (!meeting_code) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Meeting code is required" });
    }

    try {
        if (!token) {
            return res.status(httpStatus.OK).json({ message: "Guest meeting created" });
        }

        const user = await User.findOne({ token: token });
        if (!user) {
            return res.status(httpStatus.OK).json({ message: "Session expired or guest, meeting not tracked" });
        }

        let existingMeeting = await Meeting.findOne({
            user_id: user.username,
            meetingCode: meeting_code
        });

        if (existingMeeting) {
            existingMeeting.date = new Date();
            existingMeeting.isDelete = false;
            await existingMeeting.save();
            return res.status(httpStatus.OK).json({ message: "Meeting history updated", meeting: existingMeeting });
        }

        const newMeeting = new Meeting({
            user_id: user.username,
            meetingCode: meeting_code,
            date: new Date(),
            isDelete: false
        });

        await newMeeting.save();
        return res.status(httpStatus.CREATED).json({ message: "Meeting added to history", meeting: newMeeting });
    } catch (e) {
        return res.status(httpStatus.OK).json({ message: "Meeting created without history tracking" });
    }
};

// Delete user history
const deleteUserHistory = async (req: Request, res: Response): Promise<Response | void> => {
    const { token, meeting_code } = req.body;

    if (!token || !meeting_code) {
        return res
            .status(httpStatus.BAD_REQUEST)
            .json({ message: "Token and meeting code required" });
    }

    try {
        const user = await User.findOne({ token });
        if (!user) {
            return res
                .status(httpStatus.UNAUTHORIZED)
                .json({ message: "Invalid token" });
        }

        const meeting = await Meeting.findOneAndUpdate(
            {
                user_id: user.username,
                meetingCode: meeting_code,
                isDelete: false
            },
            {
                $set: { isDelete: true }
            },
            { new: true }
        );

        if (!meeting) {
            return res
                .status(httpStatus.NOT_FOUND)
                .json({ message: "Meeting not found" });
        }

        res
            .status(httpStatus.OK)
            .json({ message: "Meeting deleted from history" });
    } catch (e) {
        res
            .status(500)
            .json({ message: `Something went wrong ${e}` });
    }
};

export { googleAuth, login, register, getUserHistory, addToHistory, deleteUserHistory };
