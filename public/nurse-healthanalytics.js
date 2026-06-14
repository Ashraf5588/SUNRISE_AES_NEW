const shell = document.querySelector('.hm-shell');
const menuToggle = document.querySelector('.hm-menu-toggle');
const sidenav = document.getElementById('hmSidebar');
const sidenavClose = document.querySelector('.hm-sidenav-close');
const backdrop = document.getElementById('hmBackdrop');
const toggleBtn = document.getElementById('toggleBmiGroupingBtn');
const groupingPanel = document.getElementById('bmiGroupingPanel');

const openNav = () => {
  if (!shell || !sidenav || !backdrop || !menuToggle) {
    return;
  }

  shell.classList.add('is-nav-open');
  backdrop.hidden = false;
  backdrop.classList.add('is-visible');
  menuToggle.setAttribute('aria-expanded', 'true');
};

const closeNav = () => {
  if (!shell || !sidenav || !backdrop || !menuToggle) {
    return;
  }

  shell.classList.remove('is-nav-open');
  backdrop.classList.remove('is-visible');
  backdrop.hidden = true;
  menuToggle.setAttribute('aria-expanded', 'false');
};

if (menuToggle && sidenav) {
  menuToggle.addEventListener('click', () => {
    if (shell.classList.contains('is-nav-open')) {
      closeNav();
    } else {
      openNav();
    }
  });
}

if (sidenavClose) {
  sidenavClose.addEventListener('click', closeNav);
}

if (backdrop) {
  backdrop.addEventListener('click', closeNav);
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeNav();
  }
});

if (toggleBtn && groupingPanel) {
  toggleBtn.addEventListener('click', () => {
    const isHidden = groupingPanel.hasAttribute('hidden');
    if (isHidden) {
      groupingPanel.removeAttribute('hidden');
      toggleBtn.textContent = 'Hide BMI Grouping';
      groupingPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      groupingPanel.setAttribute('hidden', '');
      toggleBtn.textContent = 'Open BMI Grouping';
    }
  });
}