const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(`CREATE TABLE IF NOT EXISTS departures (id TEXT PRIMARY KEY, data JSONB NOT NULL)`).catch(e => console.log(e));
pool.query(`CREATE TABLE IF NOT EXISTS arrivals (id TEXT PRIMARY KEY, data JSONB NOT NULL)`).catch(e => console.log(e));

async function load(table) {
  try { const r = await pool.query(`SELECT data FROM ${table}`); return r.rows.map(x => x.data); }
  catch(e) { return []; }
}

async function saveOne(f, table) {
  await pool.query(`INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`, [f.id, JSON.stringify(f)]);
}

async function deleteOne(id, table) {
  await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
}

function getLocalNow() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (5 * 3600000));
}

function computeStatus(f) {
  if (f.status === 'cancelled') return 'cancelled';
  if (f.status === 'departed') return 'departed';
  if (f.status === 'early_departed') return 'early_departed';
  if (f.status === 'suspended') return 'suspended';
  const now = getLocalNow();
  const ci = f.checkInStart ? new Date(f.checkInStart) : null;
  const ce = f.checkInEnd ? new Date(f.checkInEnd) : null;
  const bs = f.boardingStart ? new Date(f.boardingStart) : null;
  const be = f.boardingEnd ? new Date(f.boardingEnd) : null;
  const sched = f.scheduledDeparture ? new Date(f.scheduledDeparture) : null;
  const exp = f.expectedDeparture ? new Date(f.expectedDeparture) : null;
  const isEarly = exp && sched && exp < sched && now < sched;
  if (isEarly) {
    if (be && now > be) return 'boarding_completed';
    if (bs && be && now >= bs && now <= be) return 'boarding';
    if (ce && now > ce && (!bs || now < bs)) return 'checkin_completed';
    if (ci && ce && now >= ci && now <= ce) return 'checkin';
    return 'early';
  }
  if (be && now > be) return 'boarding_completed';
  if (bs && be && now >= bs && now <= be) return 'boarding';
  if (ce && now > ce && (!bs || now < bs)) return 'checkin_completed';
  if (ci && ce && now >= ci && now <= ce) return 'checkin';
  if (exp && sched && exp > sched && now < exp) return 'delayed';
  return 'scheduled';
}

function getStatusText(f) {
  if (f.status === 'cancelled') return 'Отменён';
  if (f.status === 'departed') return 'Вылетел';
  if (f.status === 'early_departed') return 'Вылетел';
  if (f.status === 'suspended') return 'Приостановлено';
  const s = computeStatus(f);
  const exp = f.expectedDeparture ? new Date(f.expectedDeparture) : null;
  const time = exp ? `${String(exp.getHours()).padStart(2,'0')}:${String(exp.getMinutes()).padStart(2,'0')}` : '';
  if (s === 'early') return `Вылет раньше\n(ожидается в ${time})`;
  if (s === 'delayed') return `Задержан до ${time}`;
  if (s === 'checkin') return 'Регистрация';
  if (s === 'checkin_completed') return 'Регистрация закончена';
  if (s === 'boarding') return 'Посадка';
  if (s === 'boarding_completed') return 'Посадка закончена';
  return 'По расписанию';
}

function computeArrivalStatus(f) {
  if (f.status === 'cancelled') return 'cancelled';
  if (f.status === 'arrived') return 'arrived';
  if (f.status === 'diverted') return 'diverted';
  if (f.status === 'suspended') return 'suspended';
  if (f.status === 'expected') return 'expected';
  const now = getLocalNow();
  const sched = f.scheduledDeparture ? new Date(f.scheduledDeparture) : null;
  const exp = f.expectedDeparture ? new Date(f.expectedDeparture) : null;
  if (exp && sched && exp > sched && now < exp) return 'delayed';
  if (exp && sched && exp < sched && now < sched) return 'early';
  return 'scheduled';
}

function getArrivalStatusText(f) {
  if (f.status === 'cancelled') return 'Отменён';
  if (f.status === 'arrived') return 'Прибыл';
  if (f.status === 'diverted') return 'Отправлен на\nзапасной аэродром';
  if (f.status === 'suspended') return 'Приостановлено';
  if (f.status === 'expected') return 'Прибытие ожидается';
  const s = computeArrivalStatus(f);
  const exp = f.expectedDeparture ? new Date(f.expectedDeparture) : null;
  const time = exp ? `${String(exp.getHours()).padStart(2,'0')}:${String(exp.getMinutes()).padStart(2,'0')}` : '';
  if (s === 'delayed') return `Задержан до ${time}`;
  if (s === 'early') return `Ранний прилёт\n(ожидается в ${time})`;
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
  const type = req.query.type || 'departure';
  const table = type === 'departure' ? 'departures' : 'arrivals';
  let flights = await load(table);
  const showDep = req.query.showDeparted === 'true';
  const yesterday = new Date(getLocalNow()); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const cleaned = flights.filter(f => {
    if ((f.status === 'departed' || f.status === 'early_departed' || f.status === 'arrived') && f.scheduledDeparture)
      return f.scheduledDeparture.slice(0, 10) >= yesterdayStr;
    return true;
  });
  if (cleaned.length !== flights.length) {
    for (const f of flights) if (!cleaned.includes(f)) await deleteOne(f.id, table);
    flights = cleaned;
  }
  if (!showDep) {
    if (type === 'departure') flights = flights.filter(f => f.status !== 'departed' && f.status !== 'early_departed');
    else flights = flights.filter(f => f.status !== 'arrived');
  }
  flights = flights.map(f => ({ ...f, computedStatus: type==='departure'?computeStatus(f):computeArrivalStatus(f), statusText: type==='departure'?getStatusText(f):getArrivalStatusText(f), flightDay: getFlightDay(f) }));
  flights.sort((a, b) => (a.expectedDeparture||a.scheduledDeparture||'').localeCompare(b.expectedDeparture||b.scheduledDeparture||''));
  res.json(flights);
});

app.post('/api/flights', async (req, res) => {
  const type = req.query.type || 'departure';
  const f = { id: Date.now().toString(), flightNumber: req.body.flightNumber||'', destination: req.body.destination||'', iataCode: req.body.iataCode||'', airline: req.body.airline||'', scheduledDeparture: req.body.scheduledDeparture||null, expectedDeparture: req.body.expectedDeparture||null, checkInStart: req.body.checkInStart||null, checkInEnd: req.body.checkInEnd||null, checkInCounters: req.body.checkInCounters||'', boardingStart: req.body.boardingStart||null, boardingEnd: req.body.boardingEnd||null, boardingGate: req.body.boardingGate||'', status: req.body.status||'scheduled' };
  await saveOne(f, type==='departure'?'departures':'arrivals');
  res.status(201).json(f);
});

app.put('/api/flights/:id', async (req, res) => {
  const type = req.query.type || 'departure';
  const table = type==='departure'?'departures':'arrivals';
  const flights = await load(table);
  const i = flights.findIndex(f => f.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Не найден' });
  flights[i] = { ...flights[i], ...req.body, id: flights[i].id };
  await saveOne(flights[i], table);
  res.json(flights[i]);
});

app.delete('/api/flights/:id', async (req, res) => {
  await deleteOne(req.params.id, req.query.type==='departure'?'departures':'arrivals');
  res.status(204).send();
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Тюмень OK'));
module.exports = app;
