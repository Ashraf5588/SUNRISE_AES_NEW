const shell = document.querySelector('.hm-shell');
const menuToggle = document.querySelector('.hm-menu-toggle');
const sidenav = document.getElementById('hmSidebar');
const sidenavClose = document.querySelector('.hm-sidenav-close');
const backdrop = document.getElementById('hmBackdrop');
const navLinks = document.querySelectorAll('.hm-nav-link');

const classSelect = document.getElementById('distributionClassSelect');
const sectionSelect = document.getElementById('distributionSectionSelect');
const genderSelect = document.getElementById('distributionGenderSelect');
const medicineSelect = document.getElementById('distributionMedicineSelect');
const loadBtn = document.getElementById('loadDistributionBtn');
const saveBtn = document.getElementById('saveDistributionBtn');
const statusEl = document.getElementById('distributionStatus');
const tableBody = document.getElementById('distributionTableBody');
const totalStudentsEl = document.getElementById('distributionTotalStudents');
const takenCountEl = document.getElementById('distributionTakenCount');
const takenNamesEl = document.getElementById('distributionTakenNames');
const summaryMetaEl = document.getElementById('distributionSummaryMeta');

let classGroups = [];
let distributionRows = [];
let autosaveTimer = null;
let isSavingDistribution = false;

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

const setStatus = (message) => {
  if (statusEl) {
    statusEl.textContent = message || '';
  }
};

const formatLabel = (value) => (value ? String(value) : '-');

const setSummary = (summary, medicineName) => {
  const takenNames = (summary && Array.isArray(summary.takenStudents))
    ? summary.takenStudents.map((student) => `${student.name || '-'} (${student.roll || '-'})`)
    : [];

  if (totalStudentsEl) {
    totalStudentsEl.textContent = String((summary && summary.totalStudents) || 0);
  }
  if (takenCountEl) {
    takenCountEl.textContent = String((summary && summary.takenCount) || 0);
  }
  if (takenNamesEl) {
    takenNamesEl.textContent = takenNames.length ? takenNames.join(', ') : '-';
  }
  if (summaryMetaEl) {
    summaryMetaEl.textContent = medicineName ? `Current medicine: ${medicineName}` : 'No medicine loaded yet.';
  }
};

const renderClassOptions = (groups) => {
  if (!classSelect) {
    return;
  }

  const options = ['<option value="">Select class</option>'];
  groups.forEach((group) => {
    options.push(`<option value="${escapeHtml(group.className)}">${escapeHtml(group.className)}</option>`);
  });
  classSelect.innerHTML = options.join('');
};

const renderSectionOptions = (className) => {
  if (!sectionSelect) {
    return;
  }

  const selectedGroup = classGroups.find((group) => String(group.className) === String(className));
  const sections = selectedGroup && Array.isArray(selectedGroup.sections) ? selectedGroup.sections : [];
  const options = ['<option value="">Select section</option>'];
  sections.forEach((section) => {
    options.push(`<option value="${escapeHtml(section)}">${escapeHtml(section)}</option>`);
  });
  sectionSelect.innerHTML = options.join('');
};

const renderMedicineOptions = (medicines) => {
  if (!medicineSelect) {
    return;
  }

  const options = ['<option value="">Select medicine</option>'];
  medicines.forEach((medicine) => {
    options.push(`<option value="${escapeHtml(medicine._id || '')}">${escapeHtml(medicine.medicineName || '')}</option>`);
  });
  medicineSelect.innerHTML = options.join('');
};

const renderTable = () => {
  if (!tableBody) {
    return;
  }

  if (!Array.isArray(distributionRows) || distributionRows.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="4" class="hm-empty">No students found for this selection.</td></tr>';
    return;
  }

  tableBody.innerHTML = distributionRows.map((row, index) => `
    <tr>
      <td>${formatLabel(row.roll)}</td>
      <td>${escapeHtml(row.name || '-')}</td>
      <td>${escapeHtml(row.gender || '-')}</td>
      <td>
        <input type="checkbox" class="distribution-checkbox" data-index="${index}" ${row.taken ? 'checked' : ''}>
      </td>
    </tr>
  `).join('');
};

const scheduleAutosave = () => {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
  }

  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    saveDistribution({ autosave: true });
  }, 900);
};

const loadOptions = async () => {
  try {
    const response = await fetch('/healthrecord/medicine/distributed/options');
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      let message = `Unable to load options (${response.status})`;
      if (contentType.includes('application/json')) {
        const errorBody = await response.json();
        message = errorBody.message || message;
      }
      throw new Error(message);
    }

    const data = await response.json();
    classGroups = Array.isArray(data.groups) ? data.groups : [];
    renderClassOptions(classGroups);
    renderMedicineOptions(Array.isArray(data.medicines) ? data.medicines : []);
    renderSectionOptions('');
    setStatus('Select class, section, gender, and medicine, then load students.');
  } catch (error) {
    setStatus(error && error.message ? error.message : 'Unable to load options.');
  }
};

const getSelectedFilters = () => ({
  studentClass: classSelect ? classSelect.value.trim() : '',
  section: sectionSelect ? sectionSelect.value.trim() : '',
  gender: genderSelect ? genderSelect.value.trim() : 'all',
  medicineId: medicineSelect ? medicineSelect.value.trim() : '',
  medicineName: medicineSelect && medicineSelect.selectedOptions.length ? medicineSelect.selectedOptions[0].textContent.trim() : ''
});

const loadStudents = async () => {
  const filters = getSelectedFilters();

  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  if (!filters.studentClass || !filters.section || !filters.medicineId) {
    setStatus('Select class, section, and medicine first.');
    return;
  }

  tableBody.innerHTML = '<tr><td colspan="4" class="hm-empty">Loading students...</td></tr>';
  setStatus('Loading students...');

  try {
    const params = new URLSearchParams(filters);
    const response = await fetch(`/healthrecord/medicine/distributed/students?${params.toString()}`);
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      let message = `Unable to load students (${response.status})`;
      if (contentType.includes('application/json')) {
        const errorBody = await response.json();
        message = errorBody.message || message;
      }
      throw new Error(message);
    }

    const data = await response.json();
    distributionRows = Array.isArray(data.rows) ? data.rows : [];
    renderTable();
    setSummary(data.summary, filters.medicineName);
    setStatus(`Loaded ${distributionRows.length} students.`);
  } catch (error) {
    distributionRows = [];
    renderTable();
    setSummary({ totalStudents: 0, takenCount: 0, takenStudents: [] }, filters.medicineName);
    setStatus(error && error.message ? error.message : 'Unable to load students.');
  }
};

const saveDistribution = async (options = {}) => {
  const filters = getSelectedFilters();
  const autosave = Boolean(options.autosave);

  if (!filters.studentClass || !filters.section || !filters.medicineId) {
    setStatus('Select class, section, and medicine first.');
    return;
  }

  if (!Array.isArray(distributionRows) || distributionRows.length === 0) {
    setStatus('Load students before saving.');
    return;
  }

  if (isSavingDistribution) {
    return;
  }

  isSavingDistribution = true;

  setStatus(autosave ? 'Autosaving distribution...' : 'Saving distribution...');

  try {
    const payload = {
      medicineId: filters.medicineId,
      medicineName: filters.medicineName,
      entries: distributionRows.map((row) => ({
        id: row.id,
        taken: Boolean(row.taken)
      }))
    };

    const response = await fetch('/healthrecord/medicine/distributed/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      let message = 'Unable to save distribution.';
      if (contentType.includes('application/json')) {
        const errorBody = await response.json();
        message = errorBody.message || message;
      }
      throw new Error(message);
    }

    const data = await response.json();
    setSummary(data.summary, filters.medicineName);
    setStatus(autosave ? 'Distribution autosaved.' : 'Medicine distribution saved successfully.');
  } catch (error) {
    setStatus(error && error.message ? error.message : 'Unable to save distribution.');
  } finally {
    isSavingDistribution = false;
  }
};

if (classSelect) {
  classSelect.addEventListener('change', () => {
    renderSectionOptions(classSelect.value);
    if (sectionSelect) {
      sectionSelect.value = '';
    }
  });
}

if (loadBtn) {
  loadBtn.addEventListener('click', loadStudents);
}

if (saveBtn) {
  saveBtn.addEventListener('click', saveDistribution);
}

if (tableBody) {
  tableBody.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.distribution-checkbox');
    if (!checkbox) {
      return;
    }

    const index = Number(checkbox.dataset.index);
    if (!Number.isInteger(index) || !distributionRows[index]) {
      return;
    }

    distributionRows[index].taken = checkbox.checked;
    scheduleAutosave();
  });
}

loadOptions();