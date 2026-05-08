const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Хранилище рейсов
let flights = [];

// Вспомогательная: получить текущее время в часовом поясе +5 (Тюмень)
function getTyumenNow() {
  const now = new Date();
  // Преобразуем UTC в Тюменское время (UTC+5)
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (5 * 3600000));
}

// Автоматическое определение статуса
function computeFlightStatus(flight) {
  const now = getTyumenNow();
  
  if (flight.status === 'cancelled') return 'cancelled';

  const schedDep = flight.scheduledDeparture ? new Date(flight.scheduledDeparture) : null;
  const expectedDep = flight.expectedDeparture ? new Date(flight.expectedDeparture) : null;
  const checkInStart = flight.checkInStart ? new Date(flight.checkInStart) : null;
  const checkInEnd = flight.checkInEnd ? new Date(flight.checkInEnd) : null;
  const boardingStart = flight.boardingStart ? new Date(flight.boardingStart) : null;
  const boardingEnd = flight.boardingEnd ? new Date(flight.boardingEnd) : null;

  // Если есть ожидаемое время и оно позже расписания — задержка
  const isDelayed = expectedDep && schedDep && expectedDep.getTime() > schedDep.getTime();

  // Проверяем этапы
  if (boardingEnd && now > boardingEnd) return 'boarding_completed';
  if (boardingStart && now >= boardingStart && boardingEnd && now <= boardingEnd) return 'boarding';
  if (checkInEnd && now > checkInEnd && (!boardingStart || now < boardingStart)) return 'checkin_completed';
  if (checkInStart && now >= checkInStart && checkInEnd && now <= checkInEnd) return 'checkin';
  
  if (isDelayed && now < expectedDep) return 'delayed';
  
  return 'scheduled';
}

// Получить человекочитаемый статус
function getStatusText(flight) {
  const status = computeFlightStatus(flight);
  
  if (flight.status === 'cancelled') return 'Отменён';

  const expectedDep = flight.expectedDeparture ? new Date(flight.expectedDeparture) : null;
  const schedDep = flight.scheduledDeparture ? new Date(flight.scheduledDeparture) : null;
  const isDelayed = expectedDep && schedDep && expectedDep.getTime() > schedDep.getTime();

  const delayedTime = expectedDep ? expectedDep.toLocaleTimeString('ru-RU', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'Asia/Yekaterinburg'
  }) : '';

  let statusText = 'По расписанию';

  if (isDelayed) {
    switch (status) {
      case 'checkin': 
        statusText = `Задержан до ${delayedTime}\nРегистрация`; 
        break;
      case 'checkin_completed': 
        statusText = `Задержан до ${delayedTime}\nРегистрация закончена`; 
        break;
      case 'boarding': 
        statusText = `Задержан до ${delayedTime}\nПосадка`; 
        break;
      case 'boarding_completed': 
        statusText = `Задержан до ${delayedTime}\nПосадка закончена`; 
        break;
      default: 
        statusText = `Задержан до ${delayedTime}`; 
        break;
    }
  } else {
    switch (status) {
      case 'checkin': 
        statusText = 'Регистрация'; 
        break;
      case 'checkin_completed': 
        statusText = 'Регистрация закончена'; 
        break;
      case 'boarding': 
        statusText = 'Посадка'; 
        break;
      case 'boarding_completed': 
        statusText = 'Посадка закончена'; 
        break;
      default: 
        statusText = 'По расписанию'; 
        break;
    }
  }
  return statusText;
}

// API маршруты
app.get('/api/flights', (req, res) => {
  const sorted = [...flights].sort((a, b) => {
    const timeA = a.expectedDeparture ? new Date(a.expectedDeparture) : new Date(a.scheduledDeparture);
    const timeB = b.expectedDeparture ? new Date(b.expectedDeparture) : new Date(b.scheduledDeparture);
    return timeA - timeB;
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

// Отдаём index.html для всех остальных маршрутов
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

module.exports = app;
