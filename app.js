/* frontend/js/app.js
   Shared frontend logic for Community Volunteer App (demo)
   - Put this file in frontend/js/app.js
   - Add this script tag to each HTML page before </body>:
     <script src="js/app.js"></script>
*/

/* ====== CONFIG ====== */
const API_URL = 'http://localhost:5000/api'; // update if backend URL differs

/* ====== AUTH HELPERS ====== */
/** Save user object (from backend or demo) */
function saveUser(user) {
  try { localStorage.setItem('cv_user', JSON.stringify(user)); } catch(e) { console.warn('storage failed', e); }
}

/** Load user from localStorage */
function loadUser() {
  try { return JSON.parse(localStorage.getItem('cv_user') || 'null'); } catch(e){ return null; }
}

/** Remove user (logout) */
function clearUser() {
  localStorage.removeItem('cv_user');
  localStorage.removeItem('cv_token');
}

/** Set token (if returned by backend) */
function saveToken(token) {
  try { localStorage.setItem('cv_token', token || ''); } catch(e) {}
}

/** Get token */
function loadToken() {
  return localStorage.getItem('cv_token') || '';
}

/* ====== DOM / UI HELPERS ====== */
/** Set innerText safely */
function setText(selectorOrEl, text) {
  const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
  if (el) el.textContent = text;
}

/** Create element with classes and innerHTML */
function el(tag='div', className='', html='') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
}

/* ====== AUTH UI ====== */
/** Render auth area in header. Uses element with id="authArea" (or id provided) */
function renderAuthArea(id = 'authArea') {
  const container = document.getElementById(id);
  if (!container) return;
  const user = loadUser();
  if (user) {
    container.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="text-sm">Hi, <strong>${escapeHtml(user.email.split('@')[0])}</strong></div>
        <button id="cvLogoutBtn" class="px-3 py-1 bg-slate-100 rounded">Logout</button>
      </div>
    `;
    const btn = document.getElementById('cvLogoutBtn');
    if (btn) btn.addEventListener('click', () => { clearUser(); renderAuthArea(id); });
  } else {
    container.innerHTML = `<a href="login.html" class="px-3 py-1 bg-teal-500 text-white rounded">Login</a>`;
  }
}

/* ====== API HELPERS ====== */
async function apiGet(path) {
  try {
    const res = await fetch(`${API_URL}${path}`, { headers: defaultHeaders() });
    return await res.json();
  } catch (err) {
    console.error('GET failed', path, err);
    throw err;
  }
}

async function apiPost(path, body) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, defaultHeaders()),
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (err) {
    console.error('POST failed', path, err);
    throw err;
  }
}

function defaultHeaders() {
  const token = loadToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

/* ====== ESCAPE HTML (tiny) ====== */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]); });
}

/* ====== PAGE: Home ====== */
async function initHome() {
  renderAuthArea('authArea');

  // stats elements: #statEv, #statVol, #statSign
  try {
    const [eventsRes, volsRes, signupsRes] = await Promise.all([
      apiGet('/events'),
      apiGet('/volunteers'),
      apiGet('/signups')
    ]);
    setText('#statEv', Array.isArray(eventsRes) ? eventsRes.length : '-');
    setText('#statVol', Array.isArray(volsRes) ? volsRes.length : '-');
    setText('#statSign', Array.isArray(signupsRes) ? signupsRes.length : '-');
  } catch (err) {
    console.warn('home stats failed', err);
  }
}

/* ====== PAGE: Events ====== */
async function initEvents() {
  renderAuthArea('authArea');
  const qInput = document.getElementById('q');
  const catSelect = document.getElementById('cat');
  const grid = document.getElementById('grid');

  async function loadAndRender() {
    try {
      const events = await apiGet('/events');
      const q = (qInput && qInput.value || '').toLowerCase();
      const cat = (catSelect && catSelect.value) || '';
      const filtered = (Array.isArray(events) ? events : []).filter(ev =>
        (!cat || ev.category === cat) &&
        (!q || ((ev.title||'').toLowerCase().includes(q) || (ev.desc||'').toLowerCase().includes(q) || (ev.location||'').toLowerCase().includes(q)))
      );

      grid.innerHTML = '';
      if (filtered.length === 0) {
        grid.innerHTML = `<div class="text-slate-600">No events found.</div>`;
        return;
      }
      filtered.forEach(ev => {
        const card = el('div','p-5 bg-white rounded-xl shadow');
        card.innerHTML = `
          <h3 class="font-semibold">${escapeHtml(ev.title)}</h3>
          <div class="text-sm text-slate-500">${escapeHtml(ev.date)} • ${escapeHtml(ev.location||'')}</div>
          <p class="mt-3 text-slate-700">${escapeHtml(ev.desc||'')}</p>
          <div class="mt-4">
            <button data-id="${escapeHtml(ev.id)}" class="px-3 py-2 registerBtn bg-teal-500 text-white rounded">Register</button>
          </div>
        `;
        grid.appendChild(card);
      });

      document.querySelectorAll('.registerBtn').forEach(b => b.addEventListener('click', async (ev) => {
        const id = b.getAttribute('data-id') || ev.target.getAttribute('data-id');
        await onRegister(id, ev.target || b);
      }));
    } catch (err) {
      console.error('load events error', err);
      grid.innerHTML = `<div class="text-red-600">Failed to load events.</div>`;
    }
  }

  if (qInput) qInput.addEventListener('input', debounce(loadAndRender, 250));
  if (catSelect) catSelect.addEventListener('change', loadAndRender);

  await loadAndRender();
}

/* register flow */
async function onRegister(eventId, btnEl) {
  const user = loadUser();
  if (!user) {
    if (confirm('You must log in to register. Go to Login page now?')) window.location.href = 'login.html';
    return;
  }
  if (!eventId) return alert('Event id missing');

  try {
    const res = await apiPost('/signup', { eventId, userEmail: user.email });
    if (res && res.success) {
      if (btnEl) { btnEl.textContent = 'Registered ✓'; btnEl.disabled = true; }
      alert('Signed up successfully.');
    } else {
      alert('Signup failed: ' + (res.error || JSON.stringify(res)));
    }
  } catch (err) {
    alert('Signup error');
  }
}

/* ====== PAGE: Volunteers ====== */
async function initVolunteers() {
  renderAuthArea('authArea');

  const qEl = document.getElementById('q');
  const skillEl = document.getElementById('skill');
  const grid = document.getElementById('grid');

  async function loadAndRender() {
    try {
      const list = await apiGet('/volunteers');
      const q = (qEl && qEl.value || '').toLowerCase();
      const skill = (skillEl && skillEl.value) || '';
      const filtered = (Array.isArray(list) ? list : []).filter(v =>
        (!skill || v.skill === skill) && (!q || (v.name||'').toLowerCase().includes(q) || (v.interests||'').toLowerCase().includes(q))
      );
      grid.innerHTML = '';
      if (filtered.length === 0) { grid.innerHTML = '<div class="text-slate-600">No volunteers.</div>'; return; }
      filtered.forEach(v => {
        const c = el('div','card bg-white p-5 rounded-xl shadow text-center');
        c.innerHTML = `
          <div class="w-24 h-24 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-xl font-semibold">${escapeHtml((v.name||'').split(' ').map(n=>n[0]).join('').slice(0,2))}</div>
          <h3 class="mt-4 font-semibold">${escapeHtml(v.name)}</h3>
          <div class="text-sm text-teal-600">${escapeHtml(v.skill)}</div>
          <p class="text-sm text-slate-600 mt-2">${escapeHtml(v.interests||'')}</p>
        `;
        grid.appendChild(c);
      });
    } catch (err) {
      console.error('vols load failed', err);
      grid.innerHTML = '<div class="text-red-600">Failed to load volunteers.</div>';
    }
  }

  if (qEl) qEl.addEventListener('input', debounce(loadAndRender, 200));
  if (skillEl) skillEl.addEventListener('change', loadAndRender);
  await loadAndRender();
}

/* ====== PAGE: Contact ====== */
function initContact() {
  renderAuthArea('authArea');
  const form = document.getElementById('form') || document.getElementById('contactForm');
  const statusEl = document.getElementById('status') || document.getElementById('cstatus') || document.getElementById('formStatus');

  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('name') || document.getElementById('cname')).value.trim();
    const email = (document.getElementById('email') || document.getElementById('cemail')).value.trim();
    const message = (document.getElementById('message') || document.getElementById('cmsg') || document.getElementById('message')).value.trim();

    if (!name || !email) {
      if (statusEl) { statusEl.textContent = 'Name & email required'; statusEl.className = 'text-sm text-red-600'; }
      return;
    }

    if (statusEl) { statusEl.textContent = 'Sending...'; statusEl.className = 'text-sm text-slate-600'; }
    try {
      const res = await apiPost('/contact', { name, email, message });
      if (res && res.success) {
        if (statusEl) { statusEl.textContent = 'Thanks — we will contact you soon!'; statusEl.className = 'text-sm text-green-600'; }
        form.reset();
      } else {
        if (statusEl) { statusEl.textContent = 'Failed to send message.'; statusEl.className = 'text-sm text-red-600'; }
      }
    } catch (err) {
      if (statusEl) { statusEl.textContent = 'Network error'; statusEl.className = 'text-sm text-red-600'; }
    }
  });
}

/* ====== PAGE: Login ====== */
function initLogin() {
  const form = document.getElementById('f') || document.getElementById('loginForm');
  const msg = document.getElementById('msg');

  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('email') || form.querySelector('input[type="email"]')).value.trim();
    const password = (document.getElementById('password') || form.querySelector('input[type="password"]')).value.trim();
    if (!email) { if (msg) { msg.textContent = 'Please enter email'; msg.className='text-sm text-red-600';} return; }
    if (msg) { msg.textContent = 'Signing in...'; msg.className='text-sm text-slate-600'; }

    try {
      // try backend login
      const res = await fetch(`${API_URL}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (res.ok && data.user) {
        saveUser(data.user);
        saveToken(data.token || '');
        if (msg) { msg.textContent = 'Signed in — redirecting...'; msg.className='text-sm text-green-600'; }
        setTimeout(()=> window.location.href = 'index.html', 700);
      } else {
        // fallback: demo local login (store email only)
        if (data && data.error) {
          // try demo: allow login without password if backend rejects (demo)
          // In earlier flow we used local-only login; preserve that experience:
          saveUser({ email });
          if (msg) { msg.textContent = 'Signed in (local) — redirecting...'; msg.className='text-sm text-green-600'; }
          setTimeout(()=> window.location.href = 'index.html', 600);
        } else {
          saveUser({ email });
          if (msg) { msg.textContent = 'Signed in (local) — redirecting...'; msg.className='text-sm text-green-600'; }
          setTimeout(()=> window.location.href = 'index.html', 600);
        }
      }
    } catch (err) {
      // network fallback: local-only login
      saveUser({ email });
      if (msg) { msg.textContent = 'Signed in (local) — redirecting...'; msg.className='text-sm text-green-600'; }
      setTimeout(()=> window.location.href = 'index.html', 600);
    }
  });
}

/* ====== PAGE: Learn Node (optional) ====== */
function initLearnNode() {
  renderAuthArea('authArea');
  // nothing special; interactive samples can call backend if needed
}

/* ====== UTILITIES ====== */
/** Debounce */
function debounce(fn, wait = 200) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/* ====== AUTO INIT BASED ON BODY data-page ======
   Set <body data-page="home">, "events", "volunteers", "contact", "login", "learn"
   If no data-page provided, the script will attempt sensible fallbacks.
*/
function autoInit() {
  const page = document.body && document.body.getAttribute('data-page');
  switch (page) {
    case 'home': initHome(); break;
    case 'events': initEvents(); break;
    case 'volunteers': initVolunteers(); break;
    case 'contact': initContact(); break;
    case 'login': initLogin(); break;
    case 'learn': initLearnNode(); break;
    default:
      // try to detect by DOM
      if (document.getElementById('grid') && document.querySelector('input[placeholder="Search..."]')) initEvents();
      if (document.getElementById('statEv')) initHome();
      if (document.getElementById('contactForm') || document.getElementById('form')) initContact();
      if (document.getElementById('loginForm') || document.getElementById('f')) initLogin();
      if (document.getElementById('volGrid') || document.getElementById('grid')) initVolunteers();
      break;
  }
}

/* Run autoInit on DOM ready */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoInit);
} else {
  autoInit();
}
function logout() {
  localStorage.removeItem("cv_user");
  localStorage.removeItem("cv_token");

  // confetti if crazy.js is loaded
  if (window.crazySpawnConfetti) {
    window.crazySpawnConfetti(50, 1200);
  }

  alert("🎉 Thanks for visiting! Come back soon! 🎉");

  window.location.href = "login.html";
}
