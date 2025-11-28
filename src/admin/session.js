import crypto from 'crypto';
import config from '../config/config.js';

// Store valid session tokens
const sessions = new Map();

// Session expiry time (24 hours)
const SESSION_EXPIRY = 24 * 60 * 60 * 1000;

// Create session token
export function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    created: Date.now(),
    lastAccess: Date.now()
  });
  return token;
}

// Validate session
export function validateSession(token) {
  if (!token) return false;

  const session = sessions.get(token);
  if (!session) return false;

  // Check if expired
  if (Date.now() - session.created > SESSION_EXPIRY) {
    sessions.delete(token);
    return false;
  }

  // Update last access time
  session.lastAccess = Date.now();
  return true;
}

// Destroy session
export function destroySession(token) {
  sessions.delete(token);
}

// Verify password
export function verifyPassword(password) {
  const adminPassword = config.security?.adminPassword || 'admin123';
  return password === adminPassword;
}

// Get admin password
export function getAdminPassword() {
  return config.security?.adminPassword || 'admin123';
}

// Clean up expired sessions
function cleanupSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now - session.created > SESSION_EXPIRY) {
      sessions.delete(token);
    }
  }
}

// Clean up expired sessions every hour
setInterval(cleanupSessions, 60 * 60 * 1000);

// Admin authentication middleware
export function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;

  if (validateSession(token)) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized, please login first' });
  }
}
