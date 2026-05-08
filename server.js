const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Файл для хранения рейсов (чтобы не пропадали при перезагрузке)
const DATA_FILE = path.join(__dirname, 'data', 'flights.json');

// Загружаем рейсы из файла
let flights = [];
try {
  if (fs.existsSync(DATA_FILE)) {
    flights = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  }
} catch (e) {
  console.log('Не удалось загрузить данные, начинаем с пустого');
}

// Сохраняем рейсы в файл
function saveFlights() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(flights, null, 2));
  } catch (e) {
    console.log('Не удалось сохранить данные:', e.message);
  }
}

// Тюменское время (UTC+5)
const TYUMEN_OFFSET = 5 * 60;

function getTyumenNow() {
  const now = new Date();
  const utcMinutes = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcMinutes + (TYUMEN_OFFSET * 60000));
}

// Парсим строку как тюменское время
function parseTyumenDate(dateStr) {
  if (!dateStr) return null;
  const [datePart, timePart] = dateStr.split('T');
  if (!datePart) return null;
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = (timePart || '00:00:00').split(':').map(Number);
  // Создаём UTC дату и вычитаем 5 часов
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

// Определение статуса — ИСПРАВЛЕННАЯ ЛОГИКА
function computeFlightStatus(flight) {
  if (flight.status === 'cancelled') return 'cancelled';

  const now = getTyumenNow();
  
  const boardingStart = parseTyumenDate(flight.boardingStart);
  const boardingEnd = parseTyumenDate(flight.boardingEnd);
  const checkInStart = parseTyumenDate(flight.checkInStart);
  const checkInEnd = parseTyumenDate(flight.checkInEnd);
  const schedDep = parseTyumenDate(flight.scheduledDeparture);
  const expectedDep = parseTyumenDate(flight.expectedDeparture);

  const isDelayed = expectedDep && schedDep && expectedDep.getTime() > schedDep.getTime();

  // ПРОВЕРЯЕМ В ПРАВИЛЬНОМ ПОРЯДКЕ: от самого позднего к самому раннему
  
  // 1. Посадка закончена: сейчас ПОЗЖЕ окончания посадки
  if (boardingEnd && now.getTime() > boardingEnd.getTime()) {
    return 'boarding_completed';
  }
  
  // 2. Идёт посадка: сейчас МЕЖДУ началом и окончанием посадки
  if (boardingStart && boardingEnd && 
      now.getTime() >= boardingStart.getTime() && 
      now.getTime() <= boardingEnd.getTime()) {
    return 'boarding';
  }
  
  // 3. Регистрация закончена: сейчас ПОЗЖЕ конца регистрации, но посадка ещё не началась
  if (checkInEnd && now.getTime() > checkInEnd.getTime() && 
      (!boardingStart || now.getTime() < boardingStart.getTime())) {
    return 'checkin_completed';
  }
  
  // 4. Идёт регистрация: сейчас МЕЖДУ началом и концом регистрации
  if (checkInStart && checkInEnd && 
      now.getTime() >= checkInStart.getTime() && 
      now.getTime() <= checkInEnd.getTime()) {
    return 'checkin';
  }
  
  // 5. Задержан
  if (isDelayed && now.getTime() < expectedDep.getTime()) {
    return 'delayed';
  }
  
  return 'scheduled';
}

function getStatusText(flight) {
  if (flight.status === 'cancelled') return 'Отменён';

  const status = computeFlightStatus(flight);
  
  const expectedDep = parseTyumenDate(flight.expectedDeparture);
  const schedDep = parseTyumenDate(flight.scheduledDeparture);
  const isDelayed = expectedDep && schedDep && expectedDep.getTime() > schedDep.getTime();
  const delayedTime = expectedDep ? formatTyumenTime(expectedDep) : '';

  let statusText = 'По расписанию';

  if (isDelayed) {
    switch (status) {
      case 'checkin': statusText = `Задержан до ${delayedTime}\nРегистрация`; break;
      case 'checkin_completed': statusText = `Задержан до ${delayedTime}\nРегистрация закончена`; break;
      case 'boarding': statusText = `Задержан до ${delayedTime}\nПосадка`; break;
      case 'boarding_completed': statusText = `Задержан до ${delayedTime}\nПосадка закончена`; break;
      default: statusText = `Задержан до ${delayedTime}`; break;
    }
  } else {
    switch (status) {
      case 'checkin': statusText = 'Регистрация'; break;
      case 'checkin_completed': statusText = 'Регистрация закончена'; break;
      case 'boarding': statusText = 'Посадка'; break;
      case 'boarding_completed': statusText = 'Посадка закончена'; break;
      default: statusText = 'По расписанию'; break;
    }
  }
  return statusText;
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
