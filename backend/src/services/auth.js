const crypto = require('node:crypto');
const { ApiError, assert } = require('../lib/errors');
const { now } = require('../lib/utils');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, saved) {
  if (typeof saved !== 'string') return false;
  const [salt, hex] = saved.split(':');
  if (!salt || !hex || hex.length !== 128) return false;
  const expected = Buffer.from(hex, 'hex');
  const derived = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, derived);
}
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function issueSession(db, userId = null) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + (userId === null ? 24 : 168) * 3600_000).toISOString();
  const table = userId === null ? 'guest_sessions' : 'user_sessions';
  if (userId === null) db.prepare(`INSERT INTO ${table} (token_hash, expires_at) VALUES (?, ?)`).run(hashToken(token), expiresAt);
  else db.prepare(`INSERT INTO ${table} (user_id, token_hash, expires_at) VALUES (?, ?, ?)`).run(userId, hashToken(token), expiresAt);
  return { token, expiresAt };
}
function login(db, email, password) {
  assert(typeof email === 'string' && typeof password === 'string' && email.length <= 254 && password.length <= 256, 400, 'INVALID_CREDENTIALS', 'Credenciales inválidas.');
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email.trim());
  assert(user && user.enabled && verifyPassword(password, user.password_hash), 401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
  const session = issueSession(db, user.id);
  return { ...session, user: { id: user.id, role: user.role, fullName: user.full_name } };
}
function guest(db) { return { ...issueSession(db), actorType: 'guest' }; }
function resolveToken(db, token) {
  if (!token || !/^[A-Za-z0-9_-]{30,160}$/.test(token)) return null;
  const digest = hashToken(token);
  const user = db.prepare(`SELECT u.id, u.full_name AS fullName, u.role, s.id AS sessionId
    FROM user_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.enabled = 1`).get(digest, now());
  if (user) return { type: 'user', ...user };
  const visitor = db.prepare('SELECT id FROM guest_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?').get(digest, now());
  return visitor ? { type: 'guest', guestSessionId: visitor.id, role: 'guest' } : null;
}
function revoke(db, token, actor) {
  const table = actor.type === 'guest' ? 'guest_sessions' : 'user_sessions';
  db.prepare(`UPDATE ${table} SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`).run(now(), hashToken(token));
}
function middleware(db, roles = ['passenger', 'driver', 'admin', 'guest']) {
  return (req, _res, next) => {
    try {
      const match = /^Bearer\s+([^\s]+)$/i.exec(req.get('Authorization') || '');
      assert(match, 401, 'AUTH_REQUIRED', 'Debes iniciar sesión o continuar como invitado.');
      const actor = resolveToken(db, match[1]);
      assert(actor, 401, 'INVALID_SESSION', 'Tu sesión ha expirado. Ingresa nuevamente.');
      assert(roles.includes(actor.role), 403, 'FORBIDDEN', 'Esta acción no está disponible para tu cuenta.');
      req.actor = actor;
      req.rawToken = match[1];
      next();
    } catch (error) { next(error); }
  };
}
function me(actor) {
  return actor.type === 'guest' ? { actorType: 'guest', role: 'guest' } : { actorType: 'user', user: { id: actor.id, role: actor.role, fullName: actor.fullName } };
}
module.exports = { hashPassword, verifyPassword, login, guest, resolveToken, revoke, middleware, me };
