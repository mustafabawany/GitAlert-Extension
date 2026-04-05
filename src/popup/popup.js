import { getStorage, setStorage } from "./storage.js";
import * as UI from "./ui.js";

let availableRepos = [];
let currentUrgentTags = [];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const config = await getStorage([
    "token",
    "repos",
    "reminders",
    "urgentTags",
    "notificationsEnabled",
    "urgentNotificationsEnabled",
    "prData",
    "lastFetch",
    "username",
    "userAvatarUrl",
  ]);

  currentUrgentTags = config.urgentTags || ["Important", "Urgent", "Critical"];

  if (!config.token) {
    UI.showSetup();
  } else {
    UI.showApp(config, currentUrgentTags);
    if (!config.prData) fetchPRs();
  }

  bindEvents();
}

function bindEvents() {
  // Token
  document
    .getElementById("saveTokenBtn")
    .addEventListener("click", validateAndSaveToken);
  document.getElementById("tokenInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") validateAndSaveToken();
  });

  document
    .getElementById("disconnectBtn")
    .addEventListener("click", async () => {
      await setStorage({
        token: "",
        username: "",
        userAvatarUrl: "",
        repos: [],
        reminders: [],
        urgentTags: ["Important", "Urgent", "Critical"],
        notificationsEnabled: true,
        urgentNotificationsEnabled: true,
        prData: null,
        lastFetch: null,
        knownAssignments: [],
        lastUrgentNotified: {},
      });

      chrome.action.setBadgeText({ text: "" });

      document.getElementById("userProfile").style.display = "none";
      document.getElementById("userAvatar").src = "";
      document.getElementById("userLogin").textContent = "";
      document.getElementById("refreshBtn").style.display = "none";
      document.getElementById("settingsBtn").style.display = "none";
      document.getElementById("tokenInput").value = "";
      document.getElementById("tokenError").style.display = "none";

      UI.resetDashboard();
      UI.showSetup();
    });

  // Tabs
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
    });
  });

  document.getElementById("refreshBtn").addEventListener("click", fetchPRs);

  document.getElementById("settingsBtn").addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.remove("active"));
    document
      .querySelectorAll(".tab-content")
      .forEach((c) => c.classList.remove("active"));
    document.querySelector('[data-tab="settings"]').classList.add("active");
    document.getElementById("tab-settings").classList.add("active");
  });

  document
    .getElementById("addReminderBtn")
    .addEventListener("click", addReminder);
  document.getElementById("addTagBtn").addEventListener("click", addTag);
  document.getElementById("tagInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") addTag();
  });

  document.querySelectorAll(".toggle").forEach((toggle) => {
    toggle.addEventListener("click", async () => {
      const key = toggle.dataset.key;
      const isOn = toggle.classList.toggle("on");
      await setStorage({ [key]: isOn });
    });
  });

  // Discovery
  document
    .getElementById("discoverReposBtn")
    .addEventListener("click", openDiscoveryPanel);
  document
    .getElementById("discoveryCloseBtn")
    .addEventListener("click", closeDiscoveryPanel);
  document
    .getElementById("discoveryOverlay")
    .addEventListener("click", closeDiscoveryPanel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDiscoveryPanel();
  });
  document
    .getElementById("repoSearchInput")
    .addEventListener("input", async (e) => {
      const config = await getStorage(["repos"]);
      UI.renderDiscoveryResults(
        availableRepos,
        config.repos || [],
        e.target.value,
      );
    });

  // Event Delegation
  document.getElementById("prContent").addEventListener("click", (e) => {
    const prItem = e.target.closest(".pr-item");
    if (prItem && prItem.dataset.url) window.open(prItem.dataset.url, "_blank");
  });

  document.getElementById("repoList").addEventListener("click", (e) => {
    if (e.target.classList.contains("repo-remove-btn")) {
      const repo = e.target.dataset.repo;
      if (repo) removeRepo(repo);
    }
  });

  document.getElementById("discoveryResults").addEventListener("click", (e) => {
    const item = e.target.closest(".discovery-item");
    if (item && !item.classList.contains("connected")) {
      const fullName = item.dataset.repo;
      if (fullName) addRepoFromDiscovery(fullName);
    }
  });

  document.getElementById("reminderList").addEventListener("click", (e) => {
    if (e.target.classList.contains("reminder-remove-btn")) {
      const time = e.target.dataset.time;
      if (time) removeReminder(time);
    }
  });

  document.getElementById("tagList").addEventListener("click", (e) => {
    if (e.target.classList.contains("tag-remove-btn")) {
      const tag = e.target.dataset.tag;
      if (tag) removeTag(tag);
    }
  });
}

async function validateAndSaveToken() {
  const tokenInput = document.getElementById("tokenInput");
  const saveBtn = document.getElementById("saveTokenBtn");
  const errorEl = document.getElementById("tokenError");
  const token = tokenInput.value.trim();

  if (!token) {
    UI.showTokenError("Please enter a token.");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="btn-spinner"></span> Validating...';
  errorEl.style.display = "none";

  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) {
      const msg =
        res.status === 401
          ? "Invalid token — authentication failed."
          : res.status === 403
            ? "Token lacks required permissions (needs \`repo\` scope)."
            : `GitHub returned an error (${res.status}).`;
      UI.showTokenError(msg);
      return;
    }

    const user = await res.json();
    await setStorage({
      token,
      username: user.login,
      userAvatarUrl: user.avatar_url,
    });

    const config = await getStorage([
      "token",
      "repos",
      "reminders",
      "urgentTags",
      "notificationsEnabled",
      "urgentNotificationsEnabled",
      "prData",
      "lastFetch",
      "username",
      "userAvatarUrl",
    ]);
    currentUrgentTags = config.urgentTags || [
      "Important",
      "Urgent",
      "Critical",
    ];
    UI.showApp(config, currentUrgentTags);
    fetchPRs();
  } catch {
    UI.showTokenError("Network error — could not reach GitHub.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Connect";
  }
}

function fetchPRs() {
  UI.resetDashboard();
  document.getElementById("prLoading").style.display = "";
  document.getElementById("statusText").textContent = "Fetching...";

  chrome.runtime.sendMessage({ type: "FETCH_PRS" }, (response) => {
    document.getElementById("prLoading").style.display = "none";
    if (response && response.success) {
      if (response.data) {
        UI.renderDashboard(response.data, currentUrgentTags);
        UI.updateStatus(new Date().toISOString());
      } else {
        document.getElementById("statusText").textContent = "Connected";
      }
    } else {
      document.getElementById("statusText").textContent =
        response?.error || "Error fetching data";
    }
  });
}

function openDiscoveryPanel() {
  const overlay = document.getElementById("discoveryOverlay");
  const panel = document.getElementById("discoveryPanel");
  const btn = document.getElementById("discoverReposBtn");
  const resultsEl = document.getElementById("discoveryResults");

  overlay.style.display = "block";
  panel.style.removeProperty("display");
  document.getElementById("repoSearchInput").value = "";
  resultsEl.innerHTML =
    '<div class="discovery-loading"><div class="spinner"></div> Loading repositories...</div>';
  btn.disabled = true;

  chrome.runtime.sendMessage({ type: "FETCH_REPOS" }, async (response) => {
    btn.disabled = false;
    if (response && response.success && response.repos) {
      availableRepos = response.repos;
      const config = await getStorage(["repos"]);
      UI.renderDiscoveryResults(availableRepos, config.repos || [], "");
    } else {
      resultsEl.innerHTML = `<div class="discovery-error">⚠ Failed to load: ${response?.error || "Unknown error"}</div>`;
    }
  });
}

function closeDiscoveryPanel() {
  document.getElementById("discoveryOverlay").style.display = "none";
  document.getElementById("discoveryPanel").style.display = "none";
  availableRepos = [];
}

async function addRepoFromDiscovery(fullName) {
  const config = await getStorage(["repos"]);
  const repos = config.repos || [];
  if (repos.includes(fullName)) return;
  repos.push(fullName);
  await setStorage({ repos });
  UI.renderRepos(repos);
  UI.renderDiscoveryResults(
    availableRepos,
    repos,
    document.getElementById("repoSearchInput").value,
  );
  fetchPRs();
}

async function removeRepo(repo) {
  const config = await getStorage(["repos"]);
  const repos = (config.repos || []).filter((r) => r !== repo);
  await setStorage({ repos });
  UI.renderRepos(repos);
  fetchPRs();
}

async function addReminder() {
  const input = document.getElementById("reminderTimeInput");
  const time = input.value;
  if (!time) return;

  const config = await getStorage(["reminders"]);
  const reminders = config.reminders || [];
  if (reminders.includes(time)) return;

  reminders.push(time);
  reminders.sort();
  await setStorage({ reminders });
  UI.renderReminders(reminders);
}

async function removeReminder(time) {
  const config = await getStorage(["reminders"]);
  const reminders = (config.reminders || []).filter((r) => r !== time);
  await setStorage({ reminders });
  UI.renderReminders(reminders);
}

async function addTag() {
  const input = document.getElementById("tagInput");
  const tag = input.value.trim();
  if (!tag) return;

  const config = await getStorage(["urgentTags", "prData"]);
  const tags = config.urgentTags || [];
  if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;

  tags.push(tag);
  currentUrgentTags = tags;
  await setStorage({ urgentTags: tags });
  UI.renderTags(tags);
  if (config.prData) UI.renderDashboard(config.prData, currentUrgentTags);
  input.value = "";
}

async function removeTag(tag) {
  const config = await getStorage(["urgentTags", "prData"]);
  const tags = (config.urgentTags || []).filter((t) => t !== tag);
  currentUrgentTags = tags;
  await setStorage({ urgentTags: tags });
  UI.renderTags(tags);
  if (config.prData) UI.renderDashboard(config.prData, currentUrgentTags);
}
