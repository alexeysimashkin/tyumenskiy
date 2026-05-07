// Глобальные переменные
let currentFlights = [];
let editingFlightId = null;
const API_BASE = '/api/flights';

// DOM элементы
const clockEl = document.getElementById('clock');
const lastUpdatedEl = document.getElementById('lastUpdated');
const flightsTableBody = document.getElementById('flightsTableBody');
const adminPanel = document.getElementById('adminPanel');
const adminToggle = document.getElementById('adminToggle');
const flightForm = document.getElementById('flightForm');
const formTitle = document.getElementById('formTitle');
const adminFlightsList = document.getElementById('adminFlightsList');
const modalOverlay = document.getElementById('modalOverlay');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');

// Часы
function updateClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// Форматирование даты
function formatDateTime(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatTime(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// Загрузка рейсов
async function loadFlights() {
  try {
    const res = await fetch(API_BASE);
    currentFlights = await res.json();
    renderBoard();
    renderAdminList();
    lastUpdatedEl.textContent = new Date().toLocaleTimeString('ru-RU');
  } catch (err) {
    console.error('Ошибка загрузки рейсов:', err);
  }
}

// Рендер табло
function renderBoard() {
  if (currentFlights.length === 0) {
    flightsTableBody.innerHTML = `
      <tr class="no-flights">
        <td colspan="6">
          <i class="fas fa-plane"></i>
          <p>Нет рейсов для отображения</p>
        </td>
      </tr>`;
    return;
  }

  flightsTableBody.innerHTML = currentFlights.map(flight => {
    const statusClass = getStatusClass(flight);
    const isDelayed = flight.computedStatus === 'delayed' || 
      (flight.expectedDeparture && new Date(flight.expectedDeparture) > new Date(flight.scheduledDeparture));
    const isCancelled = flight.status === 'cancelled' || flight.computedStatus === 'cancelled';

    let timeHtml = '';
    if (isCancelled) {
      timeHtml = `<span class="time-original">${formatTime(flight.scheduledDeparture)}</span>`;
    } else if (isDelayed && flight.expectedDeparture) {
      timeHtml = `
        <span class="time-original">${formatTime(flight.scheduledDeparture)}</span><br>
        <span class="time-new">${formatTime(flight.expectedDeparture)}</span>`;
    } else {
      timeHtml = formatTime(flight.scheduledDeparture);
    }

    return `
      <tr onclick="showFlightDetails('${flight.id}')">
        <td>${timeHtml}</td>
        <td>
          <div class="flight-destination">
            ${flight.destination}
            <span class="destination-iata">${flight.iataCode}</span>
          </div>
        </td>
        <td><strong>${flight.flightNumber}</strong></td>
        <td>${flight.airline}</td>
        <td>${flight.boardingGate || '—'}</td>
        <td>
          <span class="status-badge ${statusClass}">${flight.statusText.replace(/\n/g, '<br>')}</span>
          ${isDelayed && flight.expectedDeparture && !isCancelled ? 
            `<div class="delayed-info">Задержан до ${formatTime(flight.expectedDeparture)}</div>` : ''}
        </td>
      </tr>`;
  }).join('');
}

function getStatusClass(flight) {
  if (flight.status === 'cancelled' || flight.computedStatus === 'cancelled') return 'status-cancelled';
  switch (flight.computedStatus) {
    case 'scheduled': return 'status-scheduled';
    case 'checkin': return 'status-checkin';
    case 'checkin_completed': return 'status-checkin_completed';
    case 'boarding': return 'status-boarding';
    case 'boarding_completed': return 'status-boarding_completed';
    case 'delayed': return 'status-delayed';
    default: return 'status-scheduled';
  }
}

// Рендер списка в админке
function renderAdminList() {
  if (currentFlights.length === 0) {
    adminFlightsList.innerHTML = '<p style="color:#999; text-align:center; padding:20px;">Нет рейсов. Добавьте первый рейс.</p>';
    return;
  }

  adminFlightsList.innerHTML = currentFlights.map(flight => `
    <div class="admin-flights-item">
      <div class="admin-flights-info">
        <span class="flight-number">${flight.flightNumber}</span>
        <span>${flight.destination} (${flight.iataCode})</span>
        <span>${formatDateTime(flight.scheduledDeparture)}</span>
        <span class="status-badge ${getStatusClass(flight)}">${flight.statusText}</span>
      </div>
      <div class="admin-flights-actions">
        <button class="btn-edit" onclick="editFlight('${flight.id}')">
          <i class="fas fa-pen"></i> Ред.
        </button>
        <button class="btn-delete" onclick="deleteFlight('${flight.id}')">
          <i class="fas fa-trash"></i> Удалить
        </button>
      </div>
    </div>
  `).join('');
}

// Показать детали рейса
window.showFlightDetails = function(id) {
  const flight = currentFlights.find(f => f.id === id);
  if (!flight) return;

  document.getElementById('modalTitle').textContent = `Рейс ${flight.flightNumber}`;
  
  modalBody.innerHTML = `
    <div class="modal-flight-header">
      <div>
        <div class="modal-flight-number">${flight.flightNumber}</div>
        <div class="modal-destination">${flight.destination}</div>
        <div class="modal-iata">Код ИАТА: ${flight.iataCode}</div>
      </div>
      <div>
        <span class="status-badge ${getStatusClass(flight)}" style="font-size:16px;">${flight.statusText.replace(/\n/g, '<br>')}</span>
      </div>
    </div>
    <div class="modal-detail-grid">
      <div class="modal-detail-item">
        <label>Авиакомпания</label>
        <div class="value">${flight.airline}</div>
      </div>
      <div class="modal-detail-item">
        <label>Время вылета по расписанию</label>
        <div class="value">${formatDateTime(flight.scheduledDeparture)}</div>
      </div>
      <div class="modal-detail-item">
        <label>Ожидаемое время вылета</label>
        <div class="value">${formatDateTime(flight.expectedDeparture)}</div>
      </div>
      <div class="modal-detail-item">
        <label>Дата и время вылета</label>
        <div class="value">${formatDateTime(flight.expectedDeparture || flight.scheduledDeparture)}</div>
      </div>
      <div class="modal-detail-item">
        <label>Регистрация</label>
        <div class="value">${formatDateTime(flight.checkInStart)} — ${formatDateTime(flight.checkInEnd)}</div>
      </div>
      <div class="modal-detail-item">
        <label>Стойки регистрации</label>
        <div class="value">${flight.checkInCounters || '—'}</div>
      </div>
      <div class="modal-detail-item">
        <label>Посадка</label>
        <div class="value">${formatDateTime(flight.boardingStart)} — ${formatDateTime(flight.boardingEnd)}</div>
      </div>
      <div class="modal-detail-item">
        <label>Выход на посадку</label>
        <div class="value">${flight.boardingGate || '—'}</div>
      </div>
    </div>
    <div class="modal-status">
      <span class="status-badge ${getStatusClass(flight)}" style="font-size:18px;">
        ${flight.statusText.replace(/\n/g, '<br>')}
      </span>
    </div>
  `;

  modalOverlay.style.display = 'flex';
};

// Закрытие модалки
modalClose.addEventListener('click', () => {
  modalOverlay.style.display = 'none';
});
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) modalOverlay.style.display = 'none';
});

// Админ панель
adminToggle.addEventListener('click', () => {
  const isVisible = adminPanel.style.display !== 'none';
  adminPanel.style.display = isVisible ? 'none' : 'block';
  adminToggle.innerHTML = isVisible ? 
    '<i class="fas fa-cog"></i> Администрирование' : 
    '<i class="fas fa-times"></i> Закрыть';
});

// Форма
document.getElementById('addFlightBtn').addEventListener('click', () => {
  editingFlightId = null;
  formTitle.textContent = 'Добавить рейс';
  document.getElementById('flightFormInner').reset();
  document.getElementById('flightId').value = '';
  document.getElementById('status').value = 'scheduled';
  flightForm.style.display = 'block';
  flightForm.scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('cancelForm').addEventListener('click', () => {
  flightForm.style.display = 'none';
  editingFlightId = null;
});

// Редактирование рейса
window.editFlight = function(id) {
  const flight = currentFlights.find(f => f.id === id);
  if (!flight) return;

  editingFlightId = id;
  formTitle.textContent = `Редактировать рейс ${flight.flightNumber}`;
  
  document.getElementById('flightId').value = flight.id;
  document.getElementById('flightNumber').value = flight.flightNumber;
  document.getElementById('airline').value = flight.airline;
  document.getElementById('destination').value = flight.destination;
  document.getElementById('iataCode').value = flight.iataCode;
  document.getElementById('scheduledDeparture').value = flight.scheduledDeparture.slice(0, 16);
  document.getElementById('expectedDeparture').value = flight.expectedDeparture ? flight.expectedDeparture.slice(0, 16) : '';
  document.getElementById('checkInStart').value = flight.checkInStart ? flight.checkInStart.slice(0, 16) : '';
  document.getElementById('checkInEnd').value = flight.checkInEnd ? flight.checkInEnd.slice(0, 16) : '';
  document.getElementById('checkInCounters').value = flight.checkInCounters || '';
  document.getElementById('boardingStart').value = flight.boardingStart ? flight.boardingStart.slice(0, 16) : '';
  document.getElementById('boardingEnd').value = flight.boardingEnd ? flight.boardingEnd.slice(0, 16) : '';
  document.getElementById('boardingGate').value = flight.boardingGate || '';
  document.getElementById('status').value = flight.status;

  flightForm.style.display = 'block';
  flightForm.scrollIntoView({ behavior: 'smooth' });
};

// Удаление рейса
window.deleteFlight = async function(id) {
  if (!confirm('Вы уверены, что хотите удалить этот рейс?')) return;
  try {
    await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    await loadFlights();
  } catch (err) {
    console.error('Ошибка удаления:', err);
  }
};

// Отправка формы
document.getElementById('flightFormInner').addEventListener('submit', async function(e) {
  e.preventDefault();

  const flightData = {
    flightNumber: document.getElementById('flightNumber').value,
    airline: document.getElementById('airline').value,
    destination: document.getElementById('destination').value,
    iataCode: document.getElementById('iataCode').value.toUpperCase(),
    scheduledDeparture: new Date(document.getElementById('scheduledDeparture').value).toISOString(),
    expectedDeparture: document.getElementById('expectedDeparture').value ? 
      new Date(document.getElementById('expectedDeparture').value).toISOString() : null,
    checkInStart: document.getElementById('checkInStart').value ? 
      new Date(document.getElementById('checkInStart').value).toISOString() : null,
    checkInEnd: document.getElementById('checkInEnd').value ? 
      new Date(document.getElementById('checkInEnd').value).toISOString() : null,
    checkInCounters: document.getElementById('checkInCounters').value,
    boardingStart: document.getElementById('boardingStart').value ? 
      new Date(document.getElementById('boardingStart').value).toISOString() : null,
    boardingEnd: document.getElementById('boardingEnd').value ? 
      new Date(document.getElementById('boardingEnd').value).toISOString() : null,
    boardingGate: document.getElementById('boardingGate').value,
    status: document.getElementById('status').value
  };

  try {
    if (editingFlightId) {
      await fetch(`${API_BASE}/${editingFlightId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flightData)
      });
    } else {
      await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flightData)
      });
    }

    flightForm.style.display = 'none';
    editingFlightId = null;
    await loadFlights();
  } catch (err) {
    console.error('Ошибка сохранения:', err);
    alert('Ошибка при сохранении рейса');
  }
});

// Обновление каждые 30 секунд
setInterval(loadFlights, 30000);
loadFlights();

// Закрытие модалки по Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') modalOverlay.style.display = 'none';
});
