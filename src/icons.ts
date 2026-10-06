const svg = (body: string, size = 24, fill = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ${
    fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
  } aria-hidden="true">${body}</svg>`;

export const icons = {
  play: svg('<path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11.2-6.86a1 1 0 0 0 0-1.72L9.5 4.28A1 1 0 0 0 8 5.14Z"/>', 24, true),
  pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>', 24, true),
  back15: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><text x="12" y="15.5" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="system-ui">15</text>'),
  fwd15: svg('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/><text x="12" y="15.5" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="system-ui">15</text>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  chevronUp: svg('<path d="m18 15-6-6-6 6"/>'),
  chevronRight: svg('<path d="m9 18 6-6-6-6"/>'),
  locate: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/>'),
  locateOn: svg('<path d="M3 11 21 3l-8 18-2-8-8-2Z"/>', 24, true),
  text: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  download: svg('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  headphones: svg('<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>'),
  volume: svg('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  music: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  pin: svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
  walk: svg('<circle cx="13" cy="4" r="2"/><path d="m9 20 3-6 3 3v4M7 12l3-4 4 1 3 3M10 8l-1 6"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  arrow: svg('<path d="M12 2 19 21l-7-4-7 4Z"/>', 24, true),
  skip: svg('<path d="m5 4 10 8-10 8V4Z"/><path d="M19 5v14"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  wifiOff: svg('<path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.17-2.75M19 13a10 10 0 0 0-2.3-1.6M2 8.82a15 15 0 0 1 4.17-2.65M22 8.82a15 15 0 0 0-11.29-3.76M12 20h.01"/>'),
  restart: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  sparkle: svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/>'),
};

/** Stylised three-storied pagoda used as tour artwork. */
export const pagodaArt = `<svg viewBox="-150 0 500 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6c58f"/><stop offset=".55" stop-color="#ef8a5b"/><stop offset="1" stop-color="#c8432f"/></linearGradient>
  </defs>
  <rect x="-150" width="500" height="200" fill="url(#sky)"/>
  <circle cx="142" cy="70" r="26" fill="#fff3dc" opacity=".85"/>
  <path d="M-150 140 C-60 150 40 132 100 128 C160 124 260 140 350 128 L350 200 L-150 200Z" fill="#9c2f22" opacity=".55"/>
  <g fill="#3a1410">
    <path d="M98 22h4v14h-4z"/>
    <circle cx="100" cy="20" r="3"/>
    <path d="M62 52 Q100 40 138 52 L126 56 H74Z"/>
    <path d="M82 56h36v18H82z"/>
    <path d="M54 80 Q100 66 146 80 L132 85 H68Z"/>
    <path d="M78 85h44v20H78z"/>
    <path d="M46 111 Q100 95 154 111 L138 116 H62Z"/>
    <path d="M74 116h52v26H74z"/>
    <path d="M-150 160 C0 146 60 142 100 142 C140 142 200 146 350 160 L350 200 L-150 200Z"/>
  </g>
  <g fill="#e2533a"><path d="M90 60h6v12h-6zM104 60h6v12h-6zM88 90h7v13h-7zM105 90h7v13h-7zM86 121h8v19h-8zM106 121h8v19h-8z"/></g>
</svg>`;

/** Mount Fuji with a Shinkansen streaking past, used for train tours. */
export const fujiArt = `<svg viewBox="-150 0 500 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="fsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9cc8ec"/><stop offset=".7" stop-color="#e3f0f8"/><stop offset="1" stop-color="#f6efe2"/></linearGradient>
  </defs>
  <rect x="-150" width="500" height="200" fill="url(#fsky)"/>
  <path d="M-150 150 L-40 120 L20 132 L100 34 L180 132 L250 118 L350 140 L350 200 L-150 200Z" fill="#4f6f99"/>
  <path d="M100 34 L80 58 L90 56 L96 64 L103 55 L110 62 L117 56 L122 60Z" fill="#fff"/>
  <path d="M-150 160 C-40 150 60 156 160 150 C240 146 300 152 350 150 L350 200 L-150 200Z" fill="#7a9a6a"/>
  <g>
    <path d="M-150 150 H210 C250 150 290 158 312 170 H-150Z" fill="#f7f8fa"/>
    <path d="M-150 163 H300 C305 165 309 167 312 170 H-150Z" fill="#1f5fae"/>
    <path d="M235 152 C255 153 275 157 292 163 L262 161 C252 157 244 155 235 154Z" fill="#2c3440"/>
    <g fill="#2c3440" opacity=".85"><rect x="-120" y="153" width="14" height="6" rx="2"/><rect x="-96" y="153" width="14" height="6" rx="2"/><rect x="-72" y="153" width="14" height="6" rx="2"/><rect x="-48" y="153" width="14" height="6" rx="2"/><rect x="-24" y="153" width="14" height="6" rx="2"/><rect x="0" y="153" width="14" height="6" rx="2"/><rect x="24" y="153" width="14" height="6" rx="2"/><rect x="48" y="153" width="14" height="6" rx="2"/><rect x="72" y="153" width="14" height="6" rx="2"/><rect x="96" y="153" width="14" height="6" rx="2"/><rect x="120" y="153" width="14" height="6" rx="2"/><rect x="144" y="153" width="14" height="6" rx="2"/><rect x="168" y="153" width="14" height="6" rx="2"/><rect x="192" y="153" width="14" height="6" rx="2"/></g>
  </g>
  <rect x="-150" y="170" width="500" height="30" fill="#5d7f50"/>
</svg>`;

export const tourArt = (key?: string) => (key === 'fuji' ? fujiArt : pagodaArt);
