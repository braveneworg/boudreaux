// models/User.js
import mongoose, { Document, Model } from 'mongoose';

export interface IUserDocument extends Document {
  email: string;
  emailVerified?: Date;
  firstName?: string;
  lastName?: string;
}

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    required: true,
  },
  emailVerified: Date, // Auth.js manages this for email verification
  // Add other user-specific fields here if necessary
  firstName: {
    type: String,
  },
  lastName: {
    type: String,
  },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model<IUserDocument, Model<IUserDocument>>('User', UserSchema);

export default User;
