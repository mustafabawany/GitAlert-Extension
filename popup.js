// GitAlert Popup Script

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const config = await getStorage(['token', 'repos', 'reminders', 'urgentTags', 'notificationsEnabled', 'urgentNotificationsEnabled', 'prData', 'lastFetch', 'username']);

  if (!config.token) {
    showSetup();
  } else {
    showApp(config);
  }

  bindEvents();
}

function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function setStorage(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

// --- Screens ---

function showSetup() {
  document.getElementById('setupScreen').style.display = '';
  document.getElementById('mainApp').style.display = 'none';
}

function showApp(config) {
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = '';

  renderRepos(config.repos || []);
  renderReminders(config.reminders || []);
  renderTags(config.urgentTags || ['Important', 'Urgent', 'Critical']);
  renderToggles(config);

  // User Profile
  if (config.username) {
    document.getElementById('userProfile').style.display = 'flex';
    document.getElementById('userLogin').textContent = `@${config.username}`;
    if (config.userAvatarUrl) {
      document.getElementById('userAvatar').src = config.userAvatarUrl;
    }
  }

  if (config.prData) {
    renderDashboard(config.prData);
    updateStatus(config.lastFetch);
  } else {
    fetchPRs();
  }
}

// --- Events ---

function bindEvents() {
  // Token
  document.getElementById('saveTokenBtn').addEventListener('click', async () => {
    const token = document.getElementById('tokenInput').value.trim();
    if (!token) return;
    await setStorage({ token });
    const config = await getStorage(['token', 'repos', 'reminders', 'urgentTags', 'notificationsEnabled', 'urgentNotificationsEnabled', 'prData', 'lastFetch']);
    showApp(config);
    fetchPRs();
  });

  document.getElementById('disconnectBtn').addEventListener('click', async () => {
    await setStorage({ token: '', username: '', prData: null, lastFetch: null });
    showSetup();
  });

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // Refresh
  document.getElementById('refreshBtn').addEventListener('click', fetchPRs);

  // Settings toggle
  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="settings"]').classList.add('active');
    document.getElementById('tab-settings').classList.add('active');
  });

  // Add repo
  document.getElementById('addRepoBtn').addEventListener('click', addRepo);
  document.getElementById('repoInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') addRepo();
  });

  // Add reminder
  document.getElementById('addReminderBtn').addEventListener('click', addReminder);

  // Add tag
  document.getElementById('addTagBtn').addEventListener('click', addTag);
  document.getElementById('tagInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') addTag();
  });

  // Toggles
  document.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', async () => {
      const key = toggle.dataset.key;
      const isOn = toggle.classList.toggle('on');
      await setStorage({ [key]: isOn });
    });
  });

  // Discovery
  document.getElementById('discoverReposBtn').addEventListener('click', discoverRepos);
  document.getElementById('repoSearchInput').addEventListener('input', e => {
    filterDiscoveryResults(e.target.value);
  });

  // --- Event Delegation ---

  // Dashboard clicks (Opening PRs)
  document.getElementById('prContent').addEventListener('click', (e) => {
    const prItem = e.target.closest('.pr-item');
    if (prItem && prItem.dataset.url) {
      window.open(prItem.dataset.url, '_blank');
    }
  });

  // Repository removals
  document.getElementById('repoList').addEventListener('click', (e) => {
    if (e.target.classList.contains('repo-remove-btn')) {
      const repo = e.target.dataset.repo;
      if (repo) removeRepo(repo);
    }
  });

  // Discovery additions
  document.getElementById('discoveryResults').addEventListener('click', (e) => {
    const item = e.target.closest('.discovery-item');
    if (item && !item.classList.contains('connected')) {
      const fullName = item.dataset.repo;
      if (fullName) addRepoFromDiscovery(fullName);
    }
  });

  // Reminder removals
  document.getElementById('reminderList').addEventListener('click', (e) => {
    if (e.target.classList.contains('reminder-remove-btn')) {
      const time = e.target.dataset.time;
      if (time) removeReminder(time);
    }
  });

  // Tag removals
  document.getElementById('tagList').addEventListener('click', (e) => {
    if (e.target.classList.contains('tag-remove-btn')) {
      const tag = e.target.dataset.tag;
      if (tag) removeTag(tag);
    }
  });
}

// --- Repos ---

async function addRepo() {
  const input = document.getElementById('repoInput');
  const repo = input.value.trim();
  if (!repo || !repo.includes('/')) return;

  const config = await getStorage(['repos']);
  const repos = config.repos || [];
  if (repos.includes(repo)) return;

  repos.push(repo);
  await setStorage({ repos });
  renderRepos(repos);
  input.value = '';
  fetchPRs();
}

async function removeRepo(repo) {
  const config = await getStorage(['repos']);
  const repos = (config.repos || []).filter(r => r !== repo);
  await setStorage({ repos });
  renderRepos(repos);
}

function renderRepos(repos) {
  document.getElementById('repoCount').textContent = repos.length;
  const list = document.getElementById('repoList');

  if (repos.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="icon">📦</div>
        <h3>No repositories</h3>
        <p>Add a repository above to start tracking PRs.</p>
      </div>`;
    return;
  }

  list.innerHTML = repos.map(repo => {
    const [owner, name] = repo.split('/');
    return `
      <div class="repo-item">
        <div>
          <div class="repo-name">${name}</div>
          <div class="repo-owner">${owner}</div>
        </div>
        <button class="btn btn-danger btn-sm repo-remove-btn" data-repo="${repo}">Remove</button>
      </div>`;
  }).join('');
}

// --- Discovery ---

let availableRepos = [];

async function discoverRepos() {
  const btn = document.getElementById('discoverReposBtn');
  const list = document.getElementById('discoveryList');
  const results = document.getElementById('discoveryResults');

  btn.textContent = '⌛ Loading...';
  btn.disabled = true;

  chrome.runtime.sendMessage({ type: 'FETCH_REPOS' }, (response) => {
    btn.textContent = '🌐 Load My Repositories';
    btn.disabled = false;

    if (response && response.success && response.repos) {
      availableRepos = response.repos;
      list.style.display = 'block';
      filterDiscoveryResults('');
    } else {
      alert(`Failed to load repositories: ${response?.error || 'Unknown error'}`);
    }
  });
}

async function filterDiscoveryResults(query) {
  const container = document.getElementById('discoveryResults');
  const config = await getStorage(['repos']);
  const connectedRepos = config.repos || [];

  const filtered = availableRepos.filter(repo => 
    repo.full_name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 50); // Limit to 50 for performance

  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding:10px;text-align:center;font-size:12px;color:var(--text-muted);">No matching repositories found.</div>';
    return;
  }

  container.innerHTML = filtered.map(repo => {
    const isConnected = connectedRepos.includes(repo.full_name);
    return `
      <div class="discovery-item ${isConnected ? 'connected' : ''}" 
           data-repo="${repo.full_name}">
        <div class="repo-full-name">${repo.full_name}</div>
        ${isConnected ? '<span class="status-badge">Connected</span>' : '<span class="add-icon">+</span>'}
      </div>`;
  }).join('');
}

async function addRepoFromDiscovery(fullName) {
  const config = await getStorage(['repos']);
  const repos = config.repos || [];
  if (repos.includes(fullName)) return;

  repos.push(fullName);
  await setStorage({ repos });
  renderRepos(repos);
  filterDiscoveryResults(document.getElementById('repoSearchInput').value);
  fetchPRs();
}

// --- Reminders ---

async function addReminder() {
  const input = document.getElementById('reminderTimeInput');
  const time = input.value;
  if (!time) return;

  const config = await getStorage(['reminders']);
  const reminders = config.reminders || [];
  if (reminders.includes(time)) return;

  reminders.push(time);
  reminders.sort();
  await setStorage({ reminders });
  renderReminders(reminders);
}

async function removeReminder(time) {
  const config = await getStorage(['reminders']);
  const reminders = (config.reminders || []).filter(r => r !== time);
  await setStorage({ reminders });
  renderReminders(reminders);
}

function renderReminders(reminders) {
  const list = document.getElementById('reminderList');
  if (reminders.length === 0) {
    list.innerHTML = '<p style="font-size:12px;color:var(--text-muted);padding:4px 0;">No reminders set.</p>';
    return;
  }

  list.innerHTML = reminders.map(time => `
    <div class="reminder-item">
      <span class="reminder-time">${formatTime(time)}</span>
      <button class="btn btn-danger btn-sm reminder-remove-btn" data-time="${time}">✕</button>
    </div>`).join('');
}

function formatTime(time24) {
  const [h, m] = time24.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

// --- Tags ---

async function addTag() {
  const input = document.getElementById('tagInput');
  const tag = input.value.trim();
  if (!tag) return;

  const config = await getStorage(['urgentTags']);
  const tags = config.urgentTags || [];
  if (tags.some(t => t.toLowerCase() === tag.toLowerCase())) return;

  tags.push(tag);
  await setStorage({ urgentTags: tags });
  renderTags(tags);
  input.value = '';
}

async function removeTag(tag) {
  const config = await getStorage(['urgentTags']);
  const tags = (config.urgentTags || []).filter(t => t !== tag);
  await setStorage({ urgentTags: tags });
  renderTags(tags);
}

function renderTags(tags) {
  const list = document.getElementById('tagList');
  if (tags.length === 0) {
    list.innerHTML = '<p style="font-size:12px;color:var(--text-muted);">No urgent tags configured.</p>';
    return;
  }

  list.innerHTML = tags.map(tag => `
    <span class="tag-chip">
      ${tag}
      <span class="remove tag-remove-btn" data-tag="${tag}">✕</span>
    </span>`).join('');
}

// --- Toggles ---

function renderToggles(config) {
  const notifToggle = document.getElementById('toggleNotif');
  const urgentToggle = document.getElementById('toggleUrgent');

  if (config.notificationsEnabled === false) notifToggle.classList.remove('on');
  else notifToggle.classList.add('on');

  if (config.urgentNotificationsEnabled === false) urgentToggle.classList.remove('on');
  else urgentToggle.classList.add('on');
}

// --- Dashboard ---

async function fetchPRs() {
  document.getElementById('prLoading').style.display = '';
  document.getElementById('prContent').innerHTML = '';
  document.getElementById('statusText').textContent = 'Fetching...';

  chrome.runtime.sendMessage({ type: 'FETCH_PRS' }, (response) => {
    document.getElementById('prLoading').style.display = 'none';

    if (response && response.success && response.data) {
      renderDashboard(response.data);
      updateStatus(new Date().toISOString());
    } else {
      document.getElementById('statusText').textContent = response?.error || 'Error fetching data';
    }
  });
}

function renderDashboard(data) {
  document.getElementById('statAssigned').textContent = data.stats.assignedToReview;
  document.getElementById('statMyPending').textContent = data.stats.myPRsPending;
  document.getElementById('statChanges').textContent = data.stats.changesRequested;
  document.getElementById('statTotal').textContent = data.stats.totalOpen;

  const content = document.getElementById('prContent');
  let html = '';

  if (data.assignedToMe.length > 0) {
    html += `<div class="pr-section-title">🔍 Assigned to Review (${data.assignedToMe.length})</div>`;
    html += data.assignedToMe.map(pr => renderPRItem(pr, 'open')).join('');
  }

  if (data.myPRsPending.length > 0) {
    html += `<div class="pr-section-title">⏳ My PRs Pending Review (${data.myPRsPending.length})</div>`;
    html += data.myPRsPending.map(pr => renderPRItem(pr, 'open')).join('');
  }

  if (data.changesRequested.length > 0) {
    html += `<div class="pr-section-title">🔄 Changes Requested (${data.changesRequested.length})</div>`;
    html += data.changesRequested.map(pr => renderPRItem(pr, 'changes')).join('');
  }

  if (!html) {
    html = `
      <div class="empty-state">
        <div class="icon">✅</div>
        <h3>All clear!</h3>
        <p>No PRs need your attention right now.</p>
      </div>`;
  }

  content.innerHTML = html;
}

function renderPRItem(pr, type) {
  const icon = type === 'changes'
    ? '<svg class="pr-icon changes" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z"/></svg>'
    : '<svg class="pr-icon open" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z"/></svg>';

  const labels = pr.labels.map(l => {
    const isUrgent = pr.isUrgent || ['important', 'urgent', 'critical'].includes(l.name.toLowerCase());
    return `<span class="pr-label ${isUrgent ? 'important' : 'default'}">${l.name}</span>`;
  }).join('');

  const timeAgo = getTimeAgo(pr.createdAt);

  return `
    <div class="pr-item" data-url="${pr.url}">
      ${icon}
      <div class="pr-info">
        <div class="pr-title">${pr.title}</div>
        <div class="pr-meta">${pr.repo}#${pr.number} · ${pr.author} · ${timeAgo}</div>
        ${labels ? `<div class="pr-labels">${labels}</div>` : ''}
      </div>
    </div>`;
}

function getTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function updateStatus(lastFetch) {
  if (lastFetch) {
    const time = new Date(lastFetch).toLocaleTimeString();
    document.getElementById('lastUpdate').textContent = `Last updated: ${time}`;
    document.getElementById('statusText').textContent = 'Connected';
  }
}
