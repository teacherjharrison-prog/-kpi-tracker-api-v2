const $ = id => document.getElementById(id);

// Default to the live preview URL
const DEFAULT_URL = 'https://fea3d782-ac20-45ec-90e1-61d72ee06326.preview.emergentagent.com';
let API_URL = '';

async function loadSettings() {
  const data = await chrome.storage.local.get(['apiUrl']);
  API_URL = data.apiUrl || DEFAULT_URL;
  $('apiUrl').value = API_URL;
  fetchStats();
}

async function saveSettings() {
  API_URL = $('apiUrl').value.replace(/\/$/, '');
  await chrome.storage.local.set({ apiUrl: API_URL });
  fetchStats();
}

async function fetchStats() {
  if (!API_URL) return;
  try {
    const res = await fetch(`${API_URL}/api/entries/today`);
    const data = await res.json();
    $('calls').textContent = data.calls_received || 0;
    $('bookings').textContent = data.bookings?.length || 0;
    const profit = data.bookings?.reduce((s, b) => s + (b.profit || 0), 0) || 0;
    $('profit').textContent = '$' + profit.toFixed(0);
    $('spins').textContent = data.spins?.length || 0;
    $('message').textContent = '';
  } catch (e) {
    $('message').className = 'error';
    $('message').textContent = 'Failed to connect';
  }
}

async function addCall() {
  if (!API_URL) return;
  try {
    const res = await fetch(`${API_URL}/api/webhook/call`, { method: 'POST' });
    const data = await res.json();
    $('calls').textContent = data.total_calls;
    $('message').className = 'success';
    $('message').textContent = 'Call added!';
    setTimeout(() => $('message').textContent = '', 2000);
  } catch (e) {
    $('message').className = 'error';
    $('message').textContent = 'Failed to add call';
  }
}

$('addCall').onclick = addCall;
$('openDashboard').onclick = () => { if (API_URL) window.open(API_URL.replace('/api', ''), '_blank'); };
$('apiUrl').onchange = saveSettings;

loadSettings();
