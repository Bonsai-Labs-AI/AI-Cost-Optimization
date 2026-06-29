// Reusable inline-citation popover.
// Used both on the standalone technique page and inside the homepage modal,
// so the hover/click/pin behavior is identical in both places.
//
// Call initCitationPopovers(root) AFTER the technique markup is in the DOM.
// `root` scopes which footnote refs + which #citation-data are used, so the
// modal can re-init against freshly injected content. Returns a teardown fn.

type Cite = { title: string; pub: string; note: string; url: string; kind: string };

export function initCitationPopovers(root: ParentNode = document): () => void {
  const scope: ParentNode = root ?? document;
  const dataEl =
    (scope as Element).querySelector?.('#citation-data') ??
    document.getElementById('citation-data');
  const refs = Array.from(
    scope.querySelectorAll<HTMLAnchorElement>('.prose a[data-footnote-ref]')
  );
  if (!dataEl || !refs.length) return () => {};

  const data: Record<string, Cite> = JSON.parse(dataEl.textContent || '{}');

  const pop = document.createElement('div');
  pop.className = 'cite-pop';
  pop.setAttribute('role', 'tooltip');
  document.body.appendChild(pop);

  let current: HTMLAnchorElement | null = null;
  let pinned = false;
  let hideTimer: number | undefined;

  const idFromHref = (a: HTMLAnchorElement) => {
    const m = a.getAttribute('href')?.match(/#user-content-fn-(.+)$/);
    // GFM may suffix duplicate refs (-2, -3); the source id has no such suffix.
    return m ? decodeURIComponent(m[1]) : null;
  };

  function render(c: Cite) {
    const esc = (s: string) =>
      s.replace(
        /[&<>"]/g,
        (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string
      );
    let html = '';
    if (c.title) html += `<div class="cite-title">${esc(c.title)}</div>`;
    if (c.pub) html += `<div class="cite-pub">${esc(c.pub)}${c.kind ? ' · ' + esc(c.kind) : ''}</div>`;
    if (c.note) html += `<div class="cite-note">${esc(c.note)}</div>`;
    const links: string[] = [];
    if (c.url) links.push(`<a href="${esc(c.url)}" target="_blank" rel="noopener">View source ↗</a>`);
    if (links.length) html += `<div class="cite-links">${links.join('')}</div>`;
    pop.innerHTML = html;
  }

  function position(ref: HTMLAnchorElement) {
    // The popover is position:fixed, so all math is viewport-relative.
    const r = ref.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    const gap = 8;
    let place: 'top' | 'bottom' = 'top';
    let top = r.top - pr.height - gap;
    if (top < 4) {
      place = 'bottom';
      top = r.bottom + gap;
    }
    let left = r.left + r.width / 2 - pr.width / 2;
    const min = 8;
    const max = document.documentElement.clientWidth - pr.width - 8;
    left = Math.max(min, Math.min(left, max));
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
    pop.dataset.place = place;
    const arrowX = Math.max(10, Math.min(r.left + r.width / 2 - left, pr.width - 18));
    pop.style.setProperty('--arrow-x', `${arrowX}px`);
  }

  function show(ref: HTMLAnchorElement) {
    const id = idFromHref(ref);
    if (!id) return;
    const c = data[id] || data[id.replace(/-\d+$/, '')];
    if (!c) return;
    window.clearTimeout(hideTimer);
    if (current && current !== ref) current.classList.remove('cite-active');
    current = ref;
    ref.classList.add('cite-active');
    render(c);
    pop.classList.add('cite-pop-open');
    position(ref);
  }

  function hide(force = false) {
    if (pinned && !force) return;
    pop.classList.remove('cite-pop-open');
    if (current) current.classList.remove('cite-active');
    current = null;
    pinned = false;
  }

  const perRef: Array<() => void> = [];
  refs.forEach((ref) => {
    const onEnter = () => !pinned && show(ref);
    const onLeave = () => {
      if (pinned) return;
      hideTimer = window.setTimeout(() => hide(), 120);
    };
    const onFocus = () => show(ref);
    const onBlur = () => hide();
    const onClick = (e: MouseEvent) => {
      e.preventDefault(); // replace the jump-to-references behavior
      if (pinned && current === ref) {
        hide(true);
      } else {
        pinned = true;
        show(ref);
      }
    };
    ref.addEventListener('mouseenter', onEnter);
    ref.addEventListener('mouseleave', onLeave);
    ref.addEventListener('focus', onFocus);
    ref.addEventListener('blur', onBlur);
    ref.addEventListener('click', onClick);
    perRef.push(() => {
      ref.removeEventListener('mouseenter', onEnter);
      ref.removeEventListener('mouseleave', onLeave);
      ref.removeEventListener('focus', onFocus);
      ref.removeEventListener('blur', onBlur);
      ref.removeEventListener('click', onClick);
    });
  });

  const onPopEnter = () => window.clearTimeout(hideTimer);
  const onPopLeave = () => {
    if (!pinned) hideTimer = window.setTimeout(() => hide(), 120);
  };
  pop.addEventListener('mouseenter', onPopEnter);
  pop.addEventListener('mouseleave', onPopLeave);

  const onDocClick = (e: MouseEvent) => {
    if (!pinned) return;
    const t = e.target as Node;
    if (!pop.contains(t) && t !== current && !current?.contains(t)) hide(true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') hide(true);
  };
  const onScroll = () => current && position(current);
  const onResize = () => current && position(current);

  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);
  // Capture phase so scrolling inside the modal's own scroll container (not just
  // the window) keeps the popover pinned to its citation.
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', onResize);

  return function destroy() {
    perRef.forEach((fn) => fn());
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
    window.removeEventListener('resize', onResize);
    pop.remove();
  };
}
