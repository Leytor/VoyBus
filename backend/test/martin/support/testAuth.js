'use strict';

/**
 * SOLO PRUEBAS — doble de la autenticacion de Gianny.
 *
 * Implementa lo minimo del contrato (/auth/login, /auth/guest, /auth/logout,
 * /auth/me y requireRole) sobre user_sessions y guest_sessions, para probar los
 * modulos de Martin de forma aislada. No se usa en la aplicacion: la
 * autenticacion definitiva es la de Gianny.
 */
const crypto = require('node:crypto');
const express = require('express');
const { asyncHandler, sendData, martinErrorHandler, unauthorized, forbidden, badRequest } =
  require('../../../src/modules/martin-common/http');

const SESSION_HOURS = 12;

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  const candidate = crypto.scryptSync(plain, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

function createDevAuth({ db, clock = { now: () => new Date() } }) {
  const newToken = () => crypto.randomBytes(32).toString('hex');
  const expiry = () => new Date(clock.now().getTime() + SESSION_HOURS * 3600 * 1000).toISOString();

  function readBearer(req) {
    const header = req.get('authorization') || '';
    const match = header.match(/^Bearer\s+([A-Za-z0-9._-]+)$/);
    return match ? match[1] : null;
  }

  async function resolveActor(req) {
    const token = readBearer(req);
    if (!token) return null;
    const now = clock.now().toISOString();
    const session = await db.get(
      `SELECT u.id, u.role, u.enabled FROM user_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.revoked_at IS NULL AND julianday(s.expires_at) > julianday(?)`,
      [sha256(token), now],
    );
    if (session) return session.enabled === 1 ? { type: 'user', userId: session.id, role: session.role } : null;
    const guest = await db.get(
      `SELECT id FROM guest_sessions WHERE token_hash = ? AND revoked_at IS NULL AND julianday(expires_at) > julianday(?)`,
      [sha256(token), now],
    );
    return guest ? { type: 'guest', guestSessionId: guest.id, role: 'guest' } : null;
  }

  /** Middleware de rol con la misma semantica que exige el contrato (401 / 403). */
  function requireRole(...roles) {
    return asyncHandler(async (req, res, next) => {
      const actor = await resolveActor(req);
      if (!actor) throw unauthorized();
      if (!roles.includes(actor.role)) {
        throw forbidden('FORBIDDEN_ROLE', 'No tienes permisos para esta acción.', { requiredRoles: roles });
      }
      req.actor = actor;
      next();
    });
  }

  const getActor = (req) => req.actor;

  const router = express.Router();
  router.post(
    '/auth/login',
    express.json(),
    asyncHandler(async (req, res) => {
      const { email, password } = req.body || {};
      if (typeof email !== 'string' || typeof password !== 'string') {
        throw badRequest('VALIDATION_ERROR', 'Debes indicar correo y contraseña.');
      }
      const user = await db.get('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
      if (!user || !verifyPassword(password, user.password_hash) || user.enabled !== 1) {
        throw unauthorized('Credenciales inválidas.');
      }
      const token = newToken();
      const expiresAt = expiry();
      await db.run('INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [
        user.id, sha256(token), expiresAt,
      ]);
      sendData(res, { token, expiresAt, user: { id: user.id, role: user.role, fullName: user.full_name } });
    }),
  );

  router.post(
    '/auth/guest',
    asyncHandler(async (req, res) => {
      const token = newToken();
      const expiresAt = expiry();
      await db.run('INSERT INTO guest_sessions (token_hash, expires_at) VALUES (?, ?)', [sha256(token), expiresAt]);
      sendData(res, { token, expiresAt, actorType: 'guest' });
    }),
  );

  router.post(
    '/auth/logout',
    asyncHandler(async (req, res) => {
      const token = readBearer(req);
      if (!token) throw unauthorized();
      const now = clock.now().toISOString();
      await db.run('UPDATE user_sessions SET revoked_at = ? WHERE token_hash = ?', [now, sha256(token)]);
      await db.run('UPDATE guest_sessions SET revoked_at = ? WHERE token_hash = ?', [now, sha256(token)]);
      sendData(res, { loggedOut: true });
    }),
  );

  router.get(
    '/auth/me',
    asyncHandler(async (req, res) => {
      const actor = await resolveActor(req);
      if (!actor) throw unauthorized();
      if (actor.type === 'guest') return sendData(res, { actorType: 'guest' });
      const user = await db.get('SELECT id, role, full_name FROM users WHERE id = ?', [actor.userId]);
      return sendData(res, { id: user.id, role: user.role, fullName: user.full_name });
    }),
  );
  router.use(martinErrorHandler);

  return { router, requireRole, getActor };
}

module.exports = { createDevAuth, hashPassword };
