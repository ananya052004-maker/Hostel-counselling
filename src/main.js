import './styles.css';
import { officialImages } from './data.js';

let hostels = [];
const state = { gender: null, search: '', bed: 'all', type: 'all' };

const TOKEN_KEY = 'vit-hostel-token';
const authState = { token: localStorage.getItem(TOKEN_KEY) || null, student: null };
let authStep = 'email'; // 'email' | 'register'
let pendingEmail = '';
let allHostelsForGender = [];
let myChoices = [];
let allocation = null;
let preview = null;
let branchList = [];
let branchDisclaimer = '';
let prefSaveState = null; // null | 'saving' | 'saved'

const ROOM_TYPE_LABELS = { 1: 'Single', 2: 'Double', 3: 'Triple', 4: 'Four-bed', 6: 'Six-bed' };
const roomTypeLabel = (code) => ROOM_TYPE_LABELS[code] || code;

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authState.token) headers.Authorization = `Bearer ${authState.token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function logout() {
  authState.token = null;
  authState.student = null;
  localStorage.removeItem(TOKEN_KEY);
  myChoices = [];
  allocation = null;
  preview = null;
  authStep = 'email';
  pendingEmail = '';
  renderCounselling();
}

async function loadGenderHostels(gender) {
  const response = await fetch(`/api/hostels?gender=${gender}`);
  allHostelsForGender = await response.json();
}

async function loadBranches() {
  const { branches, disclaimer } = await apiFetch('/api/branches');
  branchList = branches;
  branchDisclaimer = disclaimer;
}

async function loadMyChoices() {
  const { choices } = await apiFetch('/api/preferences');
  myChoices = choices.map((choice) => ({ hostelCode: choice.hostelCode, roomType: choice.roomType }));
}

async function loadAllocation() {
  allocation = await apiFetch('/api/allocation/me');
}

async function loadPreview() {
  preview = myChoices.length ? await apiFetch('/api/allocation/preview') : null;
}

async function initAuth() {
  if (!authState.token) return;
  try {
    const { student } = await apiFetch('/api/auth/me');
    authState.student = student;
    await Promise.all([loadGenderHostels(student.gender), loadMyChoices(), loadAllocation()]);
    await loadPreview();
  } catch {
    logout();
  }
}

const icons = {
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/></svg>',
  bed: '<svg viewBox="0 0 24 24"><path d="M3 19v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8M3 15h18M6 9V7a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
};

function cardTemplate(item) {
  return `<article class="card">
    <div class="card-image"><img src="${item.image}" alt="${item.name}" loading="lazy"><span class="card-type">${item.type}</span></div>
    <div class="card-body">
      <div class="card-title-row"><div><p class="eyebrow">${item.gender === 'mens' ? "MEN'S HOSTEL" : "WOMEN'S HOSTEL"}</p><h3 class="block-title">${item.code}</h3><p class="hostel-name">${item.name}</p></div><span class="rating">${item.type}</span></div>
      <p class="description">${item.description}</p>
      <div class="facts"><span>${icons.bed} ${item.beds}</span><span>${icons.map} ${item.tags.join(' / ')}</span></div>
      <div class="room-breakdown"><b>Room mix <small>indicative</small></b>${item.roomTypes.includes('1') ? `<span><strong>${item.roomCounts.single}</strong> single</span>` : ''}${item.roomTypes.includes('2') ? `<span><strong>${item.roomCounts.double}</strong> double</span>` : ''}<span><strong>${item.roomCounts.triple}</strong> triple</span><span><strong>${item.roomCounts.four}</strong> four</span>${item.roomTypes.includes('6') ? `<span><strong>${item.roomCounts.six}</strong> six</span>` : ''}</div>
      <div class="card-footer"><span class="mess"><i></i> ${item.mess}</span><button class="details" data-hostel="${item.name}">Photos & details ${icons.arrow}</button></div>
    </div>
  </article>`;
}

async function renderCards() {
  const explore = document.querySelector('#explore');
  document.body.classList.toggle('has-selection', Boolean(state.gender));
  if (!state.gender) {
    explore.classList.add('is-hidden');
    return;
  }
  explore.classList.remove('is-hidden');
  const params = new URLSearchParams({ gender: state.gender, type: state.type, bed: state.bed, search: state.search });
  let filtered;
  try {
    const response = await fetch(`/api/hostels?${params}`);
    if (!response.ok) throw new Error('Unable to load hostel data');
    filtered = await response.json();
  } catch (error) {
    console.error(error);
    document.querySelector('#results-count').textContent = 'Data unavailable';
    document.querySelector('#cards').innerHTML = '<div class="empty"><strong>Could not load hostel data</strong><span>Start the API with <code>npm run dev</code> and refresh.</span></div>';
    return;
  }
  hostels = filtered;
  const genderLabel = state.gender === 'mens' ? "men's" : state.gender === 'ladies' ? "women's" : 'all';
  document.querySelector('#results-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'result' : 'results'} · ${genderLabel} · ${state.bed === 'all' ? 'any room' : `${state.bed}-bed rooms`} · ${state.type === 'all' ? 'all stays' : 'hostels only'}`;
  document.querySelector('#cards').innerHTML = filtered.length ? filtered.map(cardTemplate).join('') : `<div class="empty"><strong>No hostels found</strong><span>Try a different search or filter.</span></div>`;
}

function authFormTemplate() {
  if (authStep === 'email') {
    return `<form id="auth-form" class="auth-form" data-step="email">
      <h3>Log in or register</h3>
      <input name="email" type="email" placeholder="Email address" autocomplete="email" required>
      <button type="submit">Continue</button>
      <p class="form-error" id="auth-error"></p>
      <p class="form-note" style="margin:0">No password needed — if this email is already registered, you're logged in immediately. Otherwise we'll ask a few quick details.</p>
    </form>`;
  }
  const branchOptions = branchList.map((branch) => `<option value="${branch.code}">${branch.name} (~${branch.approxStrength} students)</option>`).join('');
  return `<form id="auth-form" class="auth-form" data-step="register">
    <h3>Finish creating your account</h3>
    <input name="email" type="email" value="${pendingEmail}" readonly>
    <input name="name" placeholder="Full name" required>
    <input name="regNo" placeholder="Registration number" required>
    <select name="gender" required><option value="">Gender category</option><option value="mens">Men's</option><option value="ladies">Women's</option></select>
    <input name="cgpa" type="number" min="0" max="10" step="0.01" placeholder="CGPA" required>
    <select name="branch" required><option value="">Branch</option>${branchOptions}</select>
    <p class="form-note" style="margin:0">Smaller branches get allocation priority. Branch sizes are estimates — see note below the allocation panel.</p>
    <button type="submit">Register</button>
    <p class="form-error" id="auth-error"></p>
    <p class="auth-switch"><button type="button" id="auth-switch-btn">Use a different email</button></p>
  </form>`;
}

function preferenceBuilderTemplate() {
  const hostelOptions = allHostelsForGender.map((item) => `<option value="${item.code}">${item.code} — ${item.name}</option>`).join('');
  const listItems = myChoices.map((choice, index) => {
    const hostel = allHostelsForGender.find((item) => item.code === choice.hostelCode);
    return `<li><span>${index + 1}. ${choice.hostelCode}${hostel ? ` — ${hostel.name}` : ''} · ${roomTypeLabel(choice.roomType)}</span><button type="button" data-remove-pref="${index}">Remove</button></li>`;
  }).join('');
  const submitLabel = prefSaveState === 'saving' ? 'Saving…' : 'Submit ranked preferences';
  return `<div class="pref-builder">
    <p class="form-note" style="margin:0 0 14px">Add 1 to 8 choices, in the order you'd prefer them — you don't need all 8. (${myChoices.length}/8 added)</p>
    <div class="pref-row">
      <select id="pref-hostel">${hostelOptions}</select>
      <select id="pref-room"></select>
      <button type="button" id="pref-add">Add choice</button>
    </div>
    <ul class="pref-list">${listItems || '<li>No choices added yet.</li>'}</ul>
    <button type="button" id="pref-submit" ${myChoices.length && prefSaveState !== 'saving' ? '' : 'disabled'}>${submitLabel}</button>
    ${prefSaveState === 'saved' ? '<p class="form-success">✓ Preferences saved. They will be processed in the next counselling round.</p>' : ''}
    <p class="form-error" id="pref-error"></p>
    <p class="form-note">Choices are processed in rank order — you get the highest choice that still has room when the counselling round runs.</p>
  </div>`;
}

const BREAKDOWN_LABELS = {
  would_get: '✓ You would get this',
  full: 'Full — no room for you here',
  not_reached: "Not needed — you'd already have a room"
};

function breakdownListTemplate(breakdown) {
  if (!breakdown.length) return '';
  const items = breakdown.map((item) => `<li class="breakdown-${item.status}"><span>${item.rank}. ${item.hostelCode}${item.hostelName ? ` — ${item.hostelName}` : ''} · ${roomTypeLabel(item.roomType)}</span><em>${BREAKDOWN_LABELS[item.status] || item.status}</em></li>`).join('');
  return `<h4 class="breakdown-heading">Your choices, in priority order</h4><ul class="pref-list breakdown-list">${items}</ul>`;
}

function allocationTemplate() {
  let card;
  let breakdown = [];
  if (allocation && allocation.status === 'allocated') {
    card = `<div class="allocation-card status-allocated"><b>Allocated: ${allocation.hostelCode} — ${allocation.hostelName}</b><p class="form-note">Room type: ${roomTypeLabel(allocation.roomType)}. Allotted ${allocation.allocatedAt}.</p></div>`;
  } else if (!preview || preview.status === 'no_preferences') {
    card = '<div class="allocation-card"><b>Not yet processed</b><p class="form-note">Submit your ranked preferences to see a live estimate here, then wait for the counselling round to run for the final result.</p></div>';
  } else {
    breakdown = preview.breakdown || [];
    const waitlistNote = allocation && allocation.status === 'waitlisted' ? ' You were waitlisted in the last counselling round — this is your live estimate for the next one.' : '';
    card = preview.status === 'likely_waitlisted'
      ? `<div class="allocation-card status-preview status-waitlisted"><b>Live estimate: likely waitlisted</b><p class="form-note">None of your choices have room right now, based on current submissions.${waitlistNote} Not final until a counselling round runs.</p></div>`
      : `<div class="allocation-card status-preview status-allocated"><b>Live estimate: ${preview.hostelCode} — ${preview.hostelName}</b><p class="form-note">Room type: ${roomTypeLabel(preview.roomType)}.${waitlistNote} Not final until a counselling round runs.</p></div>`;
  }
  return `${card}${breakdownListTemplate(breakdown)}<p class="form-note" style="margin-top:14px">Priority rule: students in a smaller branch are considered first as a group; within the same branch, higher CGPA goes first. ${branchDisclaimer}</p>`;
}

async function completeLogin(data) {
  authState.token = data.token;
  authState.student = data.student;
  localStorage.setItem(TOKEN_KEY, data.token);
  await Promise.all([loadGenderHostels(data.student.gender), loadMyChoices(), loadAllocation()]);
  await loadPreview();
  renderCounselling();
}

function bindAuthForm() {
  const form = document.querySelector('#auth-form');
  document.querySelector('#auth-switch-btn')?.addEventListener('click', () => {
    authStep = 'email';
    pendingEmail = '';
    renderCounselling();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    const errorEl = document.querySelector('#auth-error');
    errorEl.textContent = '';
    try {
      if (form.dataset.step === 'email') {
        const data = await apiFetch('/api/auth/identify', { method: 'POST', body: JSON.stringify({ email: payload.email }) });
        if (data.found) {
          await completeLogin(data);
        } else {
          pendingEmail = payload.email;
          authStep = 'register';
          renderCounselling();
        }
        return;
      }
      const data = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
      await completeLogin(data);
    } catch (error) {
      errorEl.textContent = error.message;
    }
  });
}

function bindCounsellingBody() {
  document.querySelector('#logout-btn').addEventListener('click', logout);
  const hostelSelect = document.querySelector('#pref-hostel');
  const roomSelect = document.querySelector('#pref-room');
  const syncRoomOptions = () => {
    const hostel = allHostelsForGender.find((item) => item.code === hostelSelect.value);
    roomSelect.innerHTML = (hostel ? hostel.roomTypes : []).map((type) => `<option value="${type}">${roomTypeLabel(type)}</option>`).join('');
  };
  if (hostelSelect) {
    syncRoomOptions();
    hostelSelect.addEventListener('change', syncRoomOptions);
  }
  document.querySelector('#pref-add')?.addEventListener('click', () => {
    const hostelCode = hostelSelect.value;
    const roomType = roomSelect.value;
    if (!hostelCode || !roomType || myChoices.length >= 8) return;
    if (myChoices.some((choice) => choice.hostelCode === hostelCode && choice.roomType === roomType)) return;
    myChoices.push({ hostelCode, roomType });
    prefSaveState = null;
    renderCounselling();
  });
  document.querySelectorAll('[data-remove-pref]').forEach((button) => {
    button.addEventListener('click', () => {
      myChoices.splice(Number(button.dataset.removePref), 1);
      prefSaveState = null;
      renderCounselling();
    });
  });
  document.querySelector('#pref-submit')?.addEventListener('click', async () => {
    prefSaveState = 'saving';
    renderCounselling();
    try {
      await apiFetch('/api/preferences', { method: 'POST', body: JSON.stringify({ choices: myChoices }) });
      await loadAllocation();
      await loadPreview();
      prefSaveState = 'saved';
      renderCounselling();
    } catch (error) {
      prefSaveState = null;
      renderCounselling();
      document.querySelector('#pref-error').textContent = error.message;
    }
  });
}

function renderCounselling() {
  const body = document.querySelector('#counselling-body');
  if (!body) return;
  if (!authState.student) {
    body.innerHTML = authFormTemplate();
    bindAuthForm();
    return;
  }
  const branchName = branchList.find((branch) => branch.code === authState.student.branch)?.name || authState.student.branch;
  body.innerHTML = `<div class="student-chip"><span>Logged in as <b>${authState.student.name}</b> (${authState.student.regNo}) · ${branchName} · CGPA ${authState.student.cgpa}</span><button type="button" id="logout-btn">Log out</button></div>
    <div class="counselling-grid">
      <div><h3>Rank your choices</h3>${preferenceBuilderTemplate()}</div>
      <div><h3>Your allocation status</h3>${allocationTemplate()}</div>
    </div>`;
  bindCounsellingBody();
}

function openModal(name) {
  const item = hostels.find((hostel) => hostel.name === name);
  if (!item) return;
  const gallery = [item.image, ...officialImages.filter((image) => image !== item.image)].slice(0, 4)
    .map((image, index) => `<img src="${image}" alt="${item.name} photo ${index + 1}" loading="lazy">`).join('');
  const roomCells = [
    ['1', item.roomCounts.single, 'Single-bed rooms'],
    ['2', item.roomCounts.double, '2-bed rooms'],
    ['3', item.roomCounts.triple, '3-bed rooms'],
    ['4', item.roomCounts.four, '4-bed rooms'],
    ['6', item.roomCounts.six, '6-bed rooms']
  ].filter(([bed]) => item.roomTypes.includes(bed)).map(([, count, label]) => `<div><b>${count}</b><span>${label}</span></div>`).join('');
  document.querySelector('#modal-content').innerHTML = `<button class="modal-close" aria-label="Close">×</button><div class="modal-gallery">${gallery}</div><div class="modal-info"><p class="eyebrow">${item.gender === 'mens' ? "MEN'S" : "WOMEN'S"} · VIT VELLORE</p><h2 class="modal-block-code">${item.code}</h2><p class="modal-hostel-name">${item.name}</p><p>${item.description}</p><div class="modal-grid">${roomCells}<div><b>${item.tags.join(' / ')}</b><span>AC categories</span></div><div><b>${item.mess}</b><span>Preferred mess</span></div><div><b>${item.phone}</b><span>Contact</span></div></div><p class="modal-note">Room counts are indicative. Confirm the current apartment inventory and final allotment in VTOP.</p></div>`;
  document.querySelector('#modal').classList.add('open');
  document.body.classList.add('modal-open');
}

document.querySelector('#root').innerHTML = `
  <header class="site-header"><a class="brand" href="#"><span class="brand-mark">V</span><span><b>VIT</b> HOSTEL GUIDE</span></a><nav><a href="#explore">All blocks</a><a href="#counselling">Counselling</a><a href="#how-it-works">How it works</a><a href="https://vit.ac.in/campuslife/hostels" target="_blank" rel="noreferrer">Official VIT page ↗</a></nav><button class="theme-toggle" aria-label="Toggle dark mode">☾ <span>Theme</span></button><button class="icon-button mobile-menu" aria-label="Open menu">${icons.menu}</button><a class="header-link" href="#explore">Browse <span>→</span></a></header>
  <main>
    <section class="hero"><div class="hero-copy"><p class="kicker">FOR VIT VELLORE STUDENTS</p><h1>Find your hostel<br><em>before counselling.</em></h1><p class="hero-text">Choose your hostel group to browse official blocks, room options, AC categories, and mess information.</p></div><div class="choice-grid"><button class="choice-card choice-mens" data-gender="mens"><span>01</span><strong>Men's hostels</strong><small>22 official blocks</small>${icons.arrow}</button><button class="choice-card choice-ladies" data-gender="ladies"><span>02</span><strong>Women's hostels</strong><small>11 official blocks</small>${icons.arrow}</button><button class="choice-card choice-all" data-gender="all"><span>03</span><strong>All hostels</strong><small>Browse every block</small>${icons.arrow}</button></div></section>
    <section class="quick-stats"><div><strong>33</strong><span>official blocks listed</span></div><div><strong>22</strong><span>men's blocks</span></div><div><strong>11</strong><span>women's blocks</span></div><div><strong>1</strong><span>clear decision</span></div></section>
    <section class="explore" id="explore"><div class="section-heading"><div><p class="kicker">BROWSE THE CAMPUS</p><h2>Find your <em>place.</em></h2></div><span id="results-count">39 results</span></div><div class="toolbar"><div class="segmented" role="group" aria-label="Hostel gender"><button class="active" data-gender="all">All hostels</button><button data-gender="mens">Men's</button><button data-gender="ladies">Women's</button></div><label class="search">${icons.search}<input id="search" type="search" placeholder="Search a block or apartment..."></label><select id="bed-filter" aria-label="Filter by bed type"><option value="all">Any room type</option><option value="1">Single bed</option><option value="2">2 bedded</option><option value="3">3 bedded</option><option value="4">4 bedded</option><option value="6">6 bedded</option></select><select id="type-filter" aria-label="Filter by accommodation type"><option value="all">All accommodation</option><option value="Hostel">Hostels only</option><option value="Apartment">Apartments only</option></select></div><div class="cards" id="cards"></div></section>
    <section class="counselling" id="counselling"><div class="section-heading"><div><p class="kicker">COUNSELLING SIMULATION</p><h2>Rank your <em>choices.</em></h2></div></div><p class="hero-text" style="margin:0 0 30px;text-align:left">Register with your CGPA, rank up to 8 room choices, and a server-side allocation engine assigns seats in priority order as real counselling rounds run — mirroring how VIT's seniority-based allotment works.</p><div id="counselling-body"></div></section>
    <section class="info-band" id="how-it-works"><div class="info-icon">${icons.map}</div><div><p class="kicker">A BETTER WAY TO CHOOSE</p><h2>Less guessing.<br><em>More living.</em></h2></div><div class="info-copy"><p>Know what you’re choosing before your counselling window opens. Compare room capacities, AC availability, mess locations, and the feel of every block.</p><a class="text-link" href="#explore">Start comparing ${icons.arrow}</a></div></section>
  </main>
  <footer id="about"><div class="footer-brand"><span class="brand-mark">V</span><b>VIT HOSTEL GUIDE</b><p>Made for VIT Vellore students,<br>by students.</p></div><div><p class="footer-label">Explore</p><a href="#explore">All blocks</a><a href="#explore">Men's hostels</a><a href="#explore">Ladies' hostels</a></div><div><p class="footer-label">Official source</p><p class="footer-note">Block names and contact numbers are from the <a href="https://vit.ac.in/campuslife/hostels" target="_blank" rel="noreferrer">official VIT hostel page</a>. Room counts and availability must be verified on VTOP.</p></div><div class="copyright">© 2025 VIT Hostel Guide</div></footer>
  <div class="modal" id="modal"><div class="modal-dialog" id="modal-content"></div></div>`;

renderCards();
renderCounselling();
loadBranches().then(renderCounselling);
initAuth().then(renderCounselling);

document.addEventListener('click', (event) => {
  const gender = event.target.closest('[data-gender]');
  if (gender) {
    document.querySelectorAll('.segmented [data-gender]').forEach((button) => button.classList.remove('active'));
    const segmentedButton = document.querySelector(`.segmented [data-gender="${gender.dataset.gender}"]`);
    if (segmentedButton) segmentedButton.classList.add('active');
    state.gender = gender.dataset.gender;
    renderCards();
    if (!gender.closest('.segmented')) document.querySelector('#explore').scrollIntoView({ behavior: 'smooth' });
  }
  const details = event.target.closest('[data-hostel]');
  if (details) openModal(details.dataset.hostel);
  if (event.target.closest('.modal-close') || event.target.id === 'modal') {
    document.querySelector('#modal').classList.remove('open');
    document.body.classList.remove('modal-open');
  }
});
document.querySelector('#search').addEventListener('input', (event) => { state.search = event.target.value; renderCards(); });
document.querySelector('#bed-filter').addEventListener('change', (event) => { state.bed = event.target.value; renderCards(); });
document.querySelector('#type-filter').addEventListener('change', (event) => { state.type = event.target.value; renderCards(); });
const storedTheme = localStorage.getItem('vit-hostel-theme');
if (storedTheme === 'dark') document.body.classList.add('dark');
document.querySelector('.theme-toggle').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('vit-hostel-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});
