const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data', 'flights.json');

let flights = [];
try {
  if (fs.existsSync(DATA_FILE)) {
    flights = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  }
} catch (e) {
  console.log('Начинаем с пустого');
}

function saveFlights() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(flights, null, 2));
  } catch (e) {
    console.log('Ошибка сохранения:', e.message);
  }
}

const TYUMEN_OFFSET = 5 * 60;

function getTyumenNow() {
  const now = new Date();
  const utcMinutes = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcMinutes + (TYUMEN_OFFSET * 60000));
}

function parseTyumenDate(dateStr) {
  if (!dateStr) return null;
  const [datePart, timePart] = dateStr.split('T');
  if (!datePart) return null;
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = (timePart || '00:00:00').split(':').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds || 0));
  return new Date(utcDate.getTime() - (TYUMEN_OFFSET * 60000));
}

function formatTyumenTime(date) {
  if (!date) return '';
  const tyumenMs = date.getTime() + (TYUMEN_OFFSET * 60000);
  const d = new Date(tyumenMs);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// НОВАЯ ЖЕЛЕЗНАЯ ЛОГИКА СТАТУСОВ
function computeFlightStatus(flight) {
  if (flight.status === 'cancelled') return 'cancelled';

  const now = getTyumenNow().getTime();
  
  const checkInStart = parseTyumenDate(flight.checkInStart);
  const checkInEnd = parseTyumenDate(flight.checkInEnd);
  const boardingStart = parseTyumenDate(flight.boardingStart);
  const boardingEnd = parseTyumenDate(flight.boardingEnd);
  
  const checkInStartTime = checkInStart ? checkInStart.getTime() : null;
  const checkInEndTime = checkInEnd ? checkInEnd.getTime() : null;
  const boardingStartTime = boardingStart ? boardingStart.getTime() : null;
  const boardingEndTime = boardingEnd ? boardingEnd.getTime() : null;

  const schedDep = parseTyumenDate(flight.scheduledDeparture);
  const expectedDep = parseTyumenDate(flight.expectedDeparture);
  const isDelayed = expectedDep && schedDep && expectedDep.getTime() > schedDep.getTime();

  // Проверяем статусы СТРОГО по времени: от самого активного к менее активному
  
  // 1. Посадка закончена: время окончания посадки ПРОШЛО
  if (boardingEndTime !== null && now > boardingEndTime) {
    return 'boarding_completed';
  }
  
  // 2. Идёт посадка: сейчас МЕЖДУ началом и концом посадки (включая границы)
  if (boardingStartTime !== null && boardingEndTime !== null && 
      now >= boardingStartTime && now <= boardingEndTime) {
    return 'boarding';
  }
  
  // 3. Регистрация закончена: время окончания регистрации ПРОШЛО, но посадка ещё не началась
  if (checkInEndTime !== null && now > checkInEndTime) {
    // Если посадка ещё не началась — показываем "регистрация закончена"
    if (!boardingStartTime || now < boardingStartTime) {
      return 'checkin_completed';
    }
  }
  
  // 4. Идёт регистрация: сейчас МЕЖДУ началом и концом регистрации
  if (checkInStartTime !== null && checkInEndTime !== null && 
      now >= checkInStartTime && now <= checkInEndTime) {
    return 'checkin';
  }
  
  // 5. Задержан
  if (isDelayed && expectedDep && now < expectedDep.getTime()) {
    return 'delayed';
  }
  
  // 6. Всё остальное — по расписанию
  return 'scheduled';
}

function getStatusText(flight) {
  if (flight.status === 'cancelled') return 'Отменён';

  const status = computeFlightStatus(flight);
  
  const expectedDep = parseTyumenDate(flight.expectedDeparture);
  const schedDep = parseTyumenDate(flight.scheduledDeparture);
  const isDelayed = expectedDep && schedDep && expectedDep.getTime() > schedDep.getTime();
  const delayedTime = expectedDep ? formatTyumenTime(expectedDep) : '';

  if (isDelayed) {
    switch (status) {
      case 'checkin': return `Задержан до ${delayedTime}\nРегистрация`;
      case 'checkin_completed': return `Задержан до ${delayedTime}\nРегистрация закончена`;
      case 'boarding': return `Задержан до ${delayedTime}\nПосадка`;
      case 'boarding_completed': return `Задержан до ${delayedTime}\nПосадка закончена`;
      default: return `Задержан до ${delayedTime}`;
    }
  } else {
    switch (status) {
      case 'checkin': return 'Регистрация';
      case 'checkin_completed': return 'Регистрация закончена';
      case 'boarding': return 'Посадка';
      case 'boarding_completed': return 'Посадка закончена';
      default: return 'По расписанию';
    }
  }
}

// API
app.get('/api/flights', (req, res) => {
  const sorted = [...flights].sort((a, b) => {
    const timeA = parseTyumenDate(a.expectedDeparture || a.scheduledDeparture);
    const timeB = parseTyumenDate(b.expectedDeparture || b.scheduledDeparture);
    if (!timeA || !timeB) return 0;
    return timeA.getTime() - timeB.getTime();
  });
  
  const enriched = sorted.map(f => ({
    ...f,
    computedStatus: computeFlightStatus(f),
    statusText: getStatusText(f)
  }));
  res.json(enriched);
});

app.post('/api/flights', (req, res) => {
  const flight = {
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
  flights.push(flight);
  saveFlights();
  res.status(201).json(flight);
});

app.put('/api/flights/:id', (req, res) => {
  const index = flights.findIndex(f => f.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Рейс не найден' });
  
  const updated = { ...flights[index], ...req.body, id: flights[index].id };
  flights[index] = updated;
  saveFlights();
  res.json(updated);
});

app.delete('/api/flights/:id', (req, res) => {
  flights = flights.filter(f => f.id !== req.params.id);
  saveFlights();
  res.status(204).send();
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

module.exports = app;
