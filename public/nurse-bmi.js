const shell = document.querySelector('.hm-shell');
const menuToggle = document.querySelector('.hm-menu-toggle');
const sidenav = document.getElementById('hmSidebar');
const sidenavClose = document.querySelector('.hm-sidenav-close');
const backdrop = document.getElementById('hmBackdrop');
const navLinks = document.querySelectorAll('.hm-nav-link');

const bmiGroupSelect = document.getElementById('bmiGroupSelect');
const bmiYearSelect = document.getElementById('bmiYearSelect');
const loadBmiBtn = document.getElementById('loadBmiBtn');
const saveBmiBtn = document.getElementById('saveBmiBtn');
const bmiTableBody = document.getElementById('bmiTableBody');
const bmiStatus = document.getElementById('bmiStatus');

let bmiRows = [];
let bmiGroups = [];
let autosaveTimer = null;
let isSaving = false;

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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

const setStatus = (text) => {
  if (bmiStatus) {
    bmiStatus.textContent = text || '';
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

const getHeightCmFromInputs = (heightFeet, heightInch) => {
  const inchValue = Number(heightInch);
  if (Number.isFinite(inchValue) && inchValue > 0) {
    return inchValue;
  }

  const feetValue = Number(heightFeet);
  if (Number.isFinite(feetValue) && feetValue > 0) {
    return feetValue;
  }

  return null;
};

const calculateBmi = (heightFeet, heightInch, weight) => {
  const heightValueCm = getHeightCmFromInputs(heightFeet, heightInch);
  const weightValue = Number(weight);
  if (heightValueCm === null || !Number.isFinite(weightValue) || heightValueCm <= 0 || weightValue <= 0) {
    return '';
  }
  const heightMeters = heightValueCm / 100;
  if (heightMeters <= 0) {
    return '';
  }
  return (weightValue / (heightMeters * heightMeters)).toFixed(2);
};

const renderTable = () => {
  if (!Array.isArray(bmiRows) || bmiRows.length === 0) {
    bmiTableBody.innerHTML = '<tr><td colspan="9" class="hm-empty">No students found for this selection.</td></tr>';
    return;
  }

  bmiTableBody.innerHTML = bmiRows.map((row, index) => `
    <tr data-index="${index}">
      <td>${escapeHtml(row.roll)}</td>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(formatDate(row.dob))}</td>
      <td>${escapeHtml(row.age || '-')}</td>
      <td><input class="hm-bmi-input" type="number" step="0.1" min="0" data-field="heightFeet" data-index="${index}" value="${escapeHtml(row.heightFeet || '')}"></td>
      <td><input class="hm-bmi-input" type="number" step="0.1" min="0" data-field="heightInch" data-index="${index}" value="${escapeHtml(row.heightInch || '')}"></td>
      <td><input class="hm-bmi-input" type="number" step="0.1" min="0" data-field="weight" data-index="${index}" value="${escapeHtml(row.weight || '')}"></td>
      <td><input class="hm-bmi-input" type="text" data-field="muaq" data-index="${index}" value="${escapeHtml(row.muaq || '')}"></td>
      <td><input class="hm-bmi-input hm-bmi-output" type="text" data-field="bmi" data-index="${index}" value="${escapeHtml(row.bmi || '')}" readonly></td>
    </tr>
  `).join('');
};

const buildGroupOptions = (groups) => {
  const options = ['<option value="">Select class and section</option>'];
  groups.forEach((group) => {
    options.push(`<optgroup label="${escapeHtml(group.className)}">`);
    group.sections.forEach((section) => {
      options.push(`<option value="${escapeHtml(group.className)}::${escapeHtml(section)}">${escapeHtml(section)}</option>`);
    });
    options.push('</optgroup>');
  });
  bmiGroupSelect.innerHTML = options.join('');
};

const buildYearOptions = (years) => {
  const options = ['<option value="">Select academic year</option>'];
  years.forEach((year) => {
    options.push(`<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`);
  });
  bmiYearSelect.innerHTML = options.join('');
};

const loadFilterOptions = async () => {
  try {
    const response = await fetch('/healthrecord/bmi/filter-options');
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Unable to load options');
    }

    bmiGroups = Array.isArray(data.groups) ? data.groups : [];
    buildGroupOptions(bmiGroups);
    buildYearOptions(Array.isArray(data.academicYears) ? data.academicYears : []);

    const defaultYear = String(data.currentAcademicYear || '').trim();
    if (defaultYear && bmiYearSelect) {
      bmiYearSelect.value = defaultYear;
    }

    setStatus('Select a class and section to load students.');
  } catch (error) {
    setStatus(error.message || 'Unable to load class and section groups.');
  }
};

const loadStudents = async () => {
  const selectedGroupValue = bmiGroupSelect.value;
  const selectedYear = bmiYearSelect.value;

  if (!selectedGroupValue) {
    setStatus('Please select both class and section.');
    return;
  }

  const [selectedClass, section] = selectedGroupValue.split('::');

  bmiTableBody.innerHTML = '<tr><td colspan="9" class="hm-empty">Loading students...</td></tr>';
  setStatus('Loading students...');

  try {
    const params = new URLSearchParams({
      studentClass: selectedClass,
      section,
      academicYear: selectedYear
    });
    const response = await fetch(`/healthrecord/bmi/students?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Unable to load students');
    }

    bmiRows = Array.isArray(data.rows) ? data.rows : [];
    renderTable();
    setStatus(`Loaded ${bmiRows.length} students.`);
  } catch (error) {
    bmiRows = [];
    renderTable();
    setStatus(error.message || 'Unable to load students.');
  }
};

const updateRow = (index, field, value) => {
  const row = bmiRows[index];
  if (!row) {
    return;
  }

  row[field] = value;
  if (field === 'heightFeet' || field === 'heightInch' || field === 'weight') {
    row.bmi = calculateBmi(row.heightFeet, row.heightInch, row.weight);
    const bmiInput = document.querySelector(`.hm-bmi-output[data-index="${index}"]`);
    if (bmiInput) {
      bmiInput.value = row.bmi || '';
    }
  }

  scheduleAutosave();
};

const saveBmiData = async (message = 'Saving BMI data...', successMessage = 'BMI data saved successfully.') => {
  if (!bmiRows.length || isSaving) {
    return;
  }

  isSaving = true;
  setStatus(message);

  try {
    const response = await fetch('/healthrecord/bmi/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: bmiRows })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Unable to save BMI data');
    }

    setStatus(successMessage);
  } catch (error) {
    setStatus(error.message || 'Unable to save BMI data.');
  } finally {
    isSaving = false;
  }
};

const scheduleAutosave = () => {
  if (!bmiRows.length) {
    return;
  }

  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
  }

  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    saveBmiData('Autosaving BMI changes...', 'BMI changes saved.');
  }, 1200);
};

bmiTableBody?.addEventListener('input', (event) => {
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

saveBmiBtn?.addEventListener('click', async () => {
  if (!bmiRows.length) {
    setStatus('Load students first.');
    return;
  }

  await saveBmiData('Saving BMI data...', 'BMI data saved successfully.');
  await loadStudents();
});

loadBmiBtn?.addEventListener('click', loadStudents);

loadFilterOptions();
