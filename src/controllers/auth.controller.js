import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import PasswordAttempt from '../models/PasswordAttempt.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendVerificationEmail, sendLoginNotificationEmail, sendLogoutNotificationEmail, sendForgotPasswordEmail } from '../services/emailService.js';

const MAX_PASSWORD_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 3 * 60 * 1000;

// Shared between changePassword and changeUsername — both gate on the
// same current-password check, so a lockout applies across either.
const assertNotLockedOut = async (userId) => {
  const record = await PasswordAttempt.findOne({ userId });
  if (record && record.lockedUntil && record.lockedUntil > new Date()) {
    const minutesLeft = Math.max(1, Math.ceil((record.lockedUntil - new Date()) / 60000));
    throw new ApiError(429, `Too many incorrect attempts. Try again in ${minutesLeft} minute(s).`);
  }
};

// Increments the failed-attempt count and throws the appropriate error.
// At MAX_PASSWORD_ATTEMPTS, sets a 3-minute lock and resets the count to 0
// so the user gets a fresh set of attempts once the lock expires.
const recordFailedPasswordAttempt = async (userId) => {
  const record = await PasswordAttempt.findOneAndUpdate(
    { userId },
    { $inc: { failedCount: 1 } },
    { upsert: true, new: true }
  );

  if (record.failedCount >= MAX_PASSWORD_ATTEMPTS) {
    record.failedCount = 0;
    record.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    await record.save();
    throw new ApiError(429, 'Too many incorrect attempts. Try again in 3 minutes.');
  }

  throw new ApiError(403, 'Current password is incorrect');
};

const clearPasswordAttempts = async (userId) => {
  await PasswordAttempt.deleteOne({ userId });
};

const issueAuthTokens = async (user) => {
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ token: refreshToken, userId: user._id, expiresAt });

  user.refreshToken = refreshToken;

  return { accessToken, refreshToken };
};

export const register = asyncHandler(async (req, res) => {
  try {
    console.log('📝 Register: Starting registration...');
    const { email, password, fullName } = req.body;
    let { username } = req.body;
    console.log('📝 Register: Got user data');

    if (!email || !password) {
      throw new ApiError(400, 'Email and password are required');
    }

    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      throw new ApiError(409, 'Email or username already exists');
    }

    if (!username) {
      const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
      username = base;
      let suffix = 0;
      while (await User.findOne({ username })) {
        suffix += 1;
        username = `${base}${suffix}`;
      }
    } else {
      username = username.toLowerCase();
      const existingUsername = await User.findOne({ username });
      if (existingUsername) {
        throw new ApiError(409, 'Email or username already exists');
      }
    }

    const user = new User({
      email: email.toLowerCase(),
      password,
      username,
      fullName: fullName || username,
    });

    const { unHashedToken, hashedToken, tokenExpiry } = user.generateTemporaryToken();
    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpiry = new Date(tokenExpiry);

    await user.save();
    console.log('📝 Register: User saved');

    const verificationLink = `${process.env.CLIENT_URL || 'http://localhost:3000'}/verify-email?token=${unHashedToken}`;
    console.log('📝 Register: Sending verification email...');
    try {
      await sendVerificationEmail(email, verificationLink);
      console.log('📝 Register: Email sent');
    } catch (err) {
      console.error('Email delivery failed:', err.message);
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({ token: refreshToken, userId: user._id, expiresAt });

    res.status(201).json(
      new ApiResponse(201, { accessToken, refreshToken, user: { _id: user._id, email: user.email, username: user.username } }, 'User registered successfully. Check your email for verification link.')
    );
  } catch (error) {
    console.error('❌ Register Error:', error);
    throw error;
  }
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const token = req.body?.token || req.query.token;

  if (!token) {
    throw new ApiError(400, 'Verification token is required');
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpiry: { $gt: Date.now() },
  });

  if (!user) {
    throw new ApiError(400, 'Invalid or expired verification token');
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = null;
  user.emailVerificationExpiry = null;

  await user.save();

  const { accessToken, refreshToken } = await issueAuthTokens(user);
  await user.save();

  res.status(200).json(
    new ApiResponse(200, { accessToken, refreshToken, user: { _id: user._id, email: user.email, username: user.username } }, 'Email verified successfully')
  );
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (!user.isEmailVerified) {
    throw new ApiError(403, 'Please verify your email before logging in');
  }

  const { accessToken, refreshToken } = await issueAuthTokens(user);
  await user.save();

  try {
    await sendLoginNotificationEmail(user.email);
  } catch (err) {
    console.error('Email delivery failed:', err.message);
  }

  res.status(200).json(
    new ApiResponse(200, { accessToken, refreshToken, user: { _id: user._id, email: user.email, username: user.username } }, 'Login successful')
  );
});

export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const userId = req.user?._id;

  if (refreshToken) {
    await RefreshToken.deleteOne({ token: refreshToken });
  }

  if (userId) {
    const user = await User.findById(userId);
    if (user) {
      try {
        await sendLogoutNotificationEmail(user.email);
      } catch (err) {
        console.error('Email delivery failed:', err.message);
      }
    }
  }

  res.status(200).json(new ApiResponse(200, null, 'Logged out successfully'));
});

export const refreshAccessToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new ApiError(400, 'Refresh token is required');
  }

  const storedToken = await RefreshToken.findOne({ token: refreshToken });
  if (!storedToken) {
    throw new ApiError(401, 'Invalid refresh token');
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded._id);

    if (!user) {
      throw new ApiError(401, 'User not found');
    }

    const newAccessToken = user.generateAccessToken();

    res.status(200).json(new ApiResponse(200, { accessToken: newAccessToken }, 'Token refreshed successfully'));
  } catch (error) {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ApiError(400, 'Email is required');
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const { unHashedToken, hashedToken, tokenExpiry } = user.generateTemporaryToken();
  user.forgotPasswordToken = hashedToken;
  user.forgotPasswordExpiry = new Date(tokenExpiry);

  await user.save();

  const resetLink = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password?token=${unHashedToken}`;
  try {
    await sendForgotPasswordEmail(email, resetLink);
  } catch (err) {
    console.error('Email delivery failed:', err.message);
  }

  res.status(200).json(new ApiResponse(200, null, 'Password reset link sent to your email'));
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    throw new ApiError(400, 'Token and new password are required');
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    forgotPasswordToken: hashedToken,
    forgotPasswordExpiry: { $gt: Date.now() },
  });

  if (!user) {
    throw new ApiError(400, 'Invalid or expired reset token');
  }

  user.password = newPassword;
  user.forgotPasswordToken = null;
  user.forgotPasswordExpiry = null;

  await user.save();

  res.status(200).json(new ApiResponse(200, null, 'Password reset successfully'));
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password -refreshToken -forgotPasswordToken -emailVerificationToken');
  res.status(200).json(new ApiResponse(200, { user }, 'User fetched successfully'));
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'Current password and new password are required');
  }

  // minimum length — new rule, not present in register
  if (newPassword.length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters');
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  await assertNotLockedOut(user._id);

  const isCurrentPasswordValid = await user.isPasswordCorrect(currentPassword);
  if (!isCurrentPasswordValid) {
    await recordFailedPasswordAttempt(user._id);
  }

  await clearPasswordAttempts(user._id);

  await RefreshToken.deleteMany({ userId: user._id });

  user.password = newPassword;
  user.refreshToken = null;
  await user.save();

  res.status(200).json(new ApiResponse(200, null, 'Password changed successfully'));
});

export const changeUsername = asyncHandler(async (req, res) => {
  const { newUsername, currentPassword } = req.body;

  if (!newUsername || !currentPassword) {
    throw new ApiError(400, 'New username and current password are required');
  }

  const normalizedUsername = newUsername.toLowerCase().trim();

  if (!/^[a-zA-Z0-9._-]+$/.test(normalizedUsername) || normalizedUsername.length < 3 || normalizedUsername.length > 20) {
    throw new ApiError(400, 'Username must be 3-20 characters and contain only letters, numbers, dots, underscores, and dashes');
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (normalizedUsername === user.username.toLowerCase()) {
    throw new ApiError(400, 'New username is the same as your current one');
  }

  const existingUsername = await User.findOne({ username: normalizedUsername, _id: { $ne: user._id } });
  if (existingUsername) {
    throw new ApiError(409, 'Username already taken');
  }

  await assertNotLockedOut(user._id);

  const isCurrentPasswordValid = await user.isPasswordCorrect(currentPassword);
  if (!isCurrentPasswordValid) {
    await recordFailedPasswordAttempt(user._id);
  }

  await clearPasswordAttempts(user._id);

  user.username = normalizedUsername;
  await user.save();

  const newAccessToken = user.generateAccessToken();

  res.status(200).json(new ApiResponse(200, { accessToken: newAccessToken, username: user.username }, 'Username updated successfully'));
});
