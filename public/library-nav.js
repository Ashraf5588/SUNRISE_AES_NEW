(() => {
  const initializeLibraryNavigation = () => {
    const toggle = document.querySelector('.library-nav-toggle');
    const overlay = document.querySelector('.library-nav-overlay');
    if (!toggle || !overlay) return;

    const isMobile = window.matchMedia('(max-width: 900px)');
    const updateToggle = () => {
      const expanded = isMobile.matches
        ? document.body.classList.contains('library-nav-open')
        : !document.body.classList.contains('library-nav-collapsed');
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', expanded ? 'Collapse navigation' : 'Expand navigation');
    };

    toggle.addEventListener('click', () => {
      document.body.classList.toggle(isMobile.matches ? 'library-nav-open' : 'library-nav-collapsed');
      updateToggle();
    });

    overlay.addEventListener('click', () => {
      document.body.classList.remove('library-nav-open');
      updateToggle();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        document.body.classList.remove('library-nav-open');
        updateToggle();
      }
    });

    isMobile.addEventListener('change', () => {
      document.body.classList.remove('library-nav-open');
      updateToggle();
    });

    updateToggle();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLibraryNavigation);
  } else {
    initializeLibraryNavigation();
  }
})();