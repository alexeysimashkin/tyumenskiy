const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Удали старые таблицы и создай заново
pool.query(`DROP TABLE IF EXISTS departures, arrivals`).then(() => {
  pool.query(`CREATE TABLE IF NOT EXISTS departures (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
  pool.query(`CREATE TABLE IF NOT EXISTS arrivals (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
}).catch(e => console.log(e));

async function load(table) { try { const r = await pool.query(`SELECT data FROM ${table}`); return r.rows.map(x => x.data); } catch(e) { return []; } }
async function saveOne(f, table) { await pool.query(`INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`, [f.id, JSON.stringify(f)]); }

app.get('/api/flights', async (req, res) => {
  const table = req.query.type === 'arrival' ? 'arrivals' : 'departures';
  res.json(await load(table));
});

app.post('/api/flights', async (req, res) => {
  const table = req.query.type === 'arrival' ? 'arrivals' : 'departures';
  const f = { id: Date.now().toString(), flightNumber: req.body.flightNumber||'', destination: req.body.destination||'', iataCode: req.body.iataCode||'', airline: req.body.airline||'', scheduledDeparture: req.body.scheduledDeparture||null, expectedDeparture: req.body.expectedDeparture||null, checkInStart: req.body.checkInStart||null, checkInEnd: req.body.checkInEnd||null, checkInCounters: req.body.checkInCounters||'', boardingStart: req.body.boardingStart||null, boardingEnd: req.body.boardingEnd||null, boardingGate: req.body.boardingGate||'', status: req.body.status||'scheduled' };
  await saveOne(f, table);
  res.status(201).json(f);
});

app.put('/api/flights/:id', async (req, res) => {
  const table = req.query.type === 'arrival' ? 'arrivals' : 'departures';
  const flights = await load(table);
  const i = flights.findIndex(f => f.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Не найден' });
  flights[i] = { ...flights[i], ...req.body, id: flights[i].id };
  await saveOne(flights[i], table);
  res.json(flights[i]);
});

app.delete('/api/flights/:id', async (req, res) => {
  const table = req.query.type === 'arrival' ? 'arrivals' : 'departures';
  await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
  res.status(204).send();
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('OK'));
module.exports = app;
