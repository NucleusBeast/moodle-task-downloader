import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { captureGreyArea } from '../extension/capture.js';

let window;
const savedGlobals = {};
const globalNames = ['document', 'location', 'getComputedStyle', 'FileReader', 'fetch'];
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), c => c.charCodeAt(0));

function fixture(content = '<p>Assignment text <strong>with emphasis</strong>.</p>') {
  window.document.body.innerHTML = `<nav>Private navigation</nav><div id="region-main">
    <h2>01: Hevristična evalvacija</h2>
    <div class="activity-header" style="background:#f5f5f5">
      <span class="sr-only">Completion requirements</span>
      <div class="activity-information" data-activityname="01: Hevristična evalvacija">
        <div class="activity-dates"><strong>Rok za oddajo:</strong> 27 oktober 2026</div>
      </div>
      <div id="intro"><div class="no-overflow">${content}</div></div>
    </div>
    <form><button>Submit assignment</button></form><table><tr><td>Private submission status</td></tr></table>
  </div>`;
}

function parsed(result) {
  return new window.DOMParser().parseFromString(result.html, 'text/html');
}

beforeEach(() => {
  window = new Window({ url: 'https://school.example/mod/assign/view.php?id=123', settings: {
    disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true,
  } });
  for (const name of globalNames) savedGlobals[name] = globalThis[name];
  globalThis.document = window.document;
  globalThis.location = window.location;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.FileReader = window.FileReader;
  globalThis.fetch = async () => { throw new Error('Network is disabled in tests'); };
  fixture();
});

afterEach(() => {
  for (const name of globalNames) {
    if (savedGlobals[name] === undefined) delete globalThis[name];
    else globalThis[name] = savedGlobals[name];
  }
  window.happyDOM.abort();
});

describe('grey area export (synthetic DOM, no browser or live requests)', () => {
  test('agent text includes context, readable blocks, links, lists and table rows', async () => {
    fixture('<h3>Instructions</h3><p>First paragraph.</p><p>Second paragraph.</p><ul><li>One</li><li>Two</li></ul><table><tr><th>Task</th><th>Points</th></tr><tr><td>Report</td><td>10</td></tr></table><a href="/rubric.pdf">Rubric</a><pre>const x = 1;\n  return x;</pre>');
    const original = document.documentElement.outerHTML;
    const result = await captureGreyArea({ textOnly: true });
    expect(result.ok).toBe(true);
    expect(result.text).toContain('01: Hevristična evalvacija\nSource: https://school.example/mod/assign/view.php?id=123');
    expect(result.text).toContain('Rok za oddajo:');
    expect(result.text).toContain('First paragraph.\n\nSecond paragraph.');
    expect(result.text).toContain('- One\n\n- Two');
    expect(result.text).toContain('Task | Points\n\nReport | 10');
    expect(result.text).toContain('Rubric (https://school.example/rubric.pdf)');
    expect(result.text).toContain('const x = 1;\n  return x;');
    expect(result.text).not.toMatch(/Private|Submit assignment|Completion requirements/);
    expect(result.html).toBeUndefined();
    expect(document.documentElement.outerHTML).toBe(original);
  });

  test('agent copy references images without fetching them and omits hidden or executable content', async () => {
    fixture('<p>čšž</p><img src="/figure.png" alt="Diagram"><img alt="Missing"><p hidden>Secret</p><script>bad()</script><a href="javascript:bad()">Unsafe link</a>');
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error('Unexpected request'); };
    const result = await captureGreyArea({ textOnly: true });
    expect(result.text).toContain('čšž');
    expect(result.text).toContain('[Image: Diagram — https://school.example/figure.png]');
    expect(result.text).toContain('[Image: Missing]');
    expect(result.text).not.toMatch(/Secret|bad\(\)|javascript:|\/null/);
    expect(requests).toBe(0);
  });

  test('agent copy rejects unsupported pages', async () => {
    window.location.href = 'https://school.example/course/view.php?id=123';
    const result = await captureGreyArea({ textOnly: true });
    expect(result.ok).toBe(false);
    expect(result.text).toBeUndefined();
  });

  test('previews the export boundary without fetching images or changing assignment content', async () => {
    fixture('<img src="/image.png"><p>Assignment text</p>');
    const root = document.querySelector('.activity-header');
    const original = root.outerHTML;
    root.getBoundingClientRect = () => ({ top: 40, left: 80, width: 700, height: 350 });
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error('Unexpected request'); };
    const result = await captureGreyArea({ previewOnly: true });
    const overlay = document.querySelector('[data-moodle-grey-area-preview]');
    expect(result).toEqual({ ok: true });
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.style.top).toBe('40px');
    expect(overlay.style.left).toBe('80px');
    expect(overlay.style.width).toBe('700px');
    expect(overlay.style.height).toBe('350px');
    expect(overlay.style.pointerEvents).toBe('none');
    expect(root.outerHTML).toBe(original);
    expect(requests).toBe(0);
    root.getBoundingClientRect = () => ({ top: -20, left: 80, width: 600, height: 350 });
    window.dispatchEvent(new window.Event('scroll'));
    expect(overlay.style.top).toBe('-20px');
    expect(overlay.style.width).toBe('600px');
  });

  test('reopening replaces the preview and cleanup restores the page', async () => {
    const original = document.documentElement.outerHTML;
    await captureGreyArea({ previewOnly: true });
    const first = document.querySelector('[data-moodle-grey-area-preview]');
    await captureGreyArea({ previewOnly: true });
    expect(first.isConnected).toBe(false);
    expect(document.querySelectorAll('[data-moodle-grey-area-preview]').length).toBe(1);
    window.__moodleGreyAreaPreviewCleanup();
    expect(document.documentElement.outerHTML).toBe(original);
    expect(window.__moodleGreyAreaPreviewCleanup).toBeUndefined();
  });

  test('export clears the preview and excludes its markup and styling', async () => {
    await captureGreyArea({ previewOnly: true });
    const result = await captureGreyArea();
    expect(result.ok).toBe(true);
    expect(document.querySelector('[data-moodle-grey-area-preview]')).toBeNull();
    expect(result.html).not.toContain('data-moodle-grey-area-preview');
    expect(result.html).not.toContain('rgba(22,134,94');
    expect(parsed(result).body.textContent).toContain('Assignment text');
  });

  test('preview rejects unsupported pages without adding a marker', async () => {
    window.location.href = 'https://school.example/course/view.php?id=123';
    expect((await captureGreyArea({ previewOnly: true })).ok).toBe(false);
    expect(document.querySelector('[data-moodle-grey-area-preview]')).toBeNull();
  });

  test('includes deadline and description, excludes everything outside the grey area', async () => {
    const result = await captureGreyArea();
    expect(result.ok).toBe(true);
    const doc = parsed(result);
    expect(doc.body.textContent).toContain('Rok za oddajo:');
    expect(doc.body.textContent).toContain('Assignment text');
    expect(doc.body.textContent).not.toMatch(/Private|Submit assignment|Completion requirements|01: Hevristična/);
    expect(doc.querySelector('strong').textContent).toBe('Rok za oddajo:');
    expect(result.filename).toBe('Assignment - 01- Hevristična evalvacija.html');
  });

  test('does not mutate the source document', async () => {
    const original = document.documentElement.outerHTML;
    await captureGreyArea();
    expect(document.documentElement.outerHTML).toBe(original);
  });

  test('fails closed if the grey container is missing', async () => {
    document.querySelector('.activity-header').className = 'different-layout';
    const result = await captureGreyArea();
    expect(result.ok).toBe(false);
    expect(result.html).toBeUndefined();
  });

  test('rejects non-assignment pages', async () => {
    window.location.href = 'https://school.example/course/view.php?id=123';
    expect((await captureGreyArea()).ok).toBe(false);
  });

  test('resolves links without following them and preserves fragments and Unicode', async () => {
    fixture('<p>čšž</p><a href="/file.pdf?x=1&amp;y=2">PDF</a><a href="#section">Jump</a><h5 id="section">Section</h5><a href="mailto:teacher@example.com">Mail</a>');
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error('Unexpected request'); };
    const doc = parsed(await captureGreyArea());
    const links = [...doc.querySelectorAll('a')];
    expect(links[0].getAttribute('href')).toBe('https://school.example/file.pdf?x=1&y=2');
    expect(links[1].getAttribute('href')).toBe('#section');
    expect(links[2].getAttribute('href')).toBe('mailto:teacher@example.com');
    expect(doc.body.textContent).toContain('čšž');
    expect(requests).toBe(0);
  });

  test('removes executable content, forms, event attributes, and unsafe URLs', async () => {
    fixture('<script>bad()</script><iframe src="https://other.example"></iframe><form><input value="secret"></form><p onclick="bad()">Keep me</p><a href="javascript:bad()" ping="https://other.example">Unsafe link</a>');
    const result = await captureGreyArea();
    const doc = parsed(result);
    expect(doc.querySelector('script, iframe, form, input, [onclick], [ping]')).toBeNull();
    expect(doc.querySelector('a').hasAttribute('href')).toBe(false);
    expect(doc.body.textContent).toContain('Keep me');
    expect(doc.querySelector('[http-equiv="Content-Security-Policy"]').content).toContain("default-src 'none'");
  });

  test('omits hidden content', async () => {
    fixture('<p hidden>Hidden one</p><div style="display:none">Hidden two</div><p class="accesshide">Hidden three</p><p>Visible</p>');
    const doc = parsed(await captureGreyArea());
    expect(doc.body.textContent).not.toContain('Hidden');
    expect(doc.body.textContent).toContain('Visible');
  });

  test('embeds pictures as data URLs, deduplicates fetches, and removes srcset', async () => {
    fixture('<picture><source srcset="/other.png"><img src="/image.png" srcset="/other.png 2x" alt="Diagram"></picture><img src="/image.png" alt="Same diagram">');
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return new window.Response(png, { headers: { 'content-type': 'image/png' } });
    };
    const result = await captureGreyArea();
    expect(result.warnings).toEqual([]);
    expect(result.imagesSaved).toBe(2);
    const images = [...parsed(result).querySelectorAll('img')];
    expect(images.every(img => img.getAttribute('src').startsWith('data:image/png;base64,'))).toBe(true);
    expect(images.every(img => !img.hasAttribute('srcset'))).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe('https://school.example/image.png');
    expect(calls[0].options.method).toBe('GET');
    expect(calls[0].options.credentials).toBe('same-origin');
  });

  test('uses the selected picture source', async () => {
    fixture('<img src="/small.png" alt="Responsive">');
    Object.defineProperty(document.querySelector('img'), 'currentSrc', { value: 'https://school.example/large.png' });
    let requested;
    globalThis.fetch = async url => {
      requested = url;
      return new window.Response(png, { headers: { 'content-type': 'image/png' } });
    };
    expect((await captureGreyArea()).imagesSaved).toBe(1);
    expect(requested).toBe('https://school.example/large.png');
  });

  test('reports blocked images and leaves an explicit online link, no automatic remote image', async () => {
    fixture('<img src="https://other.example/blocked.png" alt="Figure 1">');
    const result = await captureGreyArea();
    const doc = parsed(result);
    expect(result.imagesSaved).toBe(0);
    expect(result.warnings.length).toBe(1);
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.querySelector('a').getAttribute('href')).toBe('https://other.example/blocked.png');
    expect(doc.body.textContent).toContain('Figure 1 — not saved');
  });

  test('does not embed a login HTML response as an image', async () => {
    fixture('<img src="/private.png">');
    globalThis.fetch = async () => new window.Response('<h1>Login</h1>', { headers: { 'content-type': 'text/html' } });
    const result = await captureGreyArea();
    expect(result.imagesSaved).toBe(0);
    expect(result.warnings.length).toBe(1);
    expect(result.html).not.toContain('data:text/html');
  });

  test('does not invent an original-image link when the source is missing', async () => {
    fixture('<img alt="Missing source">');
    const result = await captureGreyArea();
    expect(result.warnings.length).toBe(1);
    expect(parsed(result).querySelector('a')).toBeNull();
  });

  test('rejects oversized images before reading their body when length is known', async () => {
    fixture('<img src="/huge.png">');
    let readBody = false;
    globalThis.fetch = async () => ({
      ok: true, headers: new Headers({ 'content-length': String(11 * 1024 * 1024) }),
      blob: async () => { readBody = true; throw new Error('Should not read'); },
    });
    const result = await captureGreyArea();
    expect(result.imagesSaved).toBe(0);
    expect(result.warnings.length).toBe(1);
    expect(readBody).toBe(false);
  });

  test('runs as a serialized function without module scope, like Chrome injection', async () => {
    const injected = new Function(`return (${captureGreyArea.toString()})();`);
    expect((await injected()).ok).toBe(true);
  });

  test('warns about unsupported inline diagrams and CSS background images', async () => {
    fixture('<svg><circle r="4"></circle></svg><div style="background-image:url(https://other.example/bg.png)">Text</div>');
    const result = await captureGreyArea();
    expect(result.warnings.length).toBe(2);
    expect(parsed(result).querySelector('svg')).toBeNull();
    expect(result.html).not.toContain('https://other.example/bg.png');
  });
});
