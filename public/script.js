let currentFlights = [];
let editingFlightId = null;
const API_BASE = '/api/flights';

const clockEl = document.getElementById('clock');
const clockSecEl = document.getElementById('clockSec');
const clockDateEl = document.getElementById('clockDate');
const lastUpdatedEl = document.getElementById('lastUpdated');
const flightsTableBody = document.getElementById('flightsTableBody');
const adminPanel = document.getElementById('adminPanel');
const adminToggle = document.getElementById('adminToggle');
const flightForm = document.getElementById('flightForm');
const formTitle = document.getElementById('formTitle');
const adminFlightsList = document.getElementById('adminFlightsList');
const modalOverlay = document.getElementById('modalOverlay');
const modalBody = document.getElementById('modalBody');
const modalBadge = document.getElementById('modalBadge');
const modalClose = document.getElementById('modalClose');

function updateClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  clockSecEl.textContent = now.toLocaleTimeString('ru-RU', { second: '2-digit' });
  clockDateEl.textContent = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
setInterval(updateClock, 1000);
updateClock();

function formatDateTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function formatTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
}

async function loadFlights() {
  try {
    const res = await fetch(API_BASE);
    currentFlights = await res.json();
    renderBoard();
    renderAdminList();
    lastUpdatedEl.textContent = new Date().toLocaleTimeString('ru-RU');
  } catch(e) { console.error(e); }
}

function getStatusClass(flight) {
  if (flight.status === 'cancelled' || flight.computedStatus === 'cancelled') return 'status-cancelled';
  switch(flight.computedStatus) {
    case 'checkin': return 'status-checkin';
    case 'checkin_completed': return 'status-checkin_completed';
    case 'boarding': return 'status-boarding';
    case 'boarding_completed': return 'status-boarding_completed';
    case 'delayed': return 'status-delayed';
    default: return 'status-scheduled';
  }
}

function renderBoard() {
  if (!currentFlights.length) {
    flightsTableBody.innerHTML = `<tr class="empty-state"><td colspan="6"><div class="empty-state-content"><i class="fas fa-cloud-moon"></i><p>Нет активных рейсов</p><span>Добавьте рейсы через панель управления</span></div></td></tr>`;
    return;
  }
  flightsTableBody.innerHTML = currentFlights.map(f => {
    const isDelayed = (f.expectedDeparture && new Date(f.expectedDeparture) > new Date(f.scheduledDeparture));
    const isCancelled = f.status === 'cancelled';
    let timeHtml = isCancelled ? `<span class="time-original">${formatTime(f.scheduledDeparture)}</span>` :
      isDelayed ? `<span class="time-original">${formatTime(f.scheduledDeparture)}</span><br><span class="time-new">${formatTime(f.expectedDeparture)}</span>` :
      formatTime(f.scheduledDeparture);
    return `<tr onclick="showFlightDetails('${f.id}')">
      <td><div class="time-block">${timeHtml}</div></td>
      <td><div class="dest-cell"><span class="dest-name">${f.destination}</span><span class="dest-iata-code">${f.iataCode}</span></div></td>
      <td><span class="flight-num-cell">${f.flightNumber}</span></td>
      <td><div class="airline-cell"><div class="airline-icon">${f.airline.charAt(0)}</div>${f.airline}</div></td>
      <td><span class="gate-cell">${f.boardingGate || '—'}</span></td>
      <td><span class="status-pill ${getStatusClass(f)}">${f.statusText.replace(/\n/g,'<br>')}</span></td>
    </tr>`;
  }).join('');
}

function renderAdminList() {
  if (!currentFlights.length) {
    adminFlightsList.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:30px;">Нет рейсов</p>';
    return;
  }
  adminFlightsList.innerHTML = currentFlights.map(f => `
    <div class="admin-flight-card">
      <div class="admin-flight-info">
        <span class="admin-flight-number">${f.flightNumber}</span>
        <span class="admin-flight-route">${f.destination} (${f.iataCode})</span>
        <span style="color:var(--text-dim);font-size:13px;">${formatDateTime(f.scheduledDeparture)}</span>
        <span class="status-pill ${getStatusClass(f)}" style="font-size:10px;">${f.statusText}</span>
      </div>
      <div class="admin-actions">
        <button class="btn-ghost" onclick="event.stopPropagation();editFlight('${f.id}')"><i class="fas fa-pen"></i></button>
        <button class="btn-ghost danger" onclick="event.stopPropagation();deleteFlight('${f.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

window.showFlightDetails = function(id) {
  const f = currentFlights.find(x => x.id === id);
  if (!f) return;
  modalBadge.textContent = f.flightNumber;
  document.getElementById('modalTitle').textContent = `${f.destination} (${f.iataCode})`;
  modalBody.innerHTML = `
    <div class="modal-flight-main">
      <div>
        <div class="modal-main-number">${f.flightNumber}</div>
        <div class="modal-main-route">${f.destination}</div>
        <div class="modal-main-iata">IATA: ${f.iataCode}</div>
      </div>
      <span class="status-pill ${getStatusClass(f)}" style="font-size:14px;">${f.statusText.replace(/\n/g,'<br>')}</span>
    </div>
    <div class="modal-detail-grid">
      <div class="modal-detail-card"><label>Авиакомпания</label><div class="value">${f.airline}</div></div>
      <div class="modal-detail-card"><label>Вылет по расписанию</label><div class="value">${formatDateTime(f.scheduledDeparture)}</div></div>
      <div class="modal-detail-card"><label>Ожидаемый вылет</label><div class="value">${formatDateTime(f.expectedDeparture)}</div></div>
      <div class="modal-detail-card"><label>Регистрация</label><div class="value">${formatDateTime(f.checkInStart)} — ${formatDateTime(f.checkInEnd)}</div></div>
      <div class="modal-detail-card"><label>Стойки</label><div class="value">${f.checkInCounters || '—'}</div></div>
      <div class="modal-detail-card"><label>Посадка</label><div class="value">${formatDateTime(f.boardingStart)} — ${formatDateTime(f.boardingEnd)}</div></div>
      <div class="modal-detail-card"><label>Gate</label><div class="value">${f.boardingGate || '—'}</div></div>
      <div class="modal-detail-card"><label>Статус</label><div class="value">${f.statusText.replace(/\n/g, ' ')}</div></div>
    </div>
    <div class="modal-status-block">
      <span class="status-pill ${getStatusClass(f)}" style="font-size:16px;">${f.statusText.replace(/\n/g,'<br>')}</span>
    </div>`;
  modalOverlay.style.display = 'flex';
};

modalClose.onclick = () => modalOverlay.style.display = 'none';
modalOverlay.onclick = e => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') modalOverlay.style.display = 'none'; });

adminToggle.onclick = () => {
  const visible = adminPanel.style.display !== 'none';
  adminPanel.style.display = visible ? 'none' : 'block';
  adminToggle.innerHTML = visible ? '<i class="fas fa-sliders"></i><span>Управление</span>' : '<i class="fas fa-times"></i><span>Закрыть</span>';
};

document.getElementById('addFlightBtn').onclick = () => {
  editingFlightId = null;
  formTitle.textContent = 'Новый рейс';
  document.getElementById('flightFormInner').reset();
  document.getElementById('flightId').value = '';
  flightForm.style.display = 'block';
};

document.getElementById('cancelForm').onclick = () => { flightForm.style.display = 'none'; };

window.editFlight = function(id) {
  const f = currentFlights.find(x => x.id === id);
  if (!f) return;
  editingFlightId = id;
  formTitle.textContent = 'Редактирование';
  document.getElementById('flightId').value = f.id;
  document.getElementById('flightNumber').value = f.flightNumber;
  document.getElementById('airline').value = f.airline;
  document.getElementById('destination').value = f.destination;
  document.getElementById('iataCode').value = f.iataCode;
  document.getElementById('scheduledDeparture').value = f.scheduledDeparture?.slice(0,16)||'';
  document.getElementById('expectedDeparture').value = f.expectedDeparture?.slice(0,16)||'';
  document.getElementById('checkInStart').value = f.checkInStart?.slice(0,16)||'';
  document.getElementById('checkInEnd').value = f.checkInEnd?.slice(0,16)||'';
  document.getElementById('checkInCounters').value = f.checkInCounters||'';
  document.getElementById('boardingStart').value = f.boardingStart?.slice(0,16)||'';
  document.getElementById('boardingEnd').value = f.boardingEnd?.slice(0,16)||'';
  document.getElementById('boardingGate').value = f.boardingGate||'';
  document.getElementById('status').value = f.status;
  flightForm.style.display = 'block';
};

window.deleteFlight = async function(id) {
  if (!confirm('Удалить рейс?')) return;
  await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  loadFlights();
};

document.getElementById('flightFormInner').onsubmit = async function(e) {
  e.preventDefault();
  const data = {
    flightNumber: document.getElementById('flightNumber').value,
    airline: document.getElementById('airline').value,
    destination: document.getElementById('destination').value,
    iataCode: document.getElementById('iataCode').value.toUpperCase(),
    scheduledDeparture: new Date(document.getElementById('scheduledDeparture').value).toISOString(),
    expectedDeparture: document.getElementById('expectedDeparture').value ? new Date(document.getElementById('expectedDeparture').value).toISOString() : null,
    checkInStart: document.getElementById('checkInStart').value ? new Date(document.getElementById('checkInStart').value).toISOString() : null,
    checkInEnd: document.getElementById('checkInEnd').value ? new Date(document.getElementById('checkInEnd').value).toISOString() : null,
    checkInCounters: document.getElementById('checkInCounters').value,
    boardingStart: document.getElementById('boardingStart').value ? new Date(document.getElementById('boardingStart').value).toISOString() : null,
    boardingEnd: document.getElementById('boardingEnd').value ? new Date(document.getElementById('boardingEnd').value).toISOString() : null,
    boardingGate: document.getElementById('boardingGate').value,
    status: document.getElementById('status').value
  };
  const url = editingFlightId ? `${API_BASE}/${editingFlightId}` : API_BASE;
  await fetch(url, { method: editingFlightId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  flightForm.style.display = 'none';
  editingFlightId = null;
  loadFlights();
};

setInterval(loadFlights, 30000);
loadFlights();
