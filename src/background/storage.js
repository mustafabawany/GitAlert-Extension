export async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        "token",
        "repos",
        "reminders",
        "urgentTags",
        "prData",
        "notificationsEnabled",
        "urgentNotificationsEnabled",
        "username",
        "userAvatarUrl",
        "knownAssignments",
        "lastUrgentNotified",
      ],
      resolve,
    );
  });
}

export function setConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set(config, resolve);
  });
}
