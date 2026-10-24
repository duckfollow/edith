// Resolve appearance before styles paint; no inline script is required by CSP.
(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('edith-appearance');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* Use system appearance when storage is unavailable. */ }
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = preference === 'system' ? (dark ? 'dark' : 'light') : preference;
})();
