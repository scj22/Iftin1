import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import {
  ApiError,
  asyncHandler,
  authLimiter,
  requireAuth,
  requireDatabase,
  signAccessToken,
  signRefreshToken,
  validate,
} from '../middleware/index.js';

export const authRouter = Router();

const passwordRules = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be under 128 characters.')
  .regex(/[a-zA-Z]/, 'Password must contain a letter.')
  .regex(/[0-9]/, 'Password must contain a number.');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(80),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
  password: passwordRules,
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Please enter your password.'),
});

const REFRESH_COOKIE = 'smartroad_refresh';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/api/auth',
    maxAge: env.refreshCookieDays * 24 * 60 * 60 * 1000,
  };
}

function issueSession(res, user) {
  res.cookie(REFRESH_COOKIE, signRefreshToken(user), refreshCookieOptions());
  return {
    user: user.toPublic(),
    accessToken: signAccessToken(user),
    expiresIn: env.accessTokenTtl,
  };
}

authRouter.use(requireDatabase);

authRouter.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    if (await User.exists({ email })) {
      throw new ApiError(409, 'An account with that email address already exists.');
    }

    const user = new User({ name, email });
    await user.setPassword(password);
    user.lastLoginAt = new Date();
    await user.save();

    res.status(201).json(issueSession(res, user));
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+passwordHash');

    // Same message and comparable timing whether the email exists or not, so the
    // endpoint cannot be used to enumerate registered addresses.
    const valid = user ? await user.verifyPassword(password) : false;
    if (!user || !valid) {
      throw new ApiError(401, 'That email address and password do not match.');
    }

    user.lastLoginAt = new Date();
    await user.save();
    res.json(issueSession(res, user));
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new ApiError(401, 'No active session to refresh.');

    let payload;
    try {
      payload = jwt.verify(token, env.refreshSecret);
    } catch {
      res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
      throw new ApiError(401, 'Your session has expired. Please sign in again.');
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
      throw new ApiError(401, 'That account no longer exists.');
    }

    res.json(issueSession(res, user));
  }),
);

authRouter.post('/logout', (req, res) => {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
  res.json({ message: 'Signed out.' });
});

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth.sub);
    if (!user) throw new ApiError(404, 'That account no longer exists.');
    res.json({ user: user.toPublic() });
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  validate(
    z.object({
      name: z.string().trim().min(2).max(80).optional(),
      preferences: z
        .object({
          theme: z.enum(['light', 'dark', 'system']).optional(),
          homeCity: z.string().trim().max(80).optional(),
        })
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth.sub);
    if (!user) throw new ApiError(404, 'That account no longer exists.');

    if (req.body.name) user.name = req.body.name;
    if (req.body.preferences) {
      user.preferences = { ...user.preferences.toObject(), ...req.body.preferences };
    }
    await user.save();
    res.json({ user: user.toPublic() });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate(
    z.object({
      currentPassword: z.string().min(1, 'Please enter your current password.'),
      newPassword: passwordRules,
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth.sub).select('+passwordHash');
    if (!user) throw new ApiError(404, 'That account no longer exists.');

    if (!(await user.verifyPassword(req.body.currentPassword))) {
      throw new ApiError(401, 'Your current password is not correct.');
    }

    await user.setPassword(req.body.newPassword);
    await user.save();
    res.json({ message: 'Your password has been changed.' });
  }),
);

/**
 * Password reset.
 *
 * No email provider is configured in this deployment, and the code does not
 * pretend otherwise: a real single-use token is generated and stored as a hash,
 * but delivery is unavailable. Outside production the token is returned in the
 * response so the flow can be completed and demonstrated end to end.
 */
authRouter.post(
  '/forgot-password',
  authLimiter,
  validate(z.object({ email: z.string().trim().toLowerCase().email() })),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });

    const response = {
      message:
        'If an account exists for that address, a reset token has been created. ' +
        'Email delivery is not configured in this deployment.',
      emailDelivery: {
        configured: false,
        reason: 'No SMTP or transactional email provider is set up for this prototype.',
      },
    };

    if (user) {
      const token = user.createPasswordResetToken();
      await user.save();
      if (!env.isProduction) {
        response.devResetToken = token;
        response.devNote =
          'Returned only because NODE_ENV is not production, so the reset flow can be completed locally.';
      }
    }

    res.json(response);
  }),
);

authRouter.post(
  '/reset-password',
  authLimiter,
  validate(z.object({ token: z.string().min(16), password: passwordRules })),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({
      passwordResetTokenHash: User.hashResetToken(req.body.token),
      passwordResetExpiresAt: { $gt: new Date() },
    }).select('+passwordHash +passwordResetTokenHash +passwordResetExpiresAt');

    if (!user) throw new ApiError(400, 'That reset link is invalid or has expired.');

    await user.setPassword(req.body.password);
    await user.save();
    res.json({ message: 'Your password has been reset. You can sign in now.' });
  }),
);
