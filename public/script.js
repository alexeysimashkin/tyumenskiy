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
function getTyumenNow() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (5 * 3600000));
}

setInterval(() => {
  const now = getTyumenNow();
  clockTime.textContent = now.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
}, 1000);

// Формат даты
const fmtDt = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}, ${h}:${m}`;
};

const fmtTm = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

const fmtDateOnly = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
};

const fmtTimeOnly = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

// Загрузка
async function load() {
  const r = await fetch(API);
  currentFlights = await r.json();
  renderBoard();
  renderAdmin();
  const now = getTyumenNow();
  lastUpdated.textContent = now.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
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

// Детали рейса
window.showDetail = function(id) {
  const f = currentFlights.find(x => x.id === id);
  if (!f) return;
  
  modalTitle.textContent = `Рейс ${f.flightNumber}`;
  
  let tagClass = 'tag-ok';
  let statusLabel = f.statusText;
  if (f.status === 'cancelled') tagClass = 'tag-cancel';
  else if (f.computedStatus === 'checkin') tagClass = 'tag-checkin';
  else if (f.computedStatus === 'checkin_completed') tagClass = 'tag-checkin-end';
  else if (f.computedStatus === 'boarding') tagClass = 'tag-boarding';
  else if (f.computedStatus === 'boarding_completed') tagClass = 'tag-boarding-end';
  else if (f.computedStatus === 'delayed') tagClass = 'tag-delay';

  const delayed = f.expectedDeparture && new Date(f.expectedDeparture) > new Date(f.scheduledDeparture);
  const delayHtml = delayed ? `
    <div class="modal-delay-banner">
      <i class="fas fa-clock"></i>
      <span>Задержан до ${fmtTm(f.expectedDeparture)}</span>
    </div>` : '';

  modalBody.innerHTML = `
    <div class="modal-fullscreen">
      <div class="modal-fs-header">
        <div class="modal-fs-flightnum">Рейс ${f.flightNumber}</div>
        <div class="modal-fs-airline">Выполняет: ${f.airline}</div>
      </div>
      ${delayHtml}
      <div class="modal-fs-destination">
        <h2>${f.destination}</h2>
        <span class="modal-fs-iata">${f.iataCode}</span>
      </div>
      <div class="modal-fs-info-row">
        <span>Россия</span>
        <span class="modal-fs-separator">•</span>
        <span>Международный аэропорт</span>
      </div>
      <div class="modal-fs-table">
        <div class="modal-fs-table-row header">
          <div>Дата вылета</div>
          <div>Время по расписанию</div>
          <div>Ожидаемое время</div>
          <div>Выход</div>
          <div>Терминал</div>
        </div>
        <div class="modal-fs-table-row">
          <div><strong>${fmtDateOnly(f.scheduledDeparture)}</strong></div>
          <div><strong>${fmtTimeOnly(f.scheduledDeparture)}</strong></div>
          <div><strong>${fmtTimeOnly(f.expectedDeparture || f.scheduledDeparture)}</strong></div>
          <div><strong>${f.boardingGate || '—'}</strong></div>
          <div><strong>А</strong></div>
        </div>
      </div>
      <div class="modal-fs-timeline">
        <h3>Регистрация</h3>
        <div class="timeline-items">
          <div class="timeline-item ${f.computedStatus === 'checkin_completed' || f.computedStatus === 'boarding' || f.computedStatus === 'boarding_completed' ? 'done' : ''}">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div class="timeline-time">${fmtTimeOnly(f.checkInStart)}</div>
              <div class="timeline-date">${fmtDateOnly(f.checkInStart)}</div>
              <div class="timeline-label">Начало регистрации${f.checkInCounters ? ' • Стойки ' + f.checkInCounters : ''}</div>
            </div>
          </div>
          <div class="timeline-item ${f.computedStatus === 'checkin_completed' || f.computedStatus === 'boarding' || f.computedStatus === 'boarding_completed' ? 'done' : ''}">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div class="timeline-time">${fmtTimeOnly(f.checkInEnd)}</div>
              <div class="timeline-date">${fmtDateOnly(f.checkInEnd)}</div>
              <div class="timeline-label">Окончание регистрации</div>
            </div>
          </div>
          <div class="timeline-item ${f.computedStatus === 'boarding' || f.computedStatus === 'boarding_completed' ? 'active' : ''}">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div class="timeline-time">${fmtTimeOnly(f.boardingStart)}</div>
              <div class="timeline-date">${fmtDateOnly(f.boardingStart)}</div>
              <div class="timeline-label">Начало посадки${f.boardingGate ? ' • Выход ' + f.boardingGate : ''}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-fs-status">
        <span class="status-tag ${tagClass}" style="font-size:15px;padding:10px 24px;">${statusLabel.replace(/\n/g,'<br>')}</span>
      </div>
      <div class="modal-fs-extra">
        <div class="modal-fs-extra-item">
          <span class="extra-label">Время вылета по расписанию</span>
          <span class="extra-value">${fmtDt(f.scheduledDeparture)}</span>
        </div>
        <div class="modal-fs-extra-item">
          <span class="extra-label">Ожидаемое время вылета</span>
          <span class="extra-value">${fmtDt(f.expectedDeparture)}</span>
        </div>
        <div class="modal-fs-extra-item">
          <span class="extra-label">Выход на посадку</span>
          <span class="extra-value">${f.boardingGate || '—'}</span>
        </div>
      </div>
    </div>`;

  modalOverlay.classList.add('show');
  document.body.style.overflow = 'hidden';
};

// Закрытие модалки
$('modalClose').onclick = () => {
  modalOverlay.classList.remove('show');
  document.body.style.overflow = '';
};
modalOverlay.onclick = e => { 
  if (e.target === modalOverlay) {
    modalOverlay.classList.remove('show');
    document.body.style.overflow = '';
  }
};
document.addEventListener('keydown', e => { 
  if (e.key === 'Escape') {
    modalOverlay.classList.remove('show');
    document.body.style.overflow = '';
  }
});

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
  
  // Берём дату как есть и обрезаем до "YYYY-MM-DDTHH:MM"
  $('scheduledDeparture').value = f.scheduledDeparture ? f.scheduledDeparture.slice(0, 16) : '';
  $('expectedDeparture').value = f.expectedDeparture ? f.expectedDeparture.slice(0, 16) : '';
  $('checkInStart').value = f.checkInStart ? f.checkInStart.slice(0, 16) : '';
  $('checkInEnd').value = f.checkInEnd ? f.checkInEnd.slice(0, 16) : '';
  $('boardingStart').value = f.boardingStart ? f.boardingStart.slice(0, 16) : '';
  $('boardingEnd').value = f.boardingEnd ? f.boardingEnd.slice(0, 16) : '';
  
  $('checkInCounters').value = f.checkInCounters || '';
  $('boardingGate').value = f.boardingGate || '';
  $('status').value = f.status;
  flightForm.style.display = 'block';
  flightForm.scrollIntoView({ behavior: 'smooth' });
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
  
  // Сохраняем ТОЧНО то, что ввёл пользователь (без конвертации в UTC)
  const body = {
    flightNumber: $('flightNumber').value,
    airline: $('airline').value,
    destination: $('destination').value,
    iataCode: $('iataCode').value.toUpperCase(),
    scheduledDeparture: $('scheduledDeparture').value ? $('scheduledDeparture').value + ':00' : null,
    expectedDeparture: $('expectedDeparture').value ? $('expectedDeparture').value + ':00' : null,
    checkInStart: $('checkInStart').value ? $('checkInStart').value + ':00' : null,
    checkInEnd: $('checkInEnd').value ? $('checkInEnd').value + ':00' : null,
    checkInCounters: $('checkInCounters').value,
    boardingStart: $('boardingStart').value ? $('boardingStart').value + ':00' : null,
    boardingEnd: $('boardingEnd').value ? $('boardingEnd').value + ':00' : null,
    boardingGate: $('boardingGate').value,
    status: $('status').value
  };
  
  const url = editingId ? `${API}/${editingId}` : API;
  await fetch(url, { 
    method: editingId?'PUT':'POST', 
    headers:{'Content-Type':'application/json'}, 
    body:JSON.stringify(body) 
  });
  flightForm.style.display = 'none';
  editingId = null;
  load();
};

// Автообновление
setInterval(load, 30000);
load();
