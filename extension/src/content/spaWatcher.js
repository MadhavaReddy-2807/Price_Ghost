/**
 * Watches Single Page Application (SPA) client-side route changes
 * on Flipkart and Myntra using history API interception and MutationObserver.
 */
export function initSpaNavigationWatcher(onNavigate) {
  let lastUrl = window.location.href;
  let timer = null;

  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        onNavigate();
      }
    }, 600);
  };

  // Intercept history.pushState
  const origPushState = history.pushState;
  history.pushState = function (...args) {
    origPushState.apply(this, args);
    trigger();
  };

  // Intercept history.replaceState
  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    trigger();
  };

  // Listen to browser back/forward
  window.addEventListener('popstate', trigger);

  // MutationObserver fallback for internal route changes
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      trigger();
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
}
