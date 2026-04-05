export function sendNotification(title, message, url) {
  chrome.notifications.create(
    {
      type: "basic",
      iconUrl: "/assets/icon.png",
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
