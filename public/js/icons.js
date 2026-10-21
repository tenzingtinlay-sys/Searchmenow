// Tabler Icons (MIT) paths used across the UI.
const ICONS = {
  home: '<path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/>',
  search: '<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/>',
  users: '<path d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/>',
  database: '<path d="M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0"/><path d="M4 6v6a8 3 0 0 0 16 0v-6"/><path d="M4 12v6a8 3 0 0 0 16 0v-6"/>',
  phone: '<path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2"/>',
  code: '<path d="M7 8l-4 4l4 4"/><path d="M17 8l4 4l-4 4"/><path d="M14 4l-4 16"/>',
  wallet: '<path d="M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12"/><path d="M20 12v4h-4a2 2 0 0 1 0 -4h4"/>',
  settings: '<path d="M4 10a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M6 4v4"/><path d="M6 12v8"/><path d="M10 16a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M12 4v10"/><path d="M12 18v2"/><path d="M16 7a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M18 4v1"/><path d="M18 9v11"/>',
  external: '<path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"/><path d="M11 13l9 -9"/><path d="M15 4h5v5"/>',
  shield: '<path d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06"/><path d="M15 19l2 2l4 -4"/>',
  logout: '<path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"/><path d="M9 12h12l-3 -3"/><path d="M18 15l3 -3"/>',
  bell: '<path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/>',
  menu: '<path d="M4 6l16 0"/><path d="M4 12l16 0"/><path d="M4 18l16 0"/>',
  mail: '<path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10"/><path d="M3 7l9 6l9 -6"/>',
  arrow: '<path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/>',
  history: '<path d="M12 8l0 4l2 2"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/>',
  graph: '<path d="M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M19 5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M19 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M6.5 6.5l4 4"/><path d="M17.5 6.5l-4 4"/><path d="M6.5 17.5l4 -4"/><path d="M17.5 17.5l-4 -4"/>',
  check: '<path d="M5 12l5 5l10 -10"/>',
};
const icon = (n, size = 16) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
const LOGO = `<svg viewBox="0 0 32 32" width="16" height="16" aria-hidden="true" class="logo-mark"><g fill="currentColor"><rect x="3.4" y="3.4" width="4.2" height="4.2" opacity=".2"/><rect x="13.9" y="3.4" width="4.2" height="4.2"/><rect x="24.4" y="3.4" width="4.2" height="4.2" opacity=".2"/><rect x="3.4" y="13.9" width="4.2" height="4.2"/><rect x="24.4" y="13.9" width="4.2" height="4.2" opacity=".2"/><rect x="3.4" y="24.4" width="4.2" height="4.2" opacity=".2"/><rect x="13.9" y="24.4" width="4.2" height="4.2" opacity=".2"/><rect x="24.4" y="24.4" width="4.2" height="4.2"/><rect x="13.4" y="13.4" width="5.2" height="5.2"/></g><g stroke="currentColor" stroke-width="1.1" opacity=".85"><line x1="16" y1="12.3" x2="16" y2="8.7"/><line x1="12.3" y1="16" x2="8.7" y2="16"/><line x1="18.6" y1="18.6" x2="24.2" y2="24.2"/></g></svg>`;
