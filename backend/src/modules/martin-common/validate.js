'use strict';

const { badRequest } = require('./http');

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Identificador numerico positivo en ruta o query; 400 si el formato es invalido. */
function parseId(value, field) {
  const text = String(value ?? '');
  if (!/^\d+$/.test(text) || Number(text) < 1 || !Number.isSafeInteger(Number(text))) {
    throw badRequest('INVALID_ID', `El identificador "${field}" no es válido.`, { field });
  }
  return Number(text);
}

function parseOptionalId(value, field) {
  if (value === undefined || value === null || value === '') return null;
  return parseId(value, field);
}

function isIsoUtc(value) {
  return typeof value === 'string' && ISO_UTC.test(value) && !Number.isNaN(Date.parse(value));
}

/** Normaliza a "YYYY-MM-DDTHH:mm:ss.sssZ" (formato del contrato). */
function toIso(value) {
  return new Date(value).toISOString();
}

function requireIso(value, field) {
  if (!isIsoUtc(value)) {
    throw badRequest('VALIDATION_ERROR', `El campo "${field}" debe ser una fecha UTC ISO 8601.`, { field });
  }
  return toIso(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInt(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

module.exports = {
  parseId,
  parseOptionalId,
  isIsoUtc,
  toIso,
  requireIso,
  isFiniteNumber,
  isPositiveInt,
};
