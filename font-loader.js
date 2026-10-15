(() => {
  const stylesheet = document.querySelector('[data-async-stylesheet]');
  if (!stylesheet) return;

  const enableStylesheet = () => {
    stylesheet.media = 'all';
  };

  if (stylesheet.sheet) {
    enableStylesheet();
  } else {
    stylesheet.addEventListener('load', enableStylesheet, { once: true });
  }
})();
