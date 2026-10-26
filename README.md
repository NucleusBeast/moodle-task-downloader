# Moodle Grey Area Saver

A small Chrome Manifest V3 extension that saves **only the grey assignment area** as a single `.html` file. The deadline, description, headings, lists, tables, clickable links, and accessible images are retained. The title is used in the filename and browser tab, not added to the saved content.

## Install

1. Extract `moodle-grey-area-saver.zip` to a permanent folder.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
5. Optionally pin **Moodle Grey Area Saver** using Chrome's Extensions menu.

Alternatively, load this repository's `extension` folder directly. No build or dependency installation is needed to use it.

## Save an assignment

1. Open the assignment in Chrome while logged into Moodle.
2. Click the extension to highlight the download area in green for 15 seconds, then click **Save grey area**.
3. Keep the popup open while images are collected, until the Save As dialog appears.
4. Choose a local destination. Check Chrome Downloads for completion.
5. Open the saved HTML file in a browser whenever needed, including offline.

Links remain clickable; the extension does not download linked websites, PDFs, or other attachments. Following links later requires a connection and sometimes a Moodle login.

## Copy for agents

Open an assignment, click the extension, then **Copy for agents**. Paste into your agent chat. Copies the assignment title, source URL, dates, description, lists, tables, and clickable-link destinations as readable text. Images become labelled URL references; image files are not copied or fetched. No agent connection, API, or backend is required. Clipboard errors are shown in the popup.

## Scope and privacy

- Matches Moodle assignment URLs ending in `/mod/assign/view.php`.
- Uses `#region-main #intro` and its nearest `.activity-header`, verified by read-only inspection of the supplied Arnes page. Includes the activity dates above `#intro`.
- Excludes the page heading, menus, account details, submission controls, submission status, and footer outside that container. If the container is absent, export stops rather than saving the whole page.
- Highlights the selected area when you open the popup; downloads only when you press Save. Uses `activeTab`, `scripting`, `downloads`, and `clipboardWrite`; no permanent host access, telemetry, upload service, storage, or background monitoring.
- Adds a temporary, non-interactive highlight overlay outside the assignment content. It follows scrolling and resizing and disappears after 15 seconds or when saving. Export constructs a separate detached document; the assignment content and styles are preserved. Does not click controls, submit forms, or navigate the page.
- Clipboard access is used only when you click **Copy for agents**. The extension does not read your clipboard.
- Only image GET requests are made during HTML export. Same-origin images can use the existing session; cross-origin requests do not send session credentials. Links are never fetched.
- Scripts, forms, event handlers, tracking attributes, and external stylesheets are excluded. The saved file blocks scripts and automatic external resource loads with a Content Security Policy.

## Images and formatting

Ordinary `<img>` pictures (including the selected `<picture>` / `srcset` image) are embedded in the HTML. If fetching fails, the extension tries to copy an already-loaded image through a detached canvas. Browser access restrictions may prevent either method. Unavailable pictures receive a visible placeholder and, when possible, a link to their original URL. The popup lists warnings; it does not claim these images were saved.

The limit is 10 MiB per image and 20 MiB of unique image data per export. Each fetch has a 10-second timeout. Canvas fallback produces a still PNG. Inline SVG diagrams, canvases, CSS background images, videos, and embedded documents are not embedded; diagrams/background images produce warnings. Regular SVG files used in `<img>` are supported when accessible.

Text formatting is copied into the export with a responsive grey wrapper. Fonts use locally available fallbacks, so exact line wrapping can differ from Moodle. No remote font or stylesheet is required.

## Development and validation

Use Bun:

```sh
bun install
bun test
```

Tests use synthetic HTML through Happy DOM with mocked image requests. They check selection boundaries, source DOM preservation, safe links, Unicode, hidden content, sanitization, image embedding, selected responsive sources, and failed-image handling. They do not launch a browser or access the live assignment.

Chrome installation, the native Save As dialog, authenticated image downloads, and offline rendering have not been browser-tested.

API references: [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting), [downloads](https://developer.chrome.com/docs/extensions/reference/api/downloads).
