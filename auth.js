import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { User } from './models/User.js';
import { TrackedFigure } from './models/TrackedFigure.js';

const PASSWORD_MIN = 8;

export function requireUser(req, res, next) {
  if (!req.path.startsWith('/api') || req.path.startsWith('/api/auth')) return next();
  if (!req.session?.userId) return res.status(401).json({ error: 'Sign in required' });
  next();
}

export function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name || '' };
}

function googleRedirectUri(req) {
  if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 5000;
    return `http://localhost:${port}/api/auth/google/callback`;
  }
  return `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
}

function afterLoginUrl() {
  if (process.env.NODE_ENV === 'production') return '/';
  return process.env.CLIENT_ORIGIN || 'http://localhost:5173/';
}

async function claimUnownedFigures(userId) {
  const owned = await TrackedFigure.exists({ user: { $ne: null } });
  if (owned) return;
  await TrackedFigure.updateMany(
    { $or: [{ user: null }, { user: { $exists: false } }] },
    { user: userId }
  );
}

async function startSession(req, user) {
  await claimUnownedFigures(user.id);
  req.session.userId = user.id;
  await new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

export function registerAuthRoutes(app) {
  app.post('/api/auth/register', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Enter an email address.' });
    }
    if (password.length < PASSWORD_MIN) {
      return res.status(400).json({ error: `Use at least ${PASSWORD_MIN} characters.` });
    }
    try {
      const existing = await User.findOne({ email });
      if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });
      const user = await User.create({
        email,
        name,
        passwordHash: await bcrypt.hash(password, 12),
      });
      await startSession(req, user);
      res.status(201).json(publicUser(user));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    try {
      const user = await User.findOne({ email });
      const matches = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
      if (!matches) {
        return res.status(401).json({ error: 'Email or password is incorrect.' });
      }
      await startSession(req, user);
      res.json(publicUser(user));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('wrestling.sid');
      res.json({ ok: true });
    });
  });

  app.get('/api/auth/me', async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Sign in required' });
    const user = await User.findById(req.session.userId);
    if (!user) return res.status(401).json({ error: 'Sign in required' });
    res.json(publicUser(user));
  });

  app.get('/api/auth/google', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(503).json({ error: 'Google sign-in is not configured.' });
    const state = randomBytes(16).toString('hex');
    req.session.googleState = state;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: googleRedirectUri(req),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Could not start Google sign-in.' });
      res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    });
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const home = afterLoginUrl();
    try {
      const { code, state } = req.query;
      if (!code || !state || state !== req.session.googleState) {
        return res.redirect(`${home}?auth=failed`);
      }
      delete req.session.googleState;
      const redirectUri = googleRedirectUri(req);
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code),
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const token = await tokenResponse.json();
      if (!token.access_token) {
        console.error('[Auth] Google token exchange failed');
        return res.redirect(`${home}?auth=failed`);
      }
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      const profile = await profileResponse.json();
      const email = String(profile.email || '').toLowerCase();
      if (!profile.id || !email) return res.redirect(`${home}?auth=failed`);

      let user = await User.findOne({ googleId: profile.id });
      if (!user) user = await User.findOne({ email });
      if (user) {
        user.googleId = profile.id;
        if (!user.name && profile.name) user.name = profile.name;
        await user.save();
      } else {
        user = await User.create({
          email,
          googleId: profile.id,
          name: profile.name || '',
        });
      }
      await startSession(req, user);
      res.redirect(home);
    } catch (err) {
      console.error('[Auth] Google callback failed:', err);
      res.redirect(`${home}?auth=failed`);
    }
  });
}
