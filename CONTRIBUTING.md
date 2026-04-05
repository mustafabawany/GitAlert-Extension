# Contributing to GitAlert

We want to make contributing to this project as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features

## Developing Locally

### 1. Project Architecture

The extension is a strictly modular application:

- `src/background/`: Contains our Service Worker logic (API requests, Chrome alarms, Chrome Storage interaction).
- `src/popup/`: Contains our UI code for the extension popup.
- `assets/`: Contains generic images and icons used in HTML layout and extension manifests.

### 2. Basic Setup

We use `npm` to handle the formatters.

```bash
# Install Prettier and ESLint
npm install

# Run the formatter before committing
npx prettier --write .
```

### 3. Loading the Extension

Navigate to your `chrome://extensions/` page and click **Load unpacked**.
If you modify `src/popup` code, you can easily just close and re-open the popup!
If you modify `src/background` code, you must hit the little circular **Reload** icon on the extension page for the changes to persist and restart the service worker.

### 4. Making a Pull Request

1. Fork the repo and create your branch from `develop`.
2. Make your modular changes. (Do not write monolithic JS files, please encapsulate).
3. If you've added code that should be tested, add tests.
4. Ensure your code is formatted properly (`npx prettier --write .`).
5. Ensure the extension runs unpacking without errors on your screen.
6. Create that PR!
