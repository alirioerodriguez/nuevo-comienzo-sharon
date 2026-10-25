// Guarda y lee el estado de la guía (casillas y postulaciones) en Neon.
// Cada dispositivo tiene su propio código secreto (UUID al azar) y solo puede leer o pisar la fila de ese código.
// La conexión (DATABASE_URL) la pone Vercel al conectar la base de Neon al proyecto: no hay ninguna clave en la página.
import { neon } from '@neondatabase/serverless';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 500000;
let tablaLista = null;

function prepararTabla(sql) {
  if (!tablaLista) {
    tablaLista = sql`create table if not exists estados (
      id uuid primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )`.catch((e) => { tablaLista = null; throw e; });
  }
  return tablaLista;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Falta conectar la base de datos' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const { accion, id, data } = body || {};
  if (typeof id !== 'string' || !UUID_RE.test(id)) return res.status(400).json({ error: 'Código inválido' });

  const sql = neon(process.env.DATABASE_URL);
  try {
    await prepararTabla(sql);
    if (accion === 'leer') {
      const filas = await sql`select data from estados where id = ${id.toLowerCase()}`;
      return res.status(200).json(filas.length ? filas[0].data : null);
    }
    if (accion === 'guardar') {
      if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: 'Datos inválidos' });
      const json = JSON.stringify(data);
      if (Buffer.byteLength(json) > MAX_BYTES) return res.status(413).json({ error: 'Demasiados datos' });
      await sql`insert into estados (id, data, updated_at) values (${id.toLowerCase()}, ${json}::jsonb, now())
        on conflict (id) do update set data = excluded.data, updated_at = now()`;
      return res.status(204).end();
    }
    return res.status(400).json({ error: 'Acción desconocida' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'No se pudo guardar' });
  }
}
