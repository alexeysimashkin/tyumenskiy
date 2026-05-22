let currentFlights = [];
let editingId = null;
let currentTab = 'today';
let showDeparted = false;
const API = '/api/flights';

const $ = id => document.getElementById(id);
const clockTime = $('clockTime');
const lastUpdated = $('lastUpdated');
const lastUpdated2 = $('lastUpdated2');
const flightsToday = $('flightsToday');
const flightsTomorrow = $('flightsTomorrow');
const adminPanel = $('adminPanel');
const flightForm = $('flightForm');
const formTitle = $('formTitle');
const adminList = $('adminFlightsList');
const modalOverlay = $('modalOverlay');
const modalBody = $('modalBody');
const modalTitle = $('modalTitle');
const toggleDeparted = $('toggleDeparted');

const LOCAL_OFFSET = 5 * 60;
function getLocalNow() {
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcMs + (LOCAL_OFFSET * 60000));
}

setInterval(() => {
  const now = getLocalNow();
  if (clockTime) clockTime.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}, 1000);

function fmtTm(s) {
  if (!s) return '—';
  const d = new Date(s);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function fmtDt(s) {
  if (!s) return '—';
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function fmtDateOnly(s) {
  if (!s) return '—';
  const d = new Date(s);
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

async function load() {
  try {
    const r = await fetch(`${API}?showDeparted=${showDeparted}`);
    currentFlights = await r.json();
    renderAll();
    const now = getLocalNow();
    const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    if (lastUpdated) lastUpdated.textContent = ts;
    if (lastUpdated2) lastUpdated2.textContent = ts;
  } catch(e) { console.log('Ошибка загрузки:', e); }
}

function getTagClass(f) {
  if (f.status === 'cancelled') return 'tag-cancel';
  if (f.status === 'departed') return 'tag-departed';
  if (f.computedStatus === 'checkin') return 'tag-checkin';
  if (f.computedStatus === 'checkin_completed') return 'tag-checkin-end';
  if (f.computedStatus === 'boarding') return 'tag-boarding';
  if (f.computedStatus === 'boarding_completed') return 'tag-boarding-end';
  if (f.computedStatus === 'delayed') return 'tag-delay';
  return 'tag-ok';
}

function renderFlightRow(f) {
  const delayed = f.expectedDeparture && new Date(f.expectedDeparture) > new Date(f.scheduledDeparture);
  const departed = f.status === 'departed';
  const cancelled = f.status === 'cancelled';
  
  let timeHtml;
  if (cancelled || departed) {
    timeHtml = `<span class="time-old">${fmtTm(f.scheduledDeparture)}</span>`;
  } else if (delayed) {
    timeHtml = `<span class="time-old">${fmtTm(f.scheduledDeparture)}</span><br><span class="time-new">${fmtTm(f.expectedDeparture)}</span>`;
  } else {
    timeHtml = fmtTm(f.scheduledDeparture);
  }
  
  return `<tr onclick="showDetail('${f.id}')" style="${departed ? 'opacity:0.6;' : ''}">
    <td class="time-cell">${timeHtml}</td>
    <td><div class="dest-cell"><span class="dest-name">${f.destination}</span><span class="dest-iata">${f.iataCode || ''}</span></div></td>
    <td class="flight-num">${f.flightNumber}</td>
    <td><div class="airline-cell"><div class="airline-avatar">${(f.airline || 'A').charAt(0)}</div>${f.airline || ''}</div></td>
    <td class="gate-cell">${f.boardingGate || '—'}</td>
    <td><span class="status-tag ${getTagClass(f)}">${(f.statusText || 'По расписанию').replace(/\n/g,'<br>')}</span></td>
  </tr>`;
}

function renderAll() {
  const adminFlights = showDeparted ? currentFlights : currentFlights.filter(f => f.status !== 'departed');
  
  if (adminList) {
    if (!adminFlights.length) {
      adminList.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:20px;">Нет рейсов</p>';
    } else {
      adminList.innerHTML = adminFlights.map(f => `
        <div class="admin-row">
          <div class="admin-row-info">
            <span class="admin-row-number">${f.flightNumber}</span>
            <span class="admin-row-route">${f.destination} (${f.iataCode || ''})</span>
            <span class="status-tag ${getTagClass(f)}" style="font-size:10px;">${(f.statusText || '').replace(/\n/g,' ')}</span>
          </div>
          <div class="admin-row-actions">
            <button class="btn-icon" onclick="event.stopPropagation();editFlight('${f.id}')"><i class="fas fa-pen"></i></button>
            <button class="btn-icon danger" onclick="event.stopPropagation();deleteFlight('${f.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `).join('');
    }
  }
  
  const todayFlights = currentFlights.filter(f => {
    if (f.status === 'departed') return showDeparted;
    const day = f.flightDay || 'today';
    return day === 'today';
  });
  
  if (flightsToday) {
    flightsToday.innerHTML = todayFlights.length === 0
      ? `<tr class="empty"><td colspan="6"><div class="empty-msg"><i class="fas fa-plane"></i><p>Нет рейсов на сегодня</p></div></td></tr>`
      : todayFlights.map(renderFlightRow).join('');
  }
  
  const tomorrowFlights = currentFlights.filter(f => {
    if (f.status === 'departed') return false;
    const day = f.flightDay || 'today';
    return day === 'tomorrow';
  });
  
  if (flightsTomorrow) {
    flightsTomorrow.innerHTML = tomorrowFlights.length === 0
      ? `<tr class="empty"><td colspan="6"><div class="empty-msg"><i class="fas fa-plane"></i><p>Нет рейсов на завтра</p></div></td></tr>`
      : tomorrowFlights.map(renderFlightRow).join('');
  }
}

window.showDetail = function(id) {
  const f = currentFlights.find(x => x.id === id);
  if (!f) return;
  
  if (modalTitle) modalTitle.textContent = `Рейс ${f.flightNumber}`;
  
  const delayed = f.expectedDeparture && new Date(f.expectedDeparture) > new Date(f.scheduledDeparture);
  const delayHtml = delayed ? `<div class="modal-delay-banner"><i class="fas fa-clock"></i><span>Задержан до ${fmtTm(f.expectedDeparture)}</span></div>` : '';
  
  if (modalBody) {
    modalBody.innerHTML = `
      <div class="modal-flight-top">
        <div>
          <div class="modal-flight-num">${f.flightNumber}</div>
          <div class="modal-flight-airline">Выполняет: ${f.airline || '—'}</div>
        </div>
        <span class="status-tag ${getTagClass(f)}" style="font-size:14px;">${(f.statusText || 'По расписанию').replace(/\n/g,'<br>')}</span>
      </div>
      ${delayHtml}
      <div class="modal-fs-destination">
        <h2>${f.destination}</h2>
        <span class="modal-fs-iata">${f.iataCode || ''}</span>
      </div>
      <div class="modal-fs-info-row"><span>Россия</span></div>
      <div class="modal-fs-table">
        <div class="modal-fs-table-row header">
          <div>Дата вылета</div><div>Время по расписанию</div><div>Ожидаемое время</div><div>Выход</div><div>Терминал</div>
        </div>
        <div class="modal-fs-table-row">
          <div><strong>${fmtDateOnly(f.scheduledDeparture)}</strong></div>
          <div><strong>${fmtTm(f.scheduledDeparture)}</strong></div>
          <div><strong>${fmtTm(f.expectedDeparture || f.scheduledDeparture)}</strong></div>
          <div><strong>${f.boardingGate || '—'}</strong></div>
          <div><strong>А</strong></div>
        </div>
      </div>
      <div class="modal-fs-timeline">
        <h3>Регистрация</h3>
        <div class="timeline-items">
          <div class="timeline-item ${['checkin_completed','boarding','boarding_completed','departed'].includes(f.computedStatus) ? 'done' : ''}">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div class="timeline-time">${fmtTm(f.checkInStart)}</div>
              <div class="timeline-label">Начало регистрации${f.checkInCounters ? ' • Стойки ' + f.checkInCounters : ''}</div>
            </div>
          </div>
          <div class="timeline-item ${['checkin_completed','boarding','boarding_completed','departed'].includes(f.computedStatus) ? 'done' : ''}">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div class="timeline-time">${fmtTm(f.checkInEnd)}</div>
              <div class="timeline-label">Окончание регистрации</div>
            </div>
          </div>
          ${f.boardingStart ? `
          <div class="timeline-item ${['boarding','boarding_completed','departed'].includes(f.computedStatus) ? 'active' : ''}">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div class="timeline-time">${fmtTm(f.boardingStart)}</div>
              <div class="timeline-label">Посадка${f.boardingGate ? ' • Выход ' + f.boardingGate : ''}</div>
            </div>
          </div>` : ''}
        </div>
      </div>
      <div class="modal-fs-status">
        <span class="status-tag ${getTagClass(f)}" style="font-size:15px;padding:10px 24px;">${(f.statusText || 'По расписанию').replace(/\n/g,'<br>')}</span>
      </div>
      <div class="modal-fs-extra">
        <div class="modal-fs-extra-item"><span class="extra-label">Авиакомпания</span><span class="extra-value">${f.airline || '—'}</span></div>
        <div class="modal-fs-extra-item"><span class="extra-label">Вылет по расписанию</span><span class="extra-value">${fmtDt(f.scheduledDeparture)}</span></div>
        <div class="modal-fs-extra-item"><span class="extra-label">Ожидаемый вылет</span><span class="extra-value">${fmtDt(f.expectedDeparture)}</span></div>
        <div class="modal-fs-extra-item"><span class="extra-label">Выход на посадку</span><span class="extra-value">${f.boardingGate || '—'}</span></div>
      </div>`;
  }
  
  if (modalOverlay) {
    modalOverlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
};

if (modalClose) modalClose.onclick = () => { modalOverlay.classList.remove('show'); document.body.style.overflow = ''; };
if (modalOverlay) modalOverlay.onclick = e => { if (e.target === modalOverlay) { modalOverlay.classList.remove('show'); document.body.style.overflow = ''; } };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalOverlay) { modalOverlay.classList.remove('show'); document.body.style.overflow = ''; } });

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    const boardToday = $('boardToday');
    const boardTomorrow = $('boardTomorrow');
    if (boardToday) boardToday.style.display = currentTab === 'today' ? '' : 'none';
    if (boardTomorrow) boardTomorrow.style.display = currentTab === 'tomorrow' ? '' : 'none';
  });
});

if (toggleDeparted) {
  toggleDeparted.addEventListener('click', () => {
    showDeparted = !showDeparted;
    toggleDeparted.classList.toggle('active', showDeparted);
    toggleDeparted.innerHTML = showDeparted ? '<i class="fas fa-eye-slash"></i> <span class="hide-mobile">Скрыть вылетевшие</span>' : '<i class="fas fa-eye"></i> <span class="hide-mobile">Показать вылетевшие</span>';
    load();
  });
}

if (adminToggle) adminToggle.onclick = () => { adminPanel.style.display = adminPanel.style.display !== 'none' ? 'none' : 'block'; };
if ($('addFlightBtn')) $('addFlightBtn').onclick = () => { editingId = null; formTitle.textContent = 'Новый рейс'; $('flightFormInner').reset(); $('flightId').value = ''; $('status').value = 'scheduled'; flightForm.style.display = 'block'; };
if ($('cancelForm')) $('cancelForm').onclick = () => { flightForm.style.display = 'none'; };

window.editFlight = function(id) {
  const f = currentFlights.find(x => x.id === id);
  if (!f) return;
  editingId = id;
  formTitle.textContent = 'Редактировать рейс';
  $('flightId').value = f.id;
  $('flightNumber').value = f.flightNumber;
  $('airline').value = f.airline;
  $('destination').value = f.destination;
  $('iataCode').value = f.iataCode || '';
  $('scheduledDeparture').value = f.scheduledDeparture ? f.scheduledDeparture.slice(0, 16) : '';
  $('expectedDeparture').value = f.expectedDeparture ? f.expectedDeparture.slice(0, 16) : '';
  $('checkInStart').value = f.checkInStart ? f.checkInStart.slice(0, 16) : '';
  $('checkInEnd').value = f.checkInEnd ? f.checkInEnd.slice(0, 16) : '';
  $('checkInCounters').value = f.checkInCounters || '';
  $('boardingStart').value = f.boardingStart ? f.boardingStart.slice(0, 16) : '';
  $('boardingEnd').value = f.boardingEnd ? f.boardingEnd.slice(0, 16) : '';
  $('boardingGate').value = f.boardingGate || '';
  $('status').value = f.status;
  flightForm.style.display = 'block';
};

window.deleteFlight = async function(id) {
  if (!confirm('Удалить рейс?')) return;
  await fetch(`${API}/${id}`, { method:'DELETE' });
  load();
};

if ($('flightFormInner')) {
  $('flightFormInner').onsubmit = async function(e) {
    e.preventDefault();
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
    await fetch(url, { method: editingId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    flightForm.style.display = 'none';
    editingId = null;
    load();
  };
}

setInterval(load, 30000);
load();
