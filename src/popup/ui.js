import { formatTime, getTimeAgo } from "./utils.js";

export function resetDashboard() {
  document.getElementById("statAssigned").textContent = "0";
  document.getElementById("statMyPending").textContent = "0";
  document.getElementById("statChanges").textContent = "0";
  document.getElementById("statTotal").textContent = "0";
  document.getElementById("prContent").innerHTML = "";
  document.getElementById("prLoading").style.display = "none";
  document.getElementById("statusText").textContent = "Not connected";
  document.getElementById("lastUpdate").textContent = "";
}

export function showSetup() {
  document.getElementById("setupScreen").style.display = "";
  document.getElementById("mainApp").style.display = "none";
  document.getElementById("refreshBtn").style.display = "none";
  document.getElementById("settingsBtn").style.display = "none";
}

export function showApp(config, currentUrgentTags, hiddenPRs = []) {
  document.getElementById("setupScreen").style.display = "none";
  document.getElementById("mainApp").style.display = "";
  document.getElementById("refreshBtn").style.display = "flex";
  document.getElementById("settingsBtn").style.display = "flex";

  renderRepos(config.repos || []);
  renderReminders(config.reminders || []);
  renderTags(currentUrgentTags);
  renderToggles(config);

  if (config.username) {
    document.getElementById("userProfile").style.display = "flex";
    document.getElementById("userLogin").textContent = `@${config.username}`;
    if (config.userAvatarUrl) {
      document.getElementById("userAvatar").src = config.userAvatarUrl;
    }
  }

  if (config.prData) {
    renderDashboard(config.prData, currentUrgentTags, hiddenPRs);
    updateStatus(config.lastFetch);
  }
}

export function renderRepos(repos) {
  document.getElementById("repoCount").textContent = repos.length;
  const list = document.getElementById("repoList");
  if (repos.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="icon">📦</div>
        <h3>No repositories</h3>
        <p>Add a repository above to start tracking PRs.</p>
      </div>`;
    return;
  }

  list.innerHTML = repos
    .map((repo) => {
      const [owner, name] = repo.split("/");
      return `
      <div class="repo-item">
        <div>
          <div class="repo-name">${name}</div>
          <div class="repo-owner">${owner}</div>
        </div>
        <button class="btn btn-danger btn-sm repo-remove-btn" data-repo="${repo}">Remove</button>
      </div>`;
    })
    .join("");
}

export function renderReminders(reminders) {
  const list = document.getElementById("reminderList");
  if (reminders.length === 0) {
    list.innerHTML =
      '<p style="font-size:12px;color:var(--text-muted);padding:4px 0;">No reminders set.</p>';
    return;
  }
  list.innerHTML = reminders
    .map(
      (time) => `
    <div class="reminder-item">
      <span class="reminder-time">${formatTime(time)}</span>
      <button class="btn btn-danger btn-sm reminder-remove-btn" data-time="${time}">✕</button>
    </div>`,
    )
    .join("");
}

export function renderTags(tags) {
  const list = document.getElementById("tagList");
  if (tags.length === 0) {
    list.innerHTML =
      '<p style="font-size:12px;color:var(--text-muted);">No urgent tags configured.</p>';
    return;
  }
  list.innerHTML = tags
    .map(
      (tag) => `
    <span class="tag-chip">
      ${tag}
      <span class="remove tag-remove-btn" data-tag="${tag}">✕</span>
    </span>`,
    )
    .join("");
}

export function renderToggles(config) {
  const notifToggle = document.getElementById("toggleNotif");
  const urgentToggle = document.getElementById("toggleUrgent");
  if (config.notificationsEnabled === false) notifToggle.classList.remove("on");
  else notifToggle.classList.add("on");
  if (config.urgentNotificationsEnabled === false)
    urgentToggle.classList.remove("on");
  else urgentToggle.classList.add("on");
}

export function renderDashboard(
  data,
  currentUrgentTags,
  hiddenPRs = [],
  showHidden = false,
) {
  document.getElementById("statAssigned").textContent =
    data.stats.assignedToReview;
  document.getElementById("statMyPending").textContent =
    data.stats.myPRsPending;
  document.getElementById("statChanges").textContent =
    data.stats.changesRequested;
  document.getElementById("statTotal").textContent = data.stats.totalOpen;

  const hiddenSet = new Set(hiddenPRs);
  const isHidden = (pr) => hiddenSet.has(`${pr.repo}#${pr.number}`);

  const filterPRs = (prs) => {
    if (showHidden) return prs;
    return prs.filter((pr) => !isHidden(pr));
  };

  const totalHidden =
    data.assignedToMe.filter(isHidden).length +
    data.myPRsPending.filter(isHidden).length +
    data.changesRequested.filter(isHidden).length;

  const content = document.getElementById("prContent");
  let html = "";

  if (totalHidden > 0) {
    html += `<div class="hidden-toggle-bar">
      <button class="hidden-toggle-btn" id="toggleHiddenBtn">
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
          ${
            showHidden
              ? '<path d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.831.88 9.577.43 8.899a1.62 1.62 0 0 1 0-1.798c.45-.678 1.367-1.932 2.637-3.023C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.824.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z"/>'
              : '<path d="M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.792 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.831.88 9.577.43 8.899a1.618 1.618 0 0 1 0-1.798c.321-.484.867-1.21 1.575-1.942L.31 3.357A.75.75 0 0 1 .143 2.31Zm3.386 3.378a13.713 13.713 0 0 0-1.85 2.244.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.175 11.758 6.527 12.5 8 12.5c1.195 0 2.31-.488 3.29-1.191L9.063 9.695A2 2 0 0 1 6.058 7.52L3.529 5.688ZM8 3.5c-.516 0-1.017.09-1.499.251a.75.75 0 1 1-.473-1.423A6.207 6.207 0 0 1 8 2c1.981 0 3.67.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.11.166-.248.365-.41.587a.75.75 0 1 1-1.21-.887c.148-.201.272-.382.371-.53a.12.12 0 0 0 0-.137c-.412-.621-1.242-1.75-2.366-2.717C10.825 4.242 9.473 3.5 8 3.5Z"/>'
          }
        </svg>
        ${showHidden ? "Hide" : "Show"} hidden PRs (${totalHidden})
      </button>
    </div>`;
  }

  const assignedFiltered = filterPRs(data.assignedToMe);
  const pendingFiltered = filterPRs(data.myPRsPending);
  const changesFiltered = filterPRs(data.changesRequested);

  if (assignedFiltered.length > 0) {
    html += `<div class="pr-section-title">🔍 Assigned to Review (${assignedFiltered.length})</div>`;
    html += assignedFiltered
      .map((pr) => renderPRItem(pr, "open", currentUrgentTags, isHidden(pr)))
      .join("");
  }
  if (pendingFiltered.length > 0) {
    html += `<div class="pr-section-title">⏳ My PRs Pending Review (${pendingFiltered.length})</div>`;
    html += pendingFiltered
      .map((pr) => renderPRItem(pr, "open", currentUrgentTags, isHidden(pr)))
      .join("");
  }
  if (changesFiltered.length > 0) {
    html += `<div class="pr-section-title">🔄 Changes Requested (${changesFiltered.length})</div>`;
    html += changesFiltered
      .map((pr) => renderPRItem(pr, "changes", currentUrgentTags, isHidden(pr)))
      .join("");
  }
  if (
    !html ||
    (assignedFiltered.length === 0 &&
      pendingFiltered.length === 0 &&
      changesFiltered.length === 0 &&
      totalHidden === 0)
  ) {
    html = `
      <div class="empty-state">
        <h3>All clear!</h3>
        <p>No PRs need your attention right now.</p>
      </div>`;
  }
  content.innerHTML = html;
}

function renderPRItem(pr, type, currentUrgentTags, isHidden = false) {
  const icon =
    type === "changes"
      ? '<svg class="pr-icon changes" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z"/></svg>'
      : '<svg class="pr-icon open" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z"/></svg>';

  const labels = pr.labels
    .map((l) => {
      const isUrgent =
        pr.isUrgent ||
        currentUrgentTags.some((t) => t.toLowerCase() === l.name.toLowerCase());
      return `<span class="pr-label ${isUrgent ? "important" : "default"}">${l.name}</span>`;
    })
    .join("");

  const prKey = `${pr.repo}#${pr.number}`;
  const hideBtn = isHidden
    ? `<button class="pr-hide-btn unhide" data-pr-key="${prKey}" title="Unhide this PR">
        <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.831.88 9.577.43 8.899a1.62 1.62 0 0 1 0-1.798c.45-.678 1.367-1.932 2.637-3.023C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.824.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z"/></svg>
       </button>`
    : `<button class="pr-hide-btn" data-pr-key="${prKey}" title="Hide this PR">
        <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.792 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.831.88 9.577.43 8.899a1.618 1.618 0 0 1 0-1.798c.321-.484.867-1.21 1.575-1.942L.31 3.357A.75.75 0 0 1 .143 2.31Zm3.386 3.378a13.713 13.713 0 0 0-1.85 2.244.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.175 11.758 6.527 12.5 8 12.5c1.195 0 2.31-.488 3.29-1.191L9.063 9.695A2 2 0 0 1 6.058 7.52L3.529 5.688ZM8 3.5c-.516 0-1.017.09-1.499.251a.75.75 0 1 1-.473-1.423A6.207 6.207 0 0 1 8 2c1.981 0 3.67.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.11.166-.248.365-.41.587a.75.75 0 1 1-1.21-.887c.148-.201.272-.382.371-.53a.12.12 0 0 0 0-.137c-.412-.621-1.242-1.75-2.366-2.717C10.825 4.242 9.473 3.5 8 3.5Z"/></svg>
       </button>`;

  const timeAgo = getTimeAgo(pr.createdAt);
  return `
    <div class="pr-item ${isHidden ? "pr-item-hidden" : ""}" data-url="${pr.url}">
      ${icon}
      <div class="pr-info">
        <div class="pr-title">${pr.title}</div>
        <div class="pr-meta">${pr.repo}#${pr.number} · ${pr.author} · ${timeAgo}</div>
        ${labels ? `<div class="pr-labels">${labels}</div>` : ""}
      </div>
      ${hideBtn}
    </div>`;
}

export function updateStatus(lastFetch) {
  if (lastFetch) {
    const time = new Date(lastFetch).toLocaleTimeString();
    document.getElementById("lastUpdate").textContent = `Last updated: ${time}`;
    document.getElementById("statusText").textContent = "Connected";
  }
}

export function renderDiscoveryResults(availableRepos, connectedRepos, query) {
  const container = document.getElementById("discoveryResults");
  const filtered = availableRepos
    .filter((repo) =>
      repo.full_name.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 50);

  if (filtered.length === 0) {
    container.innerHTML =
      '<div class="discovery-empty">No matching repositories found.</div>';
    return;
  }

  container.innerHTML = filtered
    .map((repo) => {
      const isConnected = connectedRepos.includes(repo.full_name);
      return `
      <div class="discovery-item ${isConnected ? "connected" : ""}" data-repo="${repo.full_name}">
        <div class="repo-full-name">${repo.full_name}</div>
        ${isConnected ? '<span class="status-badge">Connected</span>' : '<span class="add-icon">+</span>'}
      </div>`;
    })
    .join("");
}

export function showTokenError(msg) {
  const errorEl = document.getElementById("tokenError");
  errorEl.textContent = msg;
  errorEl.style.display = "block";
}
