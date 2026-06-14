const shell = document.querySelector('.hm-shell');
const menuToggle = document.querySelector('.hm-menu-toggle');
const sidenav = document.getElementById('hmSidebar');
const sidenavClose = document.querySelector('.hm-sidenav-close');
const backdrop = document.getElementById('hmBackdrop');
const navLinks = document.querySelectorAll('.hm-nav-link');

const form = document.getElementById('medicineForm');
const medicineNameInput = document.getElementById('medicineName');
const medicineIdInput = document.getElementById('medicineId');
const medicineSubmitBtn = document.getElementById('medicineSubmitBtn');
const medicineCancelBtn = document.getElementById('medicineCancelBtn');
const statusEl = document.getElementById('medicineStatus');
const tableBody = document.getElementById('medicineTableBody');

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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

const formatIsoDate = (value) => {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    return '';
  }

  return `${year}-${month}-${day}`;
};

const convertAdToBs = (value) => {
  if (!value || typeof NepaliFunctions === 'undefined') {
    return '';
  }

  try {
    return NepaliFunctions.AD2BS(String(value).trim());
  } catch (error) {
    return '';
  }
};

const formatDate = (value) => {
  const iso = formatIsoDate(value);
  const bs = iso ? convertAdToBs(iso) : '';

  return bs || '-';
};

const setEditMode = (medicine) => {
  if (!medicine || !medicineIdInput || !medicineNameInput || !medicineSubmitBtn || !medicineCancelBtn) {
    return;
  }

  medicineIdInput.value = medicine._id || '';
  medicineNameInput.value = medicine.medicineName || '';
  medicineSubmitBtn.textContent = 'Update Medicine';
  medicineCancelBtn.hidden = false;
  statusEl.textContent = `Editing ${medicine.medicineName || 'medicine'}.`;
  medicineNameInput.focus();
};

const clearEditMode = () => {
  if (medicineIdInput) {
    medicineIdInput.value = '';
  }
  if (medicineSubmitBtn) {
    medicineSubmitBtn.textContent = 'Save Medicine';
  }
  if (medicineCancelBtn) {
    medicineCancelBtn.hidden = true;
  }
};

const renderMedicines = (medicines) => {
  if (!tableBody) {
    return;
  }

  if (!Array.isArray(medicines) || medicines.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="4" class="hm-empty">No medicines saved yet.</td></tr>';
    return;
  }

  tableBody.innerHTML = medicines.map((medicine, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(medicine.medicineName || '-')}</td>
      <td>${formatDate(medicine.createdAt)}</td>
      <td>
        <div class="hm-row-actions">
          <button type="button" class="hm-table-action" data-action="edit" data-id="${escapeHtml(medicine._id || '')}">Edit</button>
          <button type="button" class="hm-table-action hm-table-action-danger" data-action="delete" data-id="${escapeHtml(medicine._id || '')}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
};

const loadMedicines = async () => {
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '<tr><td colspan="4" class="hm-empty">Loading medicines...</td></tr>';

  try {
    const response = await fetch('/healthrecord/medicine/list');
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      let message = `Unable to fetch medicines (${response.status})`;
      if (contentType.includes('application/json')) {
        const errorBody = await response.json();
        message = errorBody.message || message;
      }
      throw new Error(message);
    }

    if (!contentType.includes('application/json')) {
      throw new Error('Session may be expired. Please login again.');
    }

    const medicines = await response.json();
    window.__medicineRows = Array.isArray(medicines) ? medicines : [];
    renderMedicines(medicines);
  } catch (error) {
    const message = error && error.message ? error.message : 'Failed to load medicines.';
    tableBody.innerHTML = `<tr><td colspan="4" class="hm-empty">${escapeHtml(message)}</td></tr>`;
  }
};

const deleteMedicine = async (medicineId) => {
  if (!medicineId) {
    return;
  }

  const confirmed = window.confirm('Delete this medicine name?');
  if (!confirmed) {
    return;
  }

  statusEl.textContent = 'Deleting medicine...';

  try {
    const response = await fetch(`/healthrecord/medicine/delete/${encodeURIComponent(medicineId)}`, {
      method: 'POST'
    });

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      let message = 'Unable to delete medicine.';
      if (contentType.includes('application/json')) {
        const errorBody = await response.json();
        message = errorBody.message || message;
      }
      throw new Error(message);
    }

    if (medicineIdInput && medicineIdInput.value === medicineId) {
      form.reset();
      clearEditMode();
    }

    statusEl.textContent = 'Medicine deleted successfully.';
    await loadMedicines();
  } catch (error) {
    statusEl.textContent = error && error.message ? error.message : 'Unable to delete medicine. Please try again.';
  }
};

tableBody?.addEventListener('click', async (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.action;
  const medicineId = actionButton.dataset.id;
  const selectedMedicine = Array.isArray(window.__medicineRows)
    ? window.__medicineRows.find((item) => String(item._id) === String(medicineId))
    : null;

  if (action === 'edit' && selectedMedicine) {
    setEditMode(selectedMedicine);
  }

  if (action === 'delete') {
    await deleteMedicine(medicineId);
  }
});

if (medicineCancelBtn) {
  medicineCancelBtn.addEventListener('click', () => {
    form.reset();
    clearEditMode();
    statusEl.textContent = 'Edit cancelled.';
  });
}

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const medicineName = medicineNameInput ? medicineNameInput.value.trim() : '';
    const medicineId = medicineIdInput ? medicineIdInput.value.trim() : '';
    if (!medicineName) {
      statusEl.textContent = 'Medicine name is required.';
      return;
    }

    statusEl.textContent = medicineId ? 'Updating medicine...' : 'Saving medicine...';

    try {
      const payload = new URLSearchParams();
      payload.set('medicineName', medicineName);
      const targetUrl = medicineId
        ? `/healthrecord/medicine/update/${encodeURIComponent(medicineId)}`
        : '/healthrecord/medicine';

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload
      });

      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) {
        let message = 'Unable to save medicine.';
        if (contentType.includes('application/json')) {
          const errorBody = await response.json();
          message = errorBody.message || message;
        }
        throw new Error(message);
      }

      statusEl.textContent = medicineId ? 'Medicine updated successfully.' : 'Medicine saved successfully.';
      form.reset();
      clearEditMode();
      await loadMedicines();
    } catch (error) {
      statusEl.textContent = error && error.message ? error.message : 'Unable to save medicine. Please try again.';
    }
  });
}

loadMedicines();