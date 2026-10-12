/* VANA Management: header navigation and the scroll choreography of the logo roof. */
(() => {
  const $ = id => document.getElementById(id);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const range = (v, a, b) => clamp((v - a) / (b - a));
  const deg = r => r * 180 / Math.PI;

  const year = $('year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Header ---------- */
  const header = $('siteHeader'), nav = $('nav'), brand = $('brand');
  const isHome = () => document.body.classList.contains('home');

  // Mark the nav link of the section in view
  const navLinks = nav ? [...nav.querySelectorAll('a[href^="#"]')] : [];
  const sections = navLinks.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        navLinks.forEach(a => a.getAttribute('href') === '#' + en.target.id
          ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current'));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(s => io.observe(s));
  }

  // Home: the header sits transparent over the hero, fades away when scrolling down
  // and comes back when scrolling up.
  let lastY = scrollY;
  function updateHeader() {
    if (!header) return;
    const y = scrollY;
    header.classList.toggle('scrolled', !isHome() || y > innerHeight * .9);
    if (isHome()) {
      if (y < 40) header.classList.remove('away');
      else if (y > lastY + 4) header.classList.add('away');
      else if (y < lastY - 12) header.classList.remove('away');
    }
    lastY = y;
  }

  /* ---------- Roof choreography (home page only) ---------- */
  const logo = $('logo');
  // No scroll choreography for visitors who asked for reduced motion: the roof stays in the logo
  if (!logo || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    updateHeader();
    addEventListener('scroll', updateHeader, { passive: true });
    return;
  }
  document.documentElement.classList.add('js');

  const word = $('word'), hint = $('hint'), tagline = $('tagline');
  const beamL = $('beamL'), beamR = $('beamR');
  const frameEl = $('frame'), servicesEl = $('services'), stepsEl = $('steps'), roofEl = $('roofAnchor');

  // Roof geometry in logo (viewBox) coordinates: outer end -> apex
  const VB = { x: 220, y: 230, w: 860 };
  const APEX = [645, 255], OUT_L = [330, 378], OUT_R = [958, 378];
  const SLOPE = 123 / 315;

  // A beam: centre, length, thickness, angle (outer end -> apex end), taper of the outer tip
  const seg = (x1, y1, x2, y2, th, tip) => ({
    cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, len: Math.hypot(x2 - x1, y2 - y1),
    ang: deg(Math.atan2(y2 - y1, x2 - x1)), th, tip
  });
  const vert = (x, cy, len, th) => ({ cx: x, cy, len, th, ang: -90, tip: 0 });

  // ---- The shapes the two beams move through ----
  function roofLogo() {
    const r = logo.getBoundingClientRect(), s = r.width / VB.w;
    const P = ([x, y]) => [r.left + (x - VB.x) * s, r.top + (y - VB.y) * s];
    const [ax, ay] = P(APEX), [lx, ly] = P(OUT_L), [rx, ry] = P(OUT_R);
    const th = Math.max(2, 6 * s);
    return [seg(lx, ly, ax, ay, th, 42), seg(rx, ry, ax, ay, th, 42)];
  }
  function edges(W, H) {
    const m = W < 640 ? 14 : 34, th = W < 640 ? 3 : 5;
    const top = (header ? header.offsetHeight : 0) + 16, bottom = H - 24;
    return [vert(m, (top + bottom) / 2, bottom - top, th), vert(W - m, (top + bottom) / 2, bottom - top, th)];
  }
  function frame() {
    const r = frameEl.getBoundingClientRect(), cy = r.top + r.height / 2, len = r.height + 48;
    return [vert(r.left, cy, len, 3), vert(r.right, cy, len, 3)];
  }
  function tracks() { // floor and ceiling track, like UW profiles in drywall construction
    const r = servicesEl.getBoundingClientRect(), cx = r.left + r.width / 2;
    return [
      { cx, cy: r.top, len: r.width, th: 4, ang: 0, tip: 0 },
      { cx, cy: r.bottom, len: r.width, th: 4, ang: 0, tip: 0 } // same direction as the top track, so both turn in parallel
    ];
  }
  function rails() {
    const r = stepsEl.getBoundingClientRect(), cy = r.top + r.height / 2;
    return [vert(r.left + 4, cy, r.height, 3), vert(r.left + 16, cy, r.height, 3)];
  }
  function roofEnd() {
    const r = roofEl.getBoundingClientRect(), cx = r.left + r.width / 2;
    const w = Math.min(r.width / 2, 260), ay = r.top + 24, oy = ay + w * SLOPE;
    return [seg(cx - w, oy, cx, ay, 5, 42), seg(cx + w, oy, cx, ay, 5, 42)];
  }

  // Scroll position at which an element's centre sits mid-screen, and the range it holds there
  const centreAt = (el, H) => { const r = el.getBoundingClientRect(); return r.top + scrollY + r.height / 2 - H / 2; };
  const holdAround = (el, H) => {
    const c = centreAt(el, H), h = el.getBoundingClientRect().height;
    const x = Math.max(H * .14, (h - H) / 2 + H * .1);
    return [c - x, c + x];
  };

  // Beams pull in while they travel and extend again on arrival, so they never cross
  function mix(a, b, t, tl, raw) {
    return {
      cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), ang: lerp(a.ang, b.ang, ease(range(raw, .3, 1))),
      len: lerp(a.len, b.len, tl) * (1 - .6 * Math.sin(Math.PI * raw)), th: lerp(a.th, b.th, tl), tip: lerp(a.tip, b.tip, tl)
    };
  }

  function draw(el, b) {
    el.style.width = b.len + 'px';
    el.style.height = b.th + 'px';
    el.style.transform = `translate(${b.cx - b.len / 2}px, ${b.cy - b.th / 2}px) rotate(${b.ang}deg)`;
    el.style.clipPath = `polygon(0 ${b.tip}%, 100% 0, 100% 100%, 0 ${100 - b.tip}%)`;
  }

  function update() {
    const W = innerWidth, H = innerHeight, s = scrollY;
    updateHeader();

    // Wordmark fades out at the start; the small header logo takes its place
    const f = ease(range(s / (H * 1.5), 0, .35));
    word.style.opacity = 1 - f;
    word.style.filter = `blur(${f * 6}px)`;
    word.style.transform = `scale(${1 + f * .06})`;
    word.style.transformOrigin = 'center';
    word.style.transformBox = 'fill-box';
    hint.style.visibility = s > H * .03 ? 'hidden' : 'visible';
    if (tagline) tagline.style.opacity = 1 - f;
    if (brand) brand.classList.toggle('visible', f > .9);

    const maxScroll = document.documentElement.scrollHeight - H;
    const fr = holdAround(frameEl, H), sv = holdAround(servicesEl, H), st = holdAround(stepsEl, H);
    const timeline = [
      { get: roofLogo,          hold: [0, H * .18] },
      { get: () => edges(W, H), hold: [H * 1.15, fr[0] - H * .7] },
      { get: frame,             hold: fr },
      { get: tracks,            hold: sv },
      { get: rails,             hold: st },
      { get: roofEnd,           hold: [Math.min(centreAt(roofEl, H) + H * .15, maxScroll - H * .05), Infinity] }
    ];

    let pair;
    for (let i = 0; i < timeline.length; i++) {
      const cur = timeline[i], next = timeline[i + 1];
      if (!next || s <= cur.hold[1]) { pair = cur.get(); break; }
      const end = cur.hold[1], start = Math.max(end + 1, next.hold[0]);
      if (s < start) {
        const raw = (s - end) / (start - end);
        const t = ease(range(raw, 0, .8)), tl = ease(range(raw, .2, 1));
        const a = cur.get(), b = next.get();
        pair = [mix(a[0], b[0], t, tl, raw), mix(a[1], b[1], t, tl, raw)];
        break;
      }
    }
    draw(beamL, pair[0]);
    draw(beamR, pair[1]);
  }

  let ticking = false;
  const onFrame = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { update(); ticking = false; }); } };
  addEventListener('scroll', onFrame, { passive: true });
  addEventListener('resize', onFrame);
  if (document.fonts) document.fonts.ready.then(onFrame);
  update();
})();
