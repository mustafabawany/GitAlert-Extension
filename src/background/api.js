import { getConfig, setConfig, clearAuthSession } from "./storage.js";
import { sendNotification } from "./notifications.js";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

const GITHUB_API = "https://api.github.com";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function withRetry(fn, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Don't retry auth errors — they won't recover
      if (err instanceof UnauthorizedError) throw err;

      if (attempt === retries) throw err;

      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `Attempt ${attempt}/${retries} failed, retrying in ${delay}ms...`,
        err.message,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function githubFetch(endpoint, token) {
  return withRetry(async () => {
    const res = await fetch(`${GITHUB_API}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    return res.json();
  });
}

export async function githubGraphQL(query, variables, token) {
  return withRetry(async () => {
    const res = await fetch(`${GITHUB_API}/graphql`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`GraphQL Error: ${res.status} - ${errorBody}`);
    }
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return json.data;
  });
}

async function handleAuthError() {
  console.error("Token expired or invalid. Logging out...");
  await clearAuthSession();
  sendNotification(
    "Session Expired",
    "Your GitHub token is no longer valid. Please log in again.",
  );
}

export async function pollPullRequests() {
  const config = await getConfig();
  if (!config.token || !config.repos || config.repos.length === 0) return null;

  const token = config.token;
  let username = config.username;

  if (!username) {
    try {
      const user = await githubFetch("/user", token);
      username = user.login;
      const userAvatarUrl = user.avatar_url;
      await setConfig({ username, userAvatarUrl });
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        await handleAuthError();
        return null;
      }
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
            id number title url createdAt
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
            knownAssignments.push(assignKey);
            await setConfig({ knownAssignments });
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
      if (e instanceof UnauthorizedError) {
        await handleAuthError();
        return null;
      }
      console.error(`Error fetching PRs for ${repo}:`, e);
    }
  }

  prData.stats.totalOpen = prData.allPRs.length;
  await setConfig({ prData, lastFetch: new Date().toISOString() });

  const count = prData.stats.assignedToReview;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#3fb950" });

  return prData;
}
