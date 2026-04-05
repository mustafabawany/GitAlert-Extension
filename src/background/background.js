import { POLL_INTERVAL_MINUTES, handleAlarm, setupAlarms } from "./alarms.js";
import { pollPullRequests, githubFetch } from "./api.js";
import { getConfig } from "./storage.js";

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    token: "",
    repos: [],
    reminders: [],
    urgentTags: ["Important", "Urgent", "Critical"],
    notificationsEnabled: true,
    urgentNotificationsEnabled: true,
    lastFetch: null,
    prData: null,
    username: "",
    userAvatarUrl: "",
    knownAssignments: [],
    lastUrgentNotified: {},
  });

  chrome.alarms.create("pollPRs", { periodInMinutes: POLL_INTERVAL_MINUTES });
  chrome.alarms.create("checkReminders", { periodInMinutes: 1 });
  chrome.alarms.create("urgentPRReminder", { periodInMinutes: 5 });
});

// Handle alarms
chrome.alarms.onAlarm.addListener(handleAlarm);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "FETCH_PRS") {
    pollPullRequests()
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (msg.type === "FETCH_REPOS") {
    getConfig().then((config) => {
      githubFetch("/user/repos?per_page=100&sort=updated", config.token)
        .then((repos) => sendResponse({ success: true, repos }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }
});

setupAlarms();
