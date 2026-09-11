import mongoose, { Document, Model, Schema } from "mongoose";

export interface IMeeting extends Document {
    user_id?: string;
    meetingCode: string;
    date: Date;
    isDelete: boolean;
}

const meetingSchema = new Schema<IMeeting>(
    {
        user_id: { type: String },
        meetingCode: { type: String, required: true },
        date: { type: Date, default: Date.now, required: true },
        isDelete: {
            type: Boolean,
            default: false
        }
    }
);

const Meeting: Model<IMeeting> = mongoose.model<IMeeting>("Meeting", meetingSchema);

export { Meeting };
