(function () {
  const MEASUREMENT_ID = 'G-7B7V3DSECJ';
  let started = false;

  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  function initAnalytics() {
    if (started) return;
    started = true;

    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    document.head.appendChild(s);

    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, {
      anonymize_ip: true,
      allow_google_signals: true,
      allow_ad_personalization_signals: false,
      send_page_view: true
    });

    gtag('event', 'bbb_page_view', {
      page_path: window.location.pathname,
      page_title: document.title || '',
      page_location: window.location.href
    });

    setTimeout(() => {
      gtag('event', 'bbb_engaged_15s', {
        page_path: window.location.pathname,
        page_title: document.title || ''
      });
    }, 15000);
  }

  // Initialize on load so GA always receives page events.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAnalytics, { once: true });
  } else {
    initAnalytics();
  }

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
})();
