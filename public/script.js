let currentMode = 'departure';
let editingId = null;
let showDepartedDep = false;
let showDepartedArr = false;
let currentTabDep = 'today';
let currentTabArr = 'today';
let flightsDep = [];
let flightsArr = [];
const API = '/api/flights';

const $ = id => document.getElementById(id);

const clockTime = $('clockTime');
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

function getYesterday() { const d = getLocalNow(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }
function getToday() { return getLocalNow().toISOString().slice(0,10); }
function getTomorrow() { const d = getLocalNow(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); }

document.querySelectorAll('.main-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.main-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    $('modeDeparture').style.display = currentMode === 'departure' ? '' : 'none';
    $('modeArrival').style.display = currentMode === 'arrival' ? '' : 'none';
    if (currentMode === 'departure') loadDep();
    else loadArr();
  });
});

// ============ ВЫЛЕТ ============
async function loadDep() {
  try {
    const r = await fetch(`${API}?type=departure&showDeparted=true`);
    flightsDep = await r.json();
    renderAllDep();
    const now = getLocalNow();
    const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    if ($('lastUpdatedDep')) $('lastUpdatedDep').textContent = ts;
    if ($('lastUpdatedDep2')) $('lastUpdatedDep2').textContent = ts;
    if ($('lastUpdatedDepY')) $('lastUpdatedDepY').textContent = ts;
  } catch(e) { console.log(e); }
}

function getTagClass(f) {
  if (f.status === 'cancelled') return 'tag-cancel';
  if (f.status === 'departed' || f.status === 'early_departed') return 'tag-departed';
  if (f.status === 'suspended') return 'tag-suspended';
  if (f.computedStatus === 'early') return 'tag-early';
  if (f.computedStatus === 'checkin') return 'tag-checkin';
  if (f.computedStatus === 'checkin_completed') return 'tag-checkin-end';
  if (f.computedStatus === 'boarding') return 'tag-boarding';
  if (f.computedStatus === 'boarding_completed') return 'tag-boarding-end';
  if (f.computedStatus === 'delayed') return 'tag-delay';
  return 'tag-ok';
}

function renderFlightRow(f, showDepartedBtn) {
  const delayed = f.expectedDeparture && new Date(f.expectedDeparture) > new Date(f.scheduledDeparture);
  const early = f.computedStatus === 'early';
  const departed = f.status === 'departed' || f.status === 'early_departed';
  const cancelled = f.status === 'cancelled';
  
  let timeHtml;
  if (cancelled || departed) {
    timeHtml = `<span class="time-old">${fmtTm(f.scheduledDeparture)}</span>`;
  } else if (delayed || early) {
    timeHtml = `<span class="time-old">${fmtTm(f.scheduledDeparture)}</span><br><span class="time-new">${fmtTm(f.expectedDeparture)}</span>`;
  } else {
    timeHtml = fmtTm(f.scheduledDeparture);
  }
  
  const hideDeparted = !showDepartedBtn && departed;
  if (hideDeparted) return '';
  
  return `<tr onclick="showDetail('${f.id}', 'departure')" style="${departed ? 'opacity:0.6;' : ''}">
    <td class="time-cell">${timeHtml}</td>
    <td><div class="dest-cell"><span class="dest-name">${f.destination}</span><span class="dest-iata">${f.iataCode || ''}</span></div></td>
    <td class="flight-num">${f.flightNumber}</td>
    <td><div class="airline-cell"><div class="airline-avatar">${(f.airline || 'A').charAt(0)}</div>${f.airline || ''}</div></td>
    <td><span class="gate-cell">${f.boardingGate || '—'}</span></td>
    <td><span class="status-tag ${getTagClass(f)}">${(f.statusText || 'По расписанию').replace(/\n/g,'<br>')}</span></td>
  </tr>`;
}

function getDateStr(f) {
  const d = f.expectedDeparture 
    ? new Date(f.expectedDeparture) 
    : f.scheduledDeparture 
      ? new Date(f.scheduledDeparture) 
      : null;
  if (!d || isNaN(d.getTime())) return getToday();
  return d.toISOString().slice(0, 10);
}

function renderAllDep() {
  const adminFlights = showDepartedDep ? flightsDep : flightsDep.filter(f => f.status !== 'departed' && f.status !== 'early_departed');
  
  if ($('adminFlightsListDep')) {
    if (!adminFlights.length) {
      $('adminFlightsListDep').innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:20px;">Нет рейсов</p>';
    } else {
      $('adminFlightsListDep').innerHTML = adminFlights.map(f => `<div class="admin-row"><div class="admin-row-info"><span class="admin-row-number">${f.flightNumber}</span><span class="admin-row-route">${f.destination} (${f.iataCode||''})</span><span class="status-tag ${getTagClass(f)}" style="font-size:10px;">${(f.statusText||'').replace(/\n/g,' ')}</span></div><div class="admin-row-actions"><button class="btn-icon" onclick="event.stopPropagation();editFlightDep('${f.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon danger" onclick="event.stopPropagation();deleteFlightDep('${f.id}')"><i class="fas fa-trash"></i></button></div></div>`).join('');
    }
  }
  
  const yesterday = getYesterday();
  const yesterdayFlights = flightsDep.filter(f => getDateStr(f) === yesterday);
  if ($('flightsYesterdayDep')) {
    $('flightsYesterdayDep').innerHTML = yesterdayFlights.length === 0
      ? `<tr class="empty"><td colspan="6"><div class="empty-msg"><i class="fas fa-plane"></i><p>Нет рейсов за вчера</p></div></td></tr>`
      : yesterdayFlights.map(f => renderFlightRow(f, true)).join('');
  }
  
  const today = getToday();
  const todayFlights = flightsDep.filter(f => {
    if (f.status === 'departed' || f.status === 'early_departed') return showDepartedDep;
    return getDateStr(f) === today;
  });
  if ($('flightsTodayDep')) {
    $('flightsTodayDep').innerHTML = todayFlights.length === 0
      ? `<tr class="empty"><td colspan="6"><div class="empty-msg"><i class="fas fa-plane"></i><p>Нет рейсов на сегодня</p></div></td></tr>`
      : todayFlights.map(f => renderFlightRow(f, showDepartedDep)).join('');
  }
  
  const tomorrow = getTomorrow();
  const tomorrowFlights = flightsDep.filter(f => {
    if (f.status === 'departed' || f.status === 'early_departed') return false;
    return getDateStr(f) === tomorrow;
  });
  if ($('flightsTomorrowDep')) {
    $('flightsTomorrowDep').innerHTML = tomorrowFlights.length === 0
      ? `<tr class="empty"><td colspan="6"><div class="empty-msg"><i class="fas fa-plane"></i><p>Нет рейсов на завтра</p></div></td></tr>`
      : tomorrowFlights.map(f => renderFlightRow(f, false)).join('');
  }
}

// ============ ПРИЛЁТ ============
async function loadArr() {
  try {
    const r = await fetch(`${API}?type=arrival&showDeparted=true`);
    flightsArr = await r.json();
    renderAllArr();
    const now = getLocalNow();
    const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    if ($('lastUpdatedArr')) $('lastUpdatedArr').textContent = ts;
    if ($('lastUpdatedArr2')) $('lastUpdatedArr2').textContent = ts;
    if ($('lastUpdatedArrY')) $('lastUpdatedArrY').textContent = ts;
  } catch(e) { console.log(e); }
}

function getTagClassArr(f) {
  if (f.status === 'cancelled') return 'tag-cancel';
  if (f.status === 'arrived') return 'tag-departed';
  if (f.status === 'diverted') return 'tag-diverted';
  if (f.status === 'suspended') return 'tag-suspended';
  if (f.status === 'expected') return 'tag-ok';
  if (f.status === 'delayed') return 'tag-delay';
  if (f.status === 'early') return 'tag-early';
  return 'tag-ok';
}

function renderFlightRowArr(f, showArrived) {
  const delayed = f.expectedDeparture && new Date(f.expectedDeparture) > new Date(f.scheduledDeparture);
  const early = f.status === 'early';
  const arrived = f.status === 'arrived';
  const cancelled = f.status === 'cancelled';
  let timeHtml;
  if (cancelled || arrived) timeHtml = `<span class="time-old">${fmtTm(f.scheduledDeparture)}</span>`;
  else if (delayed || early) timeHtml = `<span class="time-old">${fmtTm(f.scheduledDeparture)}</span><br><span class="time-new">${fmtTm(f.expectedDeparture)}</span>`;
  else timeHtml = fmtTm(f.scheduledDeparture);
  if (!showArrived && arrived) return '';
  return `<tr onclick="showDetail('${f.id}', 'arrival')" style="${arrived?'opacity:0.6;':''}"><td class="time-cell">${timeHtml}</td><td><div class="dest-cell"><span class="dest-name">${f.destination}</span><span class="dest-iata">${f.iataCode||''}</span></div></td><td class="flight-num">${f.flightNumber}</td><td><div class="airline-cell"><div class="airline-avatar">${(f.airline||'A').charAt(0)}</div>${f.airline||''}</div></td><td><span class="gate-cell">${f.boardingGate||'—'}</span></td><td><span class="status-tag ${getTagClassArr(f)}">${(f.statusText||'По расписанию').replace(/\n/g,'<br>')}</span></td></tr>`;
}

function renderAllArr() {
  const adminFlights = showDepartedArr ? flightsArr : flightsArr.filter(f => f.status !== 'arrived');
  if ($('adminFlightsListArr')) {
    $('adminFlightsListArr').innerHTML = adminFlights.length === 0 ? '<p style="text-align:center;color:var(--gray-400);padding:20px;">Нет рейсов</p>' : adminFlights.map(f => `<div class="admin-row"><div class="admin-row-info"><span class="admin-row-number">${f.flightNumber}</span><span class="admin-row-route">${f.destination} (${f.iataCode||''})</span><span class="status-tag ${getTagClassArr(f)}" style="font-size:10px;">${(f.statusText||'').replace(/\n/g,' ')}</span></div><div class="admin-row-actions"><button class="btn-icon" onclick="event.stopPropagation();editFlightArr('${f.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon danger" onclick="event.stopPropagation();deleteFlightArr('${f.id}')"><i class="fas fa-trash"></i></button></div></div>`).join('');
  }
  
  const yesterday = getYesterday();
  const yesterdayFlights = flightsArr.filter(f => getDateStr(f) === yesterday);
  if ($('flightsYesterdayArr')) {
    $('flightsYesterdayArr').innerHTML = yesterdayFlights.length === 0 ? `<tr class="empty"><td colspan="6"><div class="empty-msg"><i class="fas fa-plane-arrival"></i><p>Нет рейсов за вчера</p></div></td></tr>` : yesterdayFlights.map(f => renderFlightRowArr(f, true)).join('');
  }
  
  const today = getToday();
  const todayFlights = flightsArr.filter(f => { if (f.status === 'arrived') return showDepartedArr; return getDateStr(f) === today; });
  if ($('flightsTodayArr')) {
    $('flightsTodayArr').innerHTML = todayFlights.length === 0 ? `<tr class="empty"><td colspan="6"><div class="empty-msg"><i class="fas fa-plane-arrival"></i><p>Нет рейсов на сегодня</p></div></td></tr>` : todayFlights.map(f => renderFlightRowArr(f, showDepartedArr)).join('');
  }
  
  const tomorrow = getTomorrow();
  const tomorrowFlights = flightsArr.filter(f => { if (f.status === 'arrived') return false; return getDateStr(f) === tomorrow; });
  if ($('flightsTomorrowArr')) {
    $('flightsTomorrowArr').innerHTML = tomorrowFlights.length === 0 ? `<tr class="empty"><td colspan="6"><div class="empty-msg"><i class="fas fa-plane-arrival"></i><p>Нет рейсов на завтра</p></div></td></tr>` : tomorrowFlights.map(f => renderFlightRowArr(f, false)).join('');
  }
}

// ============ ДЕТАЛИ РЕЙСА ============
window.showDetail = function(id, type) {
  const flights = type === 'departure' ? flightsDep : flightsArr;
  const f = flights.find(x => x.id === id);
  if (!f) return;
  $('modalTitle').textContent = `Рейс ${f.flightNumber}`;
  const delayed = f.expectedDeparture && new Date(f.expectedDeparture) > new Date(f.scheduledDeparture);
  const early = f.computedStatus === 'early' || f.status === 'early';
  const delayHtml = (delayed || early) ? `<div class="modal-delay-banner"><i class="fas fa-clock"></i><span>${early ? 'Ранний вылет' : 'Задержан до ' + fmtTm(f.expectedDeparture)}</span></div>` : '';
  const tagClass = type === 'departure' ? getTagClass(f) : getTagClassArr(f);
  const isDeparture = type === 'departure';
  const doneCheckIn = ['checkin_completed','boarding','boarding_completed','departed','early_departed'].includes(f.computedStatus);
  const activeBoarding = ['boarding','boarding_completed'].includes(f.computedStatus);
  $('modalBody').innerHTML = `<div class="modal-flight-top"><div><div class="modal-flight-num">${f.flightNumber}</div><div class="modal-flight-airline">Выполняет: ${f.airline||'—'}</div></div><span class="status-tag ${tagClass}" style="font-size:14px;">${(f.statusText||'По расписанию').replace(/\n/g,'<br>')}</span></div>${delayHtml}<div class="modal-fs-destination"><h2>${f.destination}</h2><span class="modal-fs-iata">${f.iataCode||''}</span></div><div class="modal-fs-info-row"><span>Россия</span></div><div class="modal-fs-table"><div class="modal-fs-table-row header"><div>Дата вылета</div><div>Время по расписанию</div><div>Ожидаемое время</div><div>Выход</div><div>Терминал</div></div><div class="modal-fs-table-row"><div><strong>${fmtDateOnly(f.scheduledDeparture)}</strong></div><div><strong>${fmtTm(f.scheduledDeparture)}</strong></div><div><strong>${fmtTm(f.expectedDeparture||f.scheduledDeparture)}</strong></div><div><strong>${f.boardingGate||'—'}</strong></div><div><strong>А</strong></div></div></div>${isDeparture&&(f.checkInStart||f.checkInEnd||f.boardingStart||f.boardingEnd)?`<div class="modal-fs-timeline"><h3>Регистрация и посадка</h3><div class="timeline-items">${f.checkInStart?`<div class="timeline-item ${doneCheckIn?'done':''}"><div class="timeline-dot"></div><div class="timeline-content"><div class="timeline-time">${fmtTm(f.checkInStart)}</div><div class="timeline-label">Начало регистрации${f.checkInCounters?' • Стойки '+f.checkInCounters:''}</div></div></div>`:''}${f.checkInEnd?`<div class="timeline-item ${doneCheckIn?'done':''}"><div class="timeline-dot"></div><div class="timeline-content"><div class="timeline-time">${fmtTm(f.checkInEnd)}</div><div class="timeline-label">Окончание регистрации</div></div></div>`:''}${f.boardingStart?`<div class="timeline-item ${activeBoarding?'active':''}"><div class="timeline-dot"></div><div class="timeline-content"><div class="timeline-time">${fmtTm(f.boardingStart)}</div><div class="timeline-label">Начало посадки${f.boardingGate?' • Выход '+f.boardingGate:''}</div></div></div>`:''}${f.boardingEnd?`<div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-content"><div class="timeline-time">${fmtTm(f.boardingEnd)}</div><div class="timeline-label">Окончание посадки</div></div></div>`:''}</div></div>`:''}<div class="modal-fs-status"><span class="status-tag ${tagClass}" style="font-size:15px;padding:10px 24px;">${(f.statusText||'По расписанию').replace(/\n/g,'<br>')}</span></div><div class="modal-fs-extra"><div class="modal-fs-extra-item"><span class="extra-label">Авиакомпания</span><span class="extra-value">${f.airline||'—'}</span></div><div class="modal-fs-extra-item"><span class="extra-label">Вылет по расписанию</span><span class="extra-value">${fmtDt(f.scheduledDeparture)}</span></div><div class="modal-fs-extra-item"><span class="extra-label">Ожидаемый вылет</span><span class="extra-value">${fmtDt(f.expectedDeparture)}</span></div>${isDeparture?`<div class="modal-fs-extra-item"><span class="extra-label">Регистрация</span><span class="extra-value">${fmtTm(f.checkInStart)} — ${fmtTm(f.checkInEnd)}</span></div><div class="modal-fs-extra-item"><span class="extra-label">Посадка</span><span class="extra-value">${fmtTm(f.boardingStart)} — ${fmtTm(f.boardingEnd)}</span></div><div class="modal-fs-extra-item"><span class="extra-label">Стойки</span><span class="extra-value">${f.checkInCounters||'—'}</span></div>`:''}</div>`;
  $('modalOverlay').classList.add('show'); document.body.style.overflow = 'hidden';
};

$('modalClose').onclick = () => { $('modalOverlay').classList.remove('show'); document.body.style.overflow = ''; };
$('modalOverlay').onclick = e => { if (e.target === $('modalOverlay')) { $('modalOverlay').classList.remove('show'); document.body.style.overflow = ''; } };
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('modalOverlay').classList.remove('show'); document.body.style.overflow = ''; } });

document.querySelectorAll('#modeDeparture .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#modeDeparture .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTabDep = btn.dataset.tab;
    $('boardYesterdayDep').style.display = currentTabDep === 'yesterday' ? '' : 'none';
    $('boardTodayDep').style.display = currentTabDep === 'today' ? '' : 'none';
    $('boardTomorrowDep').style.display = currentTabDep === 'tomorrow' ? '' : 'none';
  });
});

document.querySelectorAll('#modeArrival .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#modeArrival .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTabArr = btn.dataset.tab;
    $('boardYesterdayArr').style.display = currentTabArr === 'yesterday' ? '' : 'none';
    $('boardTodayArr').style.display = currentTabArr === 'today' ? '' : 'none';
    $('boardTomorrowArr').style.display = currentTabArr === 'tomorrow' ? '' : 'none';
  });
});

$('toggleDepartedDep').addEventListener('click', () => { showDepartedDep=!showDepartedDep; $('toggleDepartedDep').classList.toggle('active',showDepartedDep); $('toggleDepartedDep').innerHTML=showDepartedDep?'<i class="fas fa-eye-slash"></i> Скрыть вылетевшие':'<i class="fas fa-eye"></i> Показать вылетевшие'; renderAllDep(); });
$('toggleDepartedArr').addEventListener('click', () => { showDepartedArr=!showDepartedArr; $('toggleDepartedArr').classList.toggle('active',showDepartedArr); $('toggleDepartedArr').innerHTML=showDepartedArr?'<i class="fas fa-eye-slash"></i> Скрыть прибывшие':'<i class="fas fa-eye"></i> Показать прибывшие'; renderAllArr(); });
$('adminToggleDep').onclick = () => { $('adminDeparture').style.display = $('adminDeparture').style.display !== 'none' ? 'none' : 'block'; };
$('adminToggleArr').onclick = () => { $('adminArrival').style.display = $('adminArrival').style.display !== 'none' ? 'none' : 'block'; };

$('addFlightDep').onclick = () => { editingId=null; $('formTitleDep').textContent='Новый рейс'; $('flightFormInnerDep').reset(); $('flightIdDep').value=''; $('statusDep').value='scheduled'; $('flightFormDep').style.display='block'; };
$('cancelFormDep').onclick = () => { $('flightFormDep').style.display='none'; };

window.editFlightDep = function(id) {
  const f = flightsDep.find(x => x.id === id); if (!f) return; editingId=id;
  $('formTitleDep').textContent='Редактировать рейс'; $('flightIdDep').value=f.id; $('flightNumberDep').value=f.flightNumber; $('airlineDep').value=f.airline;
  $('destinationDep').value=f.destination; $('iataCodeDep').value=f.iataCode||''; $('scheduledDepartureDep').value=f.scheduledDeparture?f.scheduledDeparture.slice(0,16):'';
  $('expectedDepartureDep').value=f.expectedDeparture?f.expectedDeparture.slice(0,16):''; $('checkInStartDep').value=f.checkInStart?f.checkInStart.slice(0,16):'';
  $('checkInEndDep').value=f.checkInEnd?f.checkInEnd.slice(0,16):''; $('checkInCountersDep').value=f.checkInCounters||''; $('boardingStartDep').value=f.boardingStart?f.boardingStart.slice(0,16):'';
  $('boardingEndDep').value=f.boardingEnd?f.boardingEnd.slice(0,16):''; $('boardingGateDep').value=f.boardingGate||''; $('statusDep').value=f.status; $('flightFormDep').style.display='block';
};

window.deleteFlightDep = async function(id) { if (!confirm('Удалить?')) return; await fetch(`${API}/${id}?type=departure`, { method:'DELETE' }); loadDep(); };

$('flightFormInnerDep').onsubmit = async function(e) {
  e.preventDefault();
  const body = { flightNumber:$('flightNumberDep').value, airline:$('airlineDep').value, destination:$('destinationDep').value, iataCode:$('iataCodeDep').value.toUpperCase(), scheduledDeparture:$('scheduledDepartureDep').value?$('scheduledDepartureDep').value+':00':null, expectedDeparture:$('expectedDepartureDep').value?$('expectedDepartureDep').value+':00':null, checkInStart:$('checkInStartDep').value?$('checkInStartDep').value+':00':null, checkInEnd:$('checkInEndDep').value?$('checkInEndDep').value+':00':null, checkInCounters:$('checkInCountersDep').value, boardingStart:$('boardingStartDep').value?$('boardingStartDep').value+':00':null, boardingEnd:$('boardingEndDep').value?$('boardingEndDep').value+':00':null, boardingGate:$('boardingGateDep').value, status:$('statusDep').value };
  const url = editingId ? `${API}/${editingId}?type=departure` : `${API}?type=departure`;
  await fetch(url, { method: editingId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  $('flightFormDep').style.display='none'; editingId=null; loadDep();
};

$('addFlightArr').onclick = () => { editingId=null; $('formTitleArr').textContent='Новый рейс'; $('flightFormInnerArr').reset(); $('flightIdArr').value=''; $('statusArr').value='scheduled'; $('flightFormArr').style.display='block'; };
$('cancelFormArr').onclick = () => { $('flightFormArr').style.display='none'; };

window.editFlightArr = function(id) {
  const f = flightsArr.find(x => x.id === id); if (!f) return; editingId=id;
  $('formTitleArr').textContent='Редактировать рейс'; $('flightIdArr').value=f.id; $('flightNumberArr').value=f.flightNumber; $('airlineArr').value=f.airline;
  $('destinationArr').value=f.destination; $('iataCodeArr').value=f.iataCode||''; $('scheduledDepartureArr').value=f.scheduledDeparture?f.scheduledDeparture.slice(0,16):'';
  $('expectedDepartureArr').value=f.expectedDeparture?f.expectedDeparture.slice(0,16):''; $('statusArr').value=f.status; $('flightFormArr').style.display='block';
};

window.deleteFlightArr = async function(id) { if (!confirm('Удалить?')) return; await fetch(`${API}/${id}?type=arrival`, { method:'DELETE' }); loadArr(); };

$('flightFormInnerArr').onsubmit = async function(e) {
  e.preventDefault();
  const body = { flightNumber:$('flightNumberArr').value, airline:$('airlineArr').value, destination:$('destinationArr').value, iataCode:$('iataCodeArr').value.toUpperCase(), scheduledDeparture:$('scheduledDepartureArr').value?$('scheduledDepartureArr').value+':00':null, expectedDeparture:$('expectedDepartureArr').value?$('expectedDepartureArr').value+':00':null, status:$('statusArr').value };
  const url = editingId ? `${API}/${editingId}?type=arrival` : `${API}?type=arrival`;
  await fetch(url, { method: editingId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  $('flightFormArr').style.display='none'; editingId=null; loadArr();
};

setInterval(() => { if (currentMode==='departure') loadDep(); else loadArr(); }, 30000);
loadDep(); loadArr();
