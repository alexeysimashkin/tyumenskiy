const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(`CREATE TABLE IF NOT EXISTS flights (id TEXT PRIMARY KEY, data JSONB NOT NULL)`).catch(e => console.log(e));

async function load() {
  try { const r = await pool.query('SELECT data FROM flights'); return r.rows.map(x => x.data); }
  catch(e) { return []; }
}

async function saveOne(f) {
  await pool.query(
    'INSERT INTO flights (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
    [f.id, JSON.stringify(f)]
  );
}

function getLocalNow() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (5 * 3600000));
}

function computeStatus(f) {
  if (f.status === 'cancelled') return 'cancelled';
  if (f.status === 'departed') return 'departed';
  const now = getLocalNow();
  const ci = f.checkInStart ? new Date(f.checkInStart) : null;
  const ce = f.checkInEnd ? new Date(f.checkInEnd) : null;
  const bs = f.boardingStart ? new Date(f.boardingStart) : null;
  const be = f.boardingEnd ? new Date(f.boardingEnd) : null;
  if (be && now > be) return 'boarding_completed';
  if (bs && be && now >= bs && now <= be) return 'boarding';
  if (ce && now > ce && (!bs || now < bs)) return 'checkin_completed';
  if (ci && ce && now >= ci && now <= ce) return 'checkin';
  const sched = f.scheduledDeparture ? new Date(f.scheduledDeparture) : null;
  const exp = f.expectedDeparture ? new Date(f.expectedDeparture) : null;
  if (exp && sched && exp > sched && now < exp) return 'delayed';
  return 'scheduled';
}

function getStatusText(f) {
  if (f.status === 'cancelled') return 'Отменён';
  if (f.status === 'departed') return 'Вылетел';
  const s = computeStatus(f);
  const exp = f.expectedDeparture ? new Date(f.expectedDeparture) : null;
  const time = exp ? `${String(exp.getHours()).padStart(2,'0')}:${String(exp.getMinutes()).padStart(2,'0')}` : '';
  if (s === 'delayed') return `Задержан до ${time}`;
  if (s === 'checkin') return 'Регистрация';
  if (s === 'checkin_completed') return 'Регистрация закончена';
  if (s === 'boarding') return 'Посадка';
  if (s === 'boarding_completed') return 'Посадка закончена';
  return 'По расписанию';
}

function getFlightDay(f) {
  const dep = f.expectedDeparture 
    ? new Date(f.expectedDeparture) 
    : f.scheduledDeparture 
      ? new Date(f.scheduledDeparture) 
      : null;
  if (!dep || isNaN(dep.getTime())) return 'today';
  const now = getLocalNow();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);
  if (dep >= tomorrowStart) return 'tomorrow';
  return 'today';
}

app.get('/api/flights', async (req, res) => {
  let flights = await load();
  const showDep = req.query.showDeparted === 'true';
  const today = getLocalNow().toISOString().slice(0, 10);
  
  // Очистка вчерашних departed
  const cleaned = flights.filter(f => {
    if (f.status === 'departed' && f.scheduledDeparture) return f.scheduledDeparture.slice(0, 10) >= today;
    return true;
  });
  if (cleaned.length !== flights.length) {
    for (const f of flights) {
      if (!cleaned.includes(f)) await pool.query('DELETE FROM flights WHERE id = $1', [f.id]);
    }
    flights = cleaned;
  }
  
  if (!showDep) flights = flights.filter(f => f.status !== 'departed');
  
  flights = flights.map(f => ({ 
    ...f, 
    computedStatus: computeStatus(f), 
    statusText: getStatusText(f),
    flightDay: getFlightDay(f)
  }));
  
  flights.sort((a, b) => {
    const ta = a.expectedDeparture || a.scheduledDeparture || '';
    const tb = b.expectedDeparture || b.scheduledDeparture || '';
    return ta.localeCompare(tb);
  });
  
  res.json(flights);
});

app.post('/api/flights', async (req, res) => {
  const f = {
    id: Date.now().toString(),
    flightNumber: req.body.flightNumber || '',
    destination: req.body.destination || '',
    iataCode: req.body.iataCode || '',
    airline: req.body.airline || '',
    scheduledDeparture: req.body.scheduledDeparture || null,
    expectedDeparture: req.body.expectedDeparture || null,
    checkInStart: req.body.checkInStart || null,
    checkInEnd: req.body.checkInEnd || null,
    checkInCounters: req.body.checkInCounters || '',
    boardingStart: req.body.boardingStart || null,
    boardingEnd: req.body.boardingEnd || null,
    boardingGate: req.body.boardingGate || '',
    status: req.body.status || 'scheduled'
  };
  await saveOne(f);
  res.status(201).json(f);
});

app.put('/api/flights/:id', async (req, res) => {
  const flights = await load();
  const i = flights.findIndex(f => f.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Не найден' });
  flights[i] = { ...flights[i], ...req.body, id: flights[i].id };
  await saveOne(flights[i]);
  res.json(flights[i]);
});

app.delete('/api/flights/:id', async (req, res) => {
  await pool.query('DELETE FROM flights WHERE id = $1', [req.params.id]);
  res.status(204).send();
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Тюмень OK'));
module.exports = app;
