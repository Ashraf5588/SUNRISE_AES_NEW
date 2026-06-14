const shell = document.querySelector('.hm-shell');
const menuToggle = document.querySelector('.hm-menu-toggle');
const sidenav = document.getElementById('hmSidebar');
const sidenavClose = document.querySelector('.hm-sidenav-close');
const backdrop = document.getElementById('hmBackdrop');
const navLinks = document.querySelectorAll('.hm-nav-link');

const bpTableBody = document.getElementById('bpTableBody');
const bpStatus = document.getElementById('bpStatus');
const saveBpBtn = document.getElementById('saveBpBtn');

let bpRows = [];
let autosaveTimer = null;
let isSaving = false;

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const setStatus = (text) => {
  if (bpStatus) {
    bpStatus.textContent = text || '';
  }
};

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

navLinks.forEach((link) => {
  link.addEventListener('click', () => {
    if (window.innerWidth <= 900) {
      closeNav();
    }
  });
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeNav();
  }
});

const renderTable = () => {
  if (!Array.isArray(bpRows) || !bpRows.length) {
    bpTableBody.innerHTML = '<tr><td colspan="3" class="hm-empty">No staff loaded yet.</td></tr>';
    return;
  }

  bpTableBody.innerHTML = bpRows.map((row, index) => `
    <tr data-index="${index}">
      <td>${index + 1}</td>
      <td>${escapeHtml(row.staffName)}</td>
      <td>
        <input class="hm-bmi-input" type="text" data-field="bloodPressure" data-index="${index}" value="${escapeHtml(row.bloodPressure || '')}" placeholder="120/80">
      </td>
    </tr>
  `).join('');
};

const loadStaff = async () => {
  bpTableBody.innerHTML = '<tr><td colspan="3" class="hm-empty">Loading staff list...</td></tr>';
  setStatus('Loading staff list...');

  try {
    const response = await fetch('/healthrecord/bp/staff');
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Unable to load staff list');
    }

    bpRows = Array.isArray(data.rows) ? data.rows : [];
    renderTable();
    setStatus(`Loaded ${bpRows.length} staff.`);
  } catch (error) {
    bpRows = [];
    renderTable();
    setStatus(error.message || 'Unable to load staff list.');
  }
};

const updateRow = (index, field, value) => {
  const row = bpRows[index];
  if (!row) {
    return;
  }

  row[field] = value;
  scheduleAutosave();
};

const saveBpData = async (message = 'Saving blood pressure...', successMessage = 'Blood pressure saved.') => {
  if (!bpRows.length || isSaving) {
    return;
  }

  isSaving = true;
  setStatus(message);

  try {
    const response = await fetch('/healthrecord/bp/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: bpRows })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Unable to save blood pressure');
    }

    setStatus(successMessage);
  } catch (error) {
    setStatus(error.message || 'Unable to save blood pressure.');
  } finally {
    isSaving = false;
  }
};

const scheduleAutosave = () => {
  if (!bpRows.length) {
    return;
  }

  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
  }

  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    saveBpData('Autosaving blood pressure...', 'Blood pressure saved.');
  }, 1200);
};

bpTableBody?.addEventListener('input', (event) => {
  const target = event.target;
  if (!target || !target.dataset || !target.dataset.field) {
    return;
  }

  const index = Number(target.dataset.index);
  if (!Number.isInteger(index)) {
    return;
  }

  updateRow(index, target.dataset.field, target.value);
});

bpTableBody?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') {
    return;
  }

  const target = event.target;
  if (!target || !target.dataset || !target.dataset.field) {
    return;
  }

  event.preventDefault();
  saveBpData('Saving blood pressure...', 'Blood pressure saved.');
});

saveBpBtn?.addEventListener('click', async () => {
  if (!bpRows.length) {
    setStatus('Load staff list first.');
    return;
  }

  await saveBpData('Saving blood pressure...', 'Blood pressure saved.');
  await loadStaff();
});

loadStaff();
