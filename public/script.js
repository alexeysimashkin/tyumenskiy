let currentFlights = [];
let editingId = null;
const API = '/api/flights';

const $ = id => document.getElementById(id);
const clockTime = $('clockTime');
const lastUpdated = $('lastUpdated');
const tbody = $('flightsTableBody');
const adminPanel = $('adminPanel');
const flightForm = $('flightForm');
const formTitle = $('formTitle');
const adminList = $('adminFlightsList');
const modalOverlay = $('modalOverlay');
const modalBody = $('modalBody');
const modalTitle = $('modalTitle');

// Часы
setInterval(() => {
  const d = new Date();
  clockTime.textContent = d.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
}, 1000);

// Формат
const fmtDt = s => s ? new Date(s).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
const fmtTm = s => s ? new Date(s).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }) : '—';

// Загрузка
async function load() {
  const r = await fetch(API);
  currentFlights = await r.json();
  renderBoard();
  renderAdmin();
  lastUpdated.textContent = new Date().toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
}

// Табло
function renderBoard() {
  if (!currentFlights.length) {
    tbody.innerHTML = `<tr class="empty"><td colspan="6"><div class="empty-msg"><i class="fas fa-plane"></i><p>Нет рейсов</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = currentFlights.map(f => {
    const delayed = f.expectedDeparture && new Date(f.expectedDeparture) > new Date(f.scheduledDeparture);
    const cancelled = f.status === 'cancelled';
    let timeHtml = cancelled ? `<span class="time-old">${fmtTm(f.scheduledDeparture)}</span>` :
      delayed ? `<span class="time-old">${fmtTm(f.scheduledDeparture)}</span><br><span class="time-new">${fmtTm(f.expectedDeparture)}</span>` :
      fmtTm(f.scheduledDeparture);
    let tagClass = 'tag-ok';
    if (cancelled) tagClass = 'tag-cancel';
    else if (f.computedStatus === 'checkin') tagClass = 'tag-checkin';
    else if (f.computedStatus === 'checkin_completed') tagClass = 'tag-checkin-end';
    else if (f.computedStatus === 'boarding') tagClass = 'tag-boarding';
    else if (f.computedStatus === 'boarding_completed') tagClass = 'tag-boarding-end';
    else if (f.computedStatus === 'delayed') tagClass = 'tag-delay';
    return `<tr onclick="showDetail('${f.id}')">
      <td class="time-cell">${timeHtml}</td>
      <td><div class="dest-cell"><span class="dest-name">${f.destination}</span><span class="dest-iata">${f.iataCode}</span></div></td>
      <td class="flight-num">${f.flightNumber}</td>
      <td><div class="airline-cell"><div class="airline-avatar">${f.airline.charAt(0)}</div>${f.airline}</div></td>
      <td class="gate-cell">${f.boardingGate || '—'}</td>
      <td><span class="status-tag ${tagClass}">${f.statusText.replace(/\n/g,'<br>')}</span></td>
    </tr>`;
  }).join('');
}

// Админка
function renderAdmin() {
  if (!currentFlights.length) {
    adminList.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:20px;">Нет рейсов</p>';
    return;
  }
  adminList.innerHTML = currentFlights.map(f => {
    let tagClass = 'tag-ok';
    if (f.status === 'cancelled') tagClass = 'tag-cancel';
    else if (f.computedStatus === 'checkin') tagClass = 'tag-checkin';
    else if (f.computedStatus === 'checkin_completed') tagClass = 'tag-checkin-end';
    else if (f.computedStatus === 'boarding') tagClass = 'tag-boarding';
    else if (f.computedStatus === 'boarding_completed') tagClass = 'tag-boarding-end';
    else if (f.computedStatus === 'delayed') tagClass = 'tag-delay';
    return `<div class="admin-row">
      <div class="admin-row-info">
        <span class="admin-row-number">${f.flightNumber}</span>
        <span class="admin-row-route">${f.destination} (${f.iataCode})</span>
        <span style="font-size:12px;color:var(--gray-400);">${fmtDt(f.scheduledDeparture)}</span>
        <span class="status-tag ${tagClass}" style="font-size:10px;">${f.statusText}</span>
      </div>
      <div class="admin-row-actions">
        <button class="btn-icon" onclick="event.stopPropagation();editFlight('${f.id}')"><i class="fas fa-pen"></i></button>
        <button class="btn-icon danger" onclick="event.stopPropagation();deleteFlight('${f.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

// Детали
window.showDetail = function(id) {
  const f = currentFlights.find(x => x.id === id);
  if (!f) return;
  modalTitle.textContent = `Рейс ${f.flightNumber}`;
  let tagClass = 'tag-ok';
  if (f.status === 'cancelled') tagClass = 'tag-cancel';
  else if (f.computedStatus === 'checkin') tagClass = 'tag-checkin';
  else if (f.computedStatus === 'checkin_completed') tagClass = 'tag-checkin-end';
  else if (f.computedStatus === 'boarding') tagClass = 'tag-boarding';
  else if (f.computedStatus === 'boarding_completed') tagClass = 'tag-boarding-end';
  else if (f.computedStatus === 'delayed') tagClass = 'tag-delay';
  modalBody.innerHTML = `
    <div class="modal-flight-top">
      <div>
        <div class="modal-flight-num">${f.flightNumber}</div>
        <div class="modal-flight-dest">${f.destination}</div>
        <div class="modal-flight-iata">Код IATA: ${f.iataCode}</div>
      </div>
      <span class="status-tag ${tagClass}" style="font-size:14px;">${f.statusText.replace(/\n/g,'<br>')}</span>
    </div>
    <div class="modal-grid">
      <div class="modal-cell"><label>Авиакомпания</label><div class="val">${f.airline}</div></div>
      <div class="modal-cell"><label>Вылет по расписанию</label><div class="val">${fmtDt(f.scheduledDeparture)}</div></div>
      <div class="modal-cell"><label>Ожидаемый вылет</label><div class="val">${fmtDt(f.expectedDeparture)}</div></div>
      <div class="modal-cell"><label>Регистрация</label><div class="val">${fmtDt(f.checkInStart)} — ${fmtDt(f.checkInEnd)}</div></div>
      <div class="modal-cell"><label>Стойки</label><div class="val">${f.checkInCounters || '—'}</div></div>
      <div class="modal-cell"><label>Посадка</label><div class="val">${fmtDt(f.boardingStart)} — ${fmtDt(f.boardingEnd)}</div></div>
      <div class="modal-cell"><label>Выход (Gate)</label><div class="val">${f.boardingGate || '—'}</div></div>
      <div class="modal-cell"><label>Статус</label><div class="val">${f.statusText.replace(/\n/g, ' ')}</div></div>
    </div>
    <div class="modal-status-big"><span class="status-tag ${tagClass}" style="font-size:16px;">${f.statusText.replace(/\n/g,'<br>')}</span></div>`;
  modalOverlay.classList.add('show');
};

// Закрытие модалки
$('modalClose').onclick = () => modalOverlay.classList.remove('show');
modalOverlay.onclick = e => { if (e.target === modalOverlay) modalOverlay.classList.remove('show'); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') modalOverlay.classList.remove('show'); });

// Админка переключатель
$('adminToggle').onclick = () => {
  const vis = adminPanel.style.display !== 'none';
  adminPanel.style.display = vis ? 'none' : 'block';
};

// Добавить рейс
$('addFlightBtn').onclick = () => {
  editingId = null;
  formTitle.textContent = 'Новый рейс';
  $('flightFormInner').reset();
  $('flightId').value = '';
  flightForm.style.display = 'block';
};

$('cancelForm').onclick = () => { flightForm.style.display = 'none'; };

// Редактировать
window.editFlight = function(id) {
  const f = currentFlights.find(x => x.id === id);
  if (!f) return;
  editingId = id;
  formTitle.textContent = 'Редактировать рейс';
  $('flightId').value = f.id;
  $('flightNumber').value = f.flightNumber;
  $('airline').value = f.airline;
  $('destination').value = f.destination;
  $('iataCode').value = f.iataCode;
  $('scheduledDeparture').value = f.scheduledDeparture?.slice(0,16)||'';
  $('expectedDeparture').value = f.expectedDeparture?.slice(0,16)||'';
  $('checkInStart').value = f.checkInStart?.slice(0,16)||'';
  $('checkInEnd').value = f.checkInEnd?.slice(0,16)||'';
  $('checkInCounters').value = f.checkInCounters||'';
  $('boardingStart').value = f.boardingStart?.slice(0,16)||'';
  $('boardingEnd').value = f.boardingEnd?.slice(0,16)||'';
  $('boardingGate').value = f.boardingGate||'';
  $('status').value = f.status;
  flightForm.style.display = 'block';
};

// Удалить
window.deleteFlight = async function(id) {
  if (!confirm('Удалить рейс?')) return;
  await fetch(`${API}/${id}`, { method:'DELETE' });
  load();
};

// Сохранить
$('flightFormInner').onsubmit = async function(e) {
  e.preventDefault();
  const body = {
    flightNumber: $('flightNumber').value,
    airline: $('airline').value,
    destination: $('destination').value,
    iataCode: $('iataCode').value.toUpperCase(),
    scheduledDeparture: new Date($('scheduledDeparture').value).toISOString(),
    expectedDeparture: $('expectedDeparture').value ? new Date($('expectedDeparture').value).toISOString() : null,
    checkInStart: $('checkInStart').value ? new Date($('checkInStart').value).toISOString() : null,
    checkInEnd: $('checkInEnd').value ? new Date($('checkInEnd').value).toISOString() : null,
    checkInCounters: $('checkInCounters').value,
    boardingStart: $('boardingStart').value ? new Date($('boardingStart').value).toISOString() : null,
    boardingEnd: $('boardingEnd').value ? new Date($('boardingEnd').value).toISOString() : null,
    boardingGate: $('boardingGate').value,
    status: $('status').value
  };
  const url = editingId ? `${API}/${editingId}` : API;
  await fetch(url, { method: editingId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  flightForm.style.display = 'none';
  editingId = null;
  load();
};

// Автообновление
setInterval(load, 30000);
load();
