// GitAlert Background Service Worker

const GITHUB_API = "https://api.github.com";
const POLL_INTERVAL_MINUTES = 2;

// Track known PR assignments to detect new ones
// Moved to chrome.storage.local to persist across service worker restarts

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
    knownAssignments: [], // Array of "repo#number" strings
    lastUrgentNotified: {}, // Map of "repo#number" -> timestamp
  });

  // Set up polling alarm
  chrome.alarms.create("pollPRs", { periodInMinutes: POLL_INTERVAL_MINUTES });
  chrome.alarms.create("checkReminders", { periodInMinutes: 1 });
  chrome.alarms.create("urgentPRReminder", { periodInMinutes: 5 });
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "pollPRs") {
    await pollPullRequests();
  } else if (alarm.name === "checkReminders") {
    await checkScheduledReminders();
  } else if (alarm.name === "urgentPRReminder") {
    await checkUrgentPRs();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "FETCH_PRS") {
    pollPullRequests()
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (msg.type === "GET_DATA") {
    chrome.storage.local.get(["prData", "lastFetch", "username"], (result) => {
      sendResponse(result);
    });
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

async function getConfig() {
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

async function githubFetch(endpoint, token) {
  const res = await fetch(`${GITHUB_API}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json();
}

async function githubGraphQL(query, variables, token) {
  const res = await fetch(`${GITHUB_API}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`GraphQL Error: ${res.status} - ${errorBody}`);
  }
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

async function pollPullRequests() {
  const config = await getConfig();
  if (!config.token || !config.repos || config.repos.length === 0) return null;

  const token = config.token;
  let username = config.username;

  if (!username) {
    try {
      const user = await githubFetch("/user", token);
      username = user.login;
      const userAvatarUrl = user.avatar_url;
      chrome.storage.local.set({ username, userAvatarUrl });
    } catch (e) {
      console.error("Failed to get user:", e);
      return null;
    }
  }

  const prData = {
    assignedToMe: [],
    myPRsPending: [],
    changesRequested: [],
    allPRs: [],
    stats: {
      assignedToReview: 0,
      myPRsPending: 0,
      changesRequested: 0,
      totalOpen: 0,
    },
  };

  const query = `
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        pullRequests(states: OPEN, first: 50, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes {
            id
            number
            title
            url
            createdAt
            author { login avatarUrl }
            labels(first: 10) { nodes { name color } }
            reviewRequests(first: 10) {
              nodes {
                requestedReviewer {
                  ... on User { login }
                }
              }
            }
            latestReviews(first: 20) {
              nodes {
                author { login }
                state
              }
            }
          }
        }
      }
    }
  `;

  for (const repo of config.repos) {
    try {
      const [owner, name] = repo.split("/");
      const data = await githubGraphQL(query, { owner, name }, token);
      const prs = data.repository.pullRequests.nodes;

      for (const pr of prs) {
        const reviewers = pr.reviewRequests.nodes
          .map((rn) => rn.requestedReviewer?.login)
          .filter(Boolean);

        const prInfo = {
          id: pr.id,
          number: pr.number,
          title: pr.title,
          url: pr.url,
          repo: repo,
          author: pr.author.login,
          authorAvatar: pr.author.avatarUrl,
          createdAt: pr.createdAt,
          labels: pr.labels.nodes.map((l) => ({
            name: l.name,
            color: l.color,
          })),
          reviewers: reviewers,
        };

        prData.allPRs.push(prInfo);

          if (config.urgentNotificationsEnabled) {
            const isUrgent = prInfo.labels.some((l) =>
              (config.urgentTags || []).some(
                (tag) => l.name.toLowerCase() === tag.toLowerCase(),
              ),
            );
            if (isUrgent) prInfo.isUrgent = true;
          }

          // Assigned to me
          if (reviewers.includes(username)) {
            prData.assignedToMe.push(prInfo);
            prData.stats.assignedToReview++;

            const assignKey = `${repo}#${pr.number}`;
            const knownAssignments = config.knownAssignments || [];
            if (!knownAssignments.includes(assignKey)) {
              // Always mark as seen so we don't spam when notifications are re-enabled
              knownAssignments.push(assignKey);
              chrome.storage.local.set({ knownAssignments });
              if (config.notificationsEnabled) {
                sendNotification(
                  "New PR Review Request",
                  `${pr.author.login} requested your review on:\n${pr.title}`,
                  pr.url,
                );
              }
            }
          }

        // My PRs Pending
        if (pr.author.login === username && reviewers.length > 0) {
          prData.myPRsPending.push(prInfo);
          prData.stats.myPRsPending++;
        }

        // Changes Requested on my PRs
        if (pr.author.login === username) {
          const latestReviews = {};
          pr.latestReviews.nodes.forEach((r) => {
            latestReviews[r.author.login] = r.state;
          });
          if (Object.values(latestReviews).includes("CHANGES_REQUESTED")) {
            prData.changesRequested.push(prInfo);
            prData.stats.changesRequested++;
          }
        }
      }
    } catch (e) {
      console.error(`Error fetching PRs for ${repo}:`, e);
    }
  }

  prData.stats.totalOpen = prData.allPRs.length;
  chrome.storage.local.set({ prData, lastFetch: new Date().toISOString() });

  const count = prData.stats.assignedToReview;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#3fb950" });

  return prData;
}

async function checkScheduledReminders() {
  const config = await getConfig();
  if (!config.notificationsEnabled) return;  // respect the notifications toggle
  if (!config.reminders || config.reminders.length === 0) return;
  if (!config.prData || config.prData.stats.assignedToReview === 0) return;

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;

  for (const reminder of config.reminders) {
    if (reminder === currentTime) {
      sendNotification(
        "⏰ PR Review Reminder",
        `You have ${config.prData.stats.assignedToReview} PR(s) waiting for your review.`,
        null,
      );
    }
  }
}

async function checkUrgentPRs() {
  const config = await getConfig();
  if (!config.urgentNotificationsEnabled) return;
  if (!config.prData || !config.prData.assignedToMe) return;

  const lastUrgentNotified = config.lastUrgentNotified || {};
  const now = Date.now();
  const RE_NOTIFY_INTERVAL = 5 * 60 * 1000; // 5 minutes

  const urgentPRs = config.prData.assignedToMe.filter((pr) => pr.isUrgent);

  let updatedNotifications = false;

  for (const pr of urgentPRs) {
    const prKey = `${pr.repo}#${pr.number}`;
    const lastNotified = lastUrgentNotified[prKey] || 0;

    if (now - lastNotified > RE_NOTIFY_INTERVAL) {
      sendNotification(
        "🚨 Urgent PR Needs Review!",
        `[${pr.repo}] ${pr.title}\nThis PR has an urgent label and needs your attention.`,
        pr.url,
      );
      lastUrgentNotified[prKey] = now;
      updatedNotifications = true;
    }
  }

  if (updatedNotifications) {
    chrome.storage.local.set({ lastUrgentNotified });
  }
}

function sendNotification(title, message, url) {
  chrome.notifications.create(
    {
      type: "basic",
      iconUrl: "icon.png",
      title,
      message,
      silent: false,
      priority: 2,
    },
    (notifId) => {
      if (url) {
        chrome.notifications.onClicked.addListener(function handler(clickedId) {
          if (clickedId === notifId) {
            chrome.tabs.create({ url });
            chrome.notifications.onClicked.removeListener(handler);
          }
        });
      }
    },
  );
}

// Ensure alarms exist on startup (guards against service worker restarts)
chrome.alarms.get("pollPRs", (alarm) => {
  if (!alarm) chrome.alarms.create("pollPRs", { periodInMinutes: POLL_INTERVAL_MINUTES });
});
chrome.alarms.get("checkReminders", (alarm) => {
  if (!alarm) chrome.alarms.create("checkReminders", { periodInMinutes: 1 });
});
chrome.alarms.get("urgentPRReminder", (alarm) => {
  if (!alarm) chrome.alarms.create("urgentPRReminder", { periodInMinutes: 5 });
});
