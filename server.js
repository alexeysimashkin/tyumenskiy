const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let flights = [];

// ВСЕ ДАТЫ ХРАНЯТСЯ И ОБРАБАТЫВАЮТСЯ КАК ТЮМЕНСКОЕ ВРЕМЯ (UTC+5)
const TYUMEN_OFFSET = 5 * 60; // +5 часов в минутах

// Получить текущее тюменское время
function getTyumenNow() {
  const now = new Date();
  const utcMinutes = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcMinutes + (TYUMEN_OFFSET * 60000));
}

// Парсим дату из строки КАК ТЮМЕНСКОЕ ВРЕМЯ
// Строка приходит в формате "2025-05-08T15:00:00" — это Тюменское время
function parseTyumenDate(dateStr) {
  if (!dateStr) return null;
  // Разбираем строку вручную, чтобы не было конвертации UTC
  const [datePart, timePart] = dateStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = (timePart || '00:00:00').split(':').map(Number);
  
  // Создаём дату в UTC, которая соответствует тюменскому времени
  // Например: 15:00 Тюмень = 10:00 UTC
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds || 0));
  // Вычитаем 5 часов, потому что Date.UTC создаёт UTC-время, а нам нужно чтобы 15:00 считалось как 15:00 тюменского
  const tyumenMs = utcDate.getTime() - (TYUMEN_OFFSET * 60000);
  return new Date(tyumenMs);
}

// Форматирование времени для отображения (из тюменской даты)
function formatTyumenTime(date) {
  if (!date) return '';
  // Прибавляем 5 часов к UTC-времени чтобы получить тюменское
  const tyumenMs = date.getTime() + (TYUMEN_OFFSET * 60000);
  const d = new Date(tyumenMs);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// Автоматическое определение статуса
function computeFlightStatus(flight) {
  if (flight.status === 'cancelled') return 'cancelled';

  const now = getTyumenNow();
  
  const schedDep = parseTyumenDate(flight.scheduledDeparture);
  const expectedDep = parseTyumenDate(flight.expectedDeparture);
  const checkInStart = parseTyumenDate(flight.checkInStart);
  const checkInEnd = parseTyumenDate(flight.checkInEnd);
  const boardingStart = parseTyumenDate(flight.boardingStart);
  const boardingEnd = parseTyumenDate(flight.boardingEnd);

  // Сравниваем getTime() — они все теперь в одной системе (смещённые UTC)
  if (boardingEnd && now.getTime() >= boardingEnd.getTime()) return 'boarding_completed';
  if (boardingStart && now.getTime() >= boardingStart.getTime() && boardingEnd && now.getTime() < boardingEnd.getTime()) return 'boarding';
  if (checkInEnd && now.getTime() >= checkInEnd.getTime() && (!boardingStart || now.getTime() < boardingStart.getTime())) return 'checkin_completed';
  if (checkInStart && now.getTime() >= checkInStart.getTime() && checkInEnd && now.getTime() < checkInEnd.getTime()) return 'checkin';
  
  const isDelayed = expectedDep && schedDep && expectedDep.getTime() > schedDep.getTime();
  if (isDelayed && now.getTime() < expectedDep.getTime()) return 'delayed';
  
  return 'scheduled';
}

// Получить текст статуса
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
  res.status(201).json(flight);
});

app.put('/api/flights/:id', (req, res) => {
  const index = flights.findIndex(f => f.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Рейс не найден' });
  
  const updated = { ...flights[index], ...req.body, id: flights[index].id };
  flights[index] = updated;
  res.json(updated);
});

app.delete('/api/flights/:id', (req, res) => {
  flights = flights.filter(f => f.id !== req.params.id);
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
