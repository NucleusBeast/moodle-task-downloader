import { captureGreyArea } from './capture.js';

const button = document.querySelector('#save');
const copyButton = document.querySelector('#copy');
const status = document.querySelector('#status');
const warnings = document.querySelector('#warnings');

function setBusy(busy) {
  button.disabled = busy;
  copyButton.disabled = busy;
}

function showWarnings(items = []) {
  warnings.replaceChildren();
  for (const warning of items) {
    const item = document.createElement('li');
    item.textContent = warning;
    warnings.append(item);
  }
  warnings.hidden = items.length === 0;
}

async function readArea(previewOnly = false, textOnly = false) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url ?? '')) {
    throw new Error('Open a Moodle assignment page first.');
  }
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: captureGreyArea,
    args: [{ previewOnly, textOnly }],
  });
  const result = execution?.result;
  if (!result?.ok) throw new Error(result?.error || 'Could not read this page. Reload it and try again.');
  return result;
}

async function previewArea() {
  setBusy(true);
  try {
    await readArea(true);
    status.textContent = 'The area is outlined in green for 15 seconds. Save it as HTML or copy its text for your agent.';
    setBusy(false);
  } catch (error) {
    status.textContent = error.message || 'Could not highlight the assignment area.';
  }
}

button.addEventListener('click', async () => {
  setBusy(true);
  showWarnings();
  status.textContent = 'Preparing your file. Keep this popup open until Save As appears.';
  try {
    const result = await readArea();

    showWarnings(result.warnings);
    // A data URL survives popup closure; a popup-owned blob URL may not.
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not prepare the HTML file.'));
      reader.readAsDataURL(new Blob([result.html], { type: 'text/html;charset=utf-8' }));
    });
    await chrome.downloads.download({ url, filename: result.filename, saveAs: true, conflictAction: 'uniquify' });
    status.textContent = `Download requested: ${result.imagesSaved} image(s) embedded. Check Chrome Downloads for completion.${result.warnings.length ? ' Some content could not be embedded; see below.' : ''}`;
  } catch (error) {
    status.textContent = error.message || 'The export failed. Please try again.';
  } finally {
    setBusy(false);
  }
});

copyButton.addEventListener('click', async () => {
  setBusy(true);
  showWarnings();
  status.textContent = 'Preparing assignment text…';
  try {
    const result = await readArea(false, true);
    await navigator.clipboard.writeText(result.text);
    showWarnings(result.warnings);
    status.textContent = 'Copied! Paste into your agent. Includes the title, source URL, dates, text and links. Images are included as text references.';
  } catch (error) {
    status.textContent = `Could not copy: ${error.message || 'Please try again.'}`;
  } finally {
    setBusy(false);
  }
});

previewArea();
