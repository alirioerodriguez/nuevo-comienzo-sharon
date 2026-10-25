// Prueba de /api/estado con una base falsa en memoria: npm test
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';


// Base falsa en memoria: interpreta las tres consultas que hace la función.
const filas = new Map();
mock.module('@neondatabase/serverless', { namedExports: { neon: () => async (partes, ...v) => {
  const q = partes.join('?');
  if (q.includes('create table')) return [];
  if (q.startsWith('select')) return filas.has(v[0]) ? [{ data: filas.get(v[0]) }] : [];
  if (q.startsWith('insert')) { filas.set(v[0], JSON.parse(v[1])); return []; }
  throw new Error('consulta inesperada ' + q);
} } });

process.env.DATABASE_URL = 'postgres://falsa';
const { default: handler } = await import('../api/estado.mjs');

function llamar(method, body) {
  return new Promise((ok) => {
    const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.code = c; return this; }, json(b) { ok({ code: this.code, body: b }); }, end() { ok({ code: this.code }); } };
    handler({ method, body }, res);
  });
}
const ID = '3f2b8c1e-9a4d-4e7f-8b2a-1c0d5e6f7a8b';

test('guardar y leer con el mismo código', async () => {
  assert.equal((await llamar('POST', { accion: 'guardar', id: ID, data: { checks: { a: true }, apps: [] } })).code, 204);
  assert.deepEqual((await llamar('POST', { accion: 'leer', id: ID.toUpperCase() })).body, { checks: { a: true }, apps: [] });
});
test('otro código no ve nada', async () => {
  assert.equal((await llamar('POST', { accion: 'leer', id: '00000000-0000-4000-8000-000000000000' })).body, null);
});
test('rechaza códigos que no son UUID (como el viejo "sharon")', async () => {
  assert.equal((await llamar('POST', { accion: 'leer', id: 'sharon' })).code, 400);
  assert.equal((await llamar('POST', { accion: 'leer', id: "x' or 1=1" })).code, 400);
});
test('rechaza datos raros, demasiado grandes o GET', async () => {
  assert.equal((await llamar('POST', { accion: 'guardar', id: ID, data: [1] })).code, 400);
  assert.equal((await llamar('POST', { accion: 'guardar', id: ID, data: { x: 'a'.repeat(600000) } })).code, 413);
  assert.equal((await llamar('GET', null)).code, 405);
});
