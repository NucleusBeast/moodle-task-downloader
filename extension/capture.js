// Self-contained: Chrome serializes this function into the tab's isolated world.
// Read the source DOM; build all output in a separate, detached document.
export async function captureGreyArea({ previewOnly = false, textOnly = false } = {}) {
  try {
    const view = document.defaultView;
    view.__moodleGreyAreaPreviewCleanup?.();
    const intro = document.querySelector('#region-main #intro');
    const root = intro?.closest('.activity-header');
    if (!/^https?:$/.test(location.protocol) || !/\/mod\/assign\/view\.php$/.test(location.pathname) || !root) {
      return { ok: false, error: 'No assignment grey area found. Open a Moodle assignment with a description. Nothing was downloaded.' };
    }

    if (previewOnly) {
      // Keep the marker outside the exported container and leave its styles intact.
      const overlay = document.createElement('div');
      overlay.setAttribute('data-moodle-grey-area-preview', '');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.cssText = 'all:initial;position:fixed;pointer-events:none;box-sizing:border-box;border:3px solid #16865e;background:rgba(22,134,94,.08);border-radius:4px;z-index:2147483647;';
      function update() {
        const rect = root.getBoundingClientRect();
        overlay.style.top = `${rect.top}px`;
        overlay.style.left = `${rect.left}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
      }
      function cleanup() {
        overlay.remove();
        view.removeEventListener('scroll', update, true);
        view.removeEventListener('resize', update);
        observer?.disconnect();
        view.clearTimeout(timer);
        delete view.__moodleGreyAreaPreviewCleanup;
      }
      document.body.append(overlay);
      view.addEventListener('scroll', update, true);
      view.addEventListener('resize', update);
      const observer = view.ResizeObserver ? new view.ResizeObserver(update) : null;
      observer?.observe(root);
      const timer = view.setTimeout(cleanup, 15000);
      view.__moodleGreyAreaPreviewCleanup = cleanup;
      update();
      return { ok: true };
    }

    const title = root.querySelector('[data-activityname]')?.getAttribute('data-activityname')
      || document.querySelector('#region-main h2')?.textContent.trim()
      || document.querySelector('h1')?.textContent.trim() || 'Assignment';
    const output = document.implementation.createHTMLDocument(title);
    output.documentElement.lang = document.documentElement.lang || 'en';
    const charset = output.createElement('meta');
    charset.setAttribute('charset', 'utf-8');
    const policy = output.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
    output.head.prepend(charset, policy);
    const viewport = output.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1';
    const style = output.createElement('style');
    style.textContent = `*{box-sizing:border-box}body{margin:0;padding:24px;font:16px/1.5 Arial,sans-serif;color:#231f20;background:white}main{max-width:1000px;margin:auto;padding:16px;border-radius:4px;background:#f5f5f5;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%;border-collapse:collapse}pre{white-space:pre-wrap}a{color:#154cba}p{margin:0 0 16px}h5{font-size:20px;font-weight:500;margin:0 0 8px}.missing-image{border:1px dashed #999;padding:8px}@media print{body{padding:0}main{max-width:none}img,tr{break-inside:avoid}}`;
    output.head.append(viewport, style);

    const warnings = [];
    let imagesSaved = 0;
    let totalImageBytes = 0;
    const imageCache = new Map();
    const maxImageBytes = 10 * 1024 * 1024;
    const maxTotalBytes = 20 * 1024 * 1024;
    const allowedTags = new Set('div span p br hr h1 h2 h3 h4 h5 h6 a img picture ul ol li dl dt dd strong b em i u s strike del ins sub sup small mark blockquote pre code kbd samp var table caption thead tbody tfoot tr th td figure figcaption section article header footer time abbr q cite details summary'.split(' '));
    const droppedTags = new Set('script style link meta base noscript template form input button select textarea iframe object embed audio video source track'.split(' '));
    const styleProperties = 'color background-color font-family font-size font-weight font-style line-height text-align text-decoration white-space vertical-align margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left border-top border-right border-bottom border-left border-radius border-collapse list-style-type'.split(' ');

    function safeUrl(value, protocols = ['http:', 'https:', 'mailto:', 'tel:']) {
      try {
        const url = new URL(value, document.baseURI);
        return protocols.includes(url.protocol) ? url.href : null;
      } catch { return null; }
    }

    function asDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Image read failed'));
        reader.readAsDataURL(blob);
      });
    }

    async function embedImage(source) {
      // currentSrc preserves the picture/srcset choice the user actually sees.
      const raw = source.currentSrc || source.getAttribute('src') || source.getAttribute('data-src');
      if (!raw) throw new Error('No image URL');
      const url = safeUrl(raw, ['http:', 'https:', 'data:', 'blob:']);
      if (!url) throw new Error('Unsupported image URL');
      if (imageCache.has(url)) return imageCache.get(url);
      let blob;
      try {
        const response = await fetch(url, {
          method: 'GET', credentials: 'same-origin', referrerPolicy: 'no-referrer',
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('Image request failed');
        if (Number(response.headers.get('content-length')) > maxImageBytes) throw new Error('Image too large');
        blob = await response.blob();
        if (!/^image\/(png|jpeg|gif|webp|avif|bmp|svg\+xml|x-icon|vnd\.microsoft\.icon)(;|$)/i.test(blob.type)) {
          throw new Error('Response is not an image');
        }
      } catch {
        // Reuse an already-loaded, readable image if fetching is blocked.
        if (!source.complete || !source.naturalWidth || source.naturalWidth * source.naturalHeight > 16000000) {
          throw new Error('Image is not readable');
        }
        const canvas = output.createElement('canvas');
        canvas.width = source.naturalWidth;
        canvas.height = source.naturalHeight;
        canvas.getContext('2d').drawImage(source, 0, 0);
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Image is not readable');
      }
      if (blob.size > maxImageBytes || totalImageBytes + blob.size > maxTotalBytes) throw new Error('Image size limit exceeded');
      const data = await asDataUrl(blob);
      totalImageBytes += blob.size;
      imageCache.set(url, data);
      return data;
    }

    async function copy(source, parent) {
      if (source.nodeType === 3) {
        parent.append(output.createTextNode(source.textContent));
        return;
      }
      if (source.nodeType !== 1) return;
      const tag = source.localName.toLowerCase();
      if (droppedTags.has(tag) || source.matches('[hidden], .sr-only, .accesshide, .visually-hidden')) return;
      const computed = getComputedStyle(source);
      if (computed.display === 'none' || computed.visibility === 'hidden') return;
      if (tag === 'svg' || tag === 'canvas') {
        warnings.push('An inline diagram could not be embedded.');
        const placeholder = output.createElement('span');
        placeholder.textContent = '[Inline diagram not saved]';
        parent.append(placeholder);
        return;
      }
      const target = output.createElement(allowedTags.has(tag) ? tag : 'div');
      for (const name of ['id', 'title', 'lang', 'dir', 'colspan', 'rowspan', 'scope', 'start', 'reversed', 'value', 'datetime']) {
        if (source.hasAttribute(name)) target.setAttribute(name, source.getAttribute(name));
      }
      if (tag === 'details') target.setAttribute('open', '');
      for (const property of styleProperties) {
        const value = computed.getPropertyValue(property);
        if (value && !/url\s*\(|expression\s*\(|[<>]/i.test(value)) target.style.setProperty(property, value);
      }
      if (computed.backgroundImage && computed.backgroundImage !== 'none') {
        warnings.push('A CSS background image was not embedded.');
      }
      if (tag === 'a') {
        const href = source.getAttribute('href');
        const resolved = href?.startsWith('#') ? href : href ? safeUrl(href) : null;
        if (resolved) target.setAttribute('href', resolved);
        target.setAttribute('rel', 'noopener noreferrer');
      }
      if (tag === 'img') {
        target.alt = source.getAttribute('alt') || '';
        if (textOnly) {
          const reference = output.createElement('span');
          const raw = source.currentSrc || source.getAttribute('src') || source.getAttribute('data-src');
          const href = raw ? safeUrl(raw, ['http:', 'https:']) : null;
          reference.textContent = `[Image: ${target.alt || 'Unlabelled image'}${href ? ` — ${href}` : ''}]`;
          parent.append(reference);
          return;
        }
        const width = source.getBoundingClientRect().width;
        if (width > 0) target.style.width = `${width}px`;
        target.style.maxWidth = '100%';
        target.style.height = 'auto';
        try {
          target.src = await embedImage(source);
          imagesSaved++;
        } catch {
          const label = target.alt || 'Image';
          warnings.push(`${label}: could not embed this image (access restrictions, unsupported format, or size limit).`);
          const placeholder = output.createElement('span');
          placeholder.className = 'missing-image';
          placeholder.textContent = `[${label} — not saved] `;
          const originalUrl = source.currentSrc || source.getAttribute('src') || source.getAttribute('data-src');
          const href = originalUrl ? safeUrl(originalUrl, ['http:', 'https:']) : null;
          if (href && !parent.closest('a')) {
            const link = output.createElement('a');
            link.href = href;
            link.textContent = 'Open original image (online)';
            link.rel = 'noopener noreferrer';
            placeholder.append(link);
          }
          parent.append(placeholder);
          return;
        }
      }
      parent.append(target);
      for (const child of source.childNodes) await copy(child, target);
    }

    const main = output.createElement('main');
    // Copy only this exact container. Never fall back to the full page.
    for (const child of root.childNodes) await copy(child, main);
    output.body.append(main);
    if (textOnly) {
      function toText(node) {
        if (node.nodeType === 3) return node.textContent.replace(/\s+/g, ' ');
        const tag = node.localName;
        if (tag === 'pre') return `\n\n${node.textContent}\n\n`;
        if (tag === 'br') return '\n';
        if (tag === 'hr') return '\n\n---\n\n';
        const content = [...node.childNodes].map(toText).join('');
        if (tag === 'a') {
          const href = node.getAttribute('href');
          return href && content.trim() !== href ? `${content.trim()} (${href})` : content || href || '';
        }
        if (tag === 'li') {
          const parent = node.parentElement;
          const marker = parent?.localName === 'ol'
            ? `${Number(parent.getAttribute('start') || 1) + [...parent.children].indexOf(node)}.` : '-';
          return `\n${marker} ${content.trim()}\n`;
        }
        if (tag === 'tr') return `\n${[...node.children].map(cell => toText(cell).trim()).join(' | ')}\n`;
        if (/^(div|p|h[1-6]|ul|ol|dl|dt|dd|blockquote|table|section|article|header|footer|figure|figcaption|details|summary)$/.test(tag)) {
          return `\n${content.trim()}\n`;
        }
        return content;
      }
      const content = toText(main).replace(/\n{3,}/g, '\n\n').trim();
      return { ok: true, text: `${title}\nSource: ${location.href}\n\n${content}`, warnings: [...new Set(warnings)] };
    }
    const filename = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 120).trim() || 'Assignment';
    return {
      ok: true, html: '<!doctype html>\n' + output.documentElement.outerHTML,
      filename: `Assignment - ${filename}.html`, imagesSaved, warnings: [...new Set(warnings)],
    };
  } catch (error) {
    return { ok: false, error: `Could not save the grey area: ${error.message}` };
  }
}
