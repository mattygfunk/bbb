window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }

gtag('js', new Date());
gtag('config', 'G-7B7V3DSECJ', {
  anonymize_ip: true,
  allow_google_signals: true,
  allow_ad_personalization_signals: false
});

document.addEventListener('click', (event) => {
  const cta = event.target.closest('[data-cta]');
  if (cta) {
    gtag('event', 'cta_click', {
      event_category: 'engagement',
      event_label: cta.getAttribute('data-cta') || 'unknown',
      sem_slot: cta.getAttribute('data-sem') || 'none',
      link_url: cta.getAttribute('href') || ''
    });
  }

  const link = event.target.closest('a[href]');
  if (!link) return;
  const href = link.getAttribute('href') || '';
  if (!href || href.startsWith('/') || href.startsWith('#')) return;

  try {
    const u = new URL(href, window.location.origin);
    if (u.hostname !== window.location.hostname) {
      gtag('event', 'outbound_click', {
        event_category: 'outbound',
        event_label: href,
        transport_type: 'beacon'
      });
    }
  } catch {}
}, { passive: true });
