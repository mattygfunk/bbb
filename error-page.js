(() => {
  const year = document.querySelector('#year');
  if (year) year.textContent = new Date().getFullYear();

  if (window.location.pathname.endsWith('/403.html')) return;
  const input = document.querySelector('#error-query');
  if (!input) return;

  let pathname = window.location.pathname;
  try { pathname = decodeURIComponent(pathname); } catch { /* Keep the raw path when it contains malformed encoding. */ }
  const words = pathname
    .replace(/\.(html?|php)$/i, '')
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[-_]+/g, ' '))
    .join(' ')
    .slice(0, 80);
  if (words && !['404', 'not found'].includes(words.toLowerCase())) input.value = words;
})();
