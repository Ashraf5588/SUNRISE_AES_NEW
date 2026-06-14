const shell = document.querySelector('.hm-shell');
const menuToggle = document.querySelector('.hm-menu-toggle');
const sidenav = document.getElementById('hmSidebar');
const sidenavClose = document.querySelector('.hm-sidenav-close');
const backdrop = document.getElementById('hmBackdrop');
const navLinks = document.querySelectorAll('.hm-nav-link');

const studentSearch = document.getElementById('studentSearch');
const suggestions = document.getElementById('studentSuggestions');
const summary = document.getElementById('studentSummary');
const form = document.getElementById('padRecordForm');
const statusEl = document.getElementById('formStatus');
const quantityInput = document.getElementById('quantity');
const studentIdField = document.getElementById('studentId');
const recordRange = document.getElementById('recordRange');
const recordDate = document.getElementById('recordDate');
const recordDateBs = document.getElementById('recordDateBs');
const recordFilterBtn = document.getElementById('recordFilterBtn');
const recordsTableBody = document.getElementById('recordsTableBody');
const padDateDisplay = document.getElementById('padDateDisplay');

const fields = {
  reg: document.getElementById('reg'),
  name: document.getElementById('name'),
  studentClass: document.getElementById('studentClass'),
  section: document.getElementById('section'),
  roll: document.getElementById('roll')
};

const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

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

const convertBsToAd = (value) => {
  if (!value || typeof NepaliFunctions === 'undefined') {
    return '';
  }

  try {
    return NepaliFunctions.BS2AD(String(value).trim());
  } catch (error) {
    return '';
  }
};

const formatAdLabel = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kathmandu',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const formatDualDate = (value) => {
  const iso = formatIsoDate(value || new Date());
  if (!iso) {
    return '-';
  }

  const bs = convertAdToBs(iso);

  return bs || '-';
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

const renderSummary = (student) => {
  if (!student) {
    summary.innerHTML = '<p class="hm-muted">No student selected yet.</p>';
    return;
  }

  summary.innerHTML = `
    <div class="hm-summary-grid">
      <div><strong>Name</strong><span>${student.name || '-'}</span></div>
      <div><strong>Reg</strong><span>${student.reg || '-'}</span></div>
      <div><strong>Class</strong><span>${student.studentClass || '-'}</span></div>
      <div><strong>Section</strong><span>${student.section || '-'}</span></div>
      <div><strong>Roll</strong><span>${student.roll || '-'}</span></div>
      <div><strong>Quantity</strong><span>${quantityInput && quantityInput.value ? quantityInput.value : '-'}</span></div>
    </div>
  `;
};

const setStudent = (student) => {
  studentIdField.value = student._id || '';
  fields.reg.value = student.reg || '';
  fields.name.value = student.name || '';
  fields.studentClass.value = student.studentClass || '';
  fields.section.value = student.section || '';
  fields.roll.value = student.roll || '';
  studentSearch.value = student.name || '';
  renderSummary(student);
};

const clearSuggestions = () => {
  suggestions.innerHTML = '';
  suggestions.style.display = 'none';
};

const formatRecordDate = (value) => formatDualDate(value);

const syncRecordDateFromBs = () => {
  if (!recordDate || !recordDateBs) {
    return;
  }

  const englishValue = convertBsToAd(recordDateBs.value);
  if (englishValue) {
    recordDate.value = englishValue;
  }
};

const syncRecordDateFromAd = () => {
  if (!recordDate || !recordDateBs) {
    return;
  }

  const nepaliValue = convertAdToBs(recordDate.value);
  if (nepaliValue) {
    recordDateBs.value = nepaliValue;
  }
};

const initRecordDateSync = () => {
  if (!recordDate || !recordDateBs) {
    return;
  }

  const todayIso = formatIsoDate(new Date());
  const todayBs = todayIso ? convertAdToBs(todayIso) : '';

  if (!recordDate.value && todayIso) {
    recordDate.value = todayIso;
  }
  if (!recordDateBs.value && todayBs) {
    recordDateBs.value = todayBs;
  }

  if (typeof recordDateBs.nepaliDatePicker === 'function') {
    recordDateBs.nepaliDatePicker({
      onSelect: () => {
        syncRecordDateFromBs();
        loadRecords();
      }
    });
  }

  recordDateBs.addEventListener('change', () => {
    syncRecordDateFromBs();
    loadRecords();
  });

  recordDate.addEventListener('change', () => {
    syncRecordDateFromAd();
    loadRecords();
  });

  if (recordDate.value && !recordDateBs.value) {
    syncRecordDateFromAd();
  } else if (recordDateBs.value && !recordDate.value) {
    syncRecordDateFromBs();
  }
};

const renderRecords = (records) => {
  if (!recordsTableBody) {
    return;
  }

  if (!Array.isArray(records) || records.length === 0) {
    recordsTableBody.innerHTML = '<tr><td colspan="6" class="hm-empty">No records found.</td></tr>';
    return;
  }

  recordsTableBody.innerHTML = records.map((record, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${formatRecordDate(record.createdAt)}</td>
      <td>${escapeHtml(record.name || '-')}</td>
      <td>${escapeHtml(record.studentClass || '-')}</td>
      <td>${escapeHtml(record.section || '-')}</td>
      <td>${escapeHtml(record.quantity != null ? String(record.quantity) : '-')}</td>
    </tr>
  `).join('');
};

const loadRecords = async () => {
  if (!recordsTableBody) {
    return;
  }

  recordsTableBody.innerHTML = '<tr><td colspan="6" class="hm-empty">Loading records...</td></tr>';

  const params = new URLSearchParams();
  if (recordRange && recordRange.value) {
    params.set('range', recordRange.value);
  }
  if (recordDate && recordDate.value) {
    params.set('date', recordDate.value);
  }

  try {
    const response = await fetch(`/healthrecord/padrecord/records?${params.toString()}`);
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      let message = `Unable to fetch records (${response.status})`;
      if (contentType.includes('application/json')) {
        const errorBody = await response.json();
        message = errorBody.message || message;
      }
      throw new Error(message);
    }

    if (!contentType.includes('application/json')) {
      throw new Error('Session may be expired. Please login again.');
    }

    const records = await response.json();
    renderRecords(records);
  } catch (error) {
    const safeMessage = (error && error.message) ? error.message : 'Failed to load records.';
    recordsTableBody.innerHTML = `<tr><td colspan="6" class="hm-empty">${safeMessage}</td></tr>`;
  }
};

const showSuggestions = (items) => {
  if (!items.length) {
    suggestions.innerHTML = '<div class="hm-suggestion-item"><span class="hm-suggestion-meta">No matches found</span></div>';
    suggestions.style.display = 'block';
    return;
  }

  suggestions.innerHTML = items.map((student) => {
    const meta = `Class ${student.studentClass || '-'} | Roll ${student.roll || '-'} | Section ${student.section || '-'}`;
    const guardian = `Father: ${student.fatherName || '-'} | Address: ${student.address || '-'}`;
    return `
      <div class="hm-suggestion-item" data-student="${encodeURIComponent(JSON.stringify(student))}">
        <span class="hm-suggestion-name">${student.name || '-'}</span>
        <span class="hm-suggestion-meta">${meta}</span>
        <span class="hm-suggestion-meta">${guardian}</span>
      </div>
    `;
  }).join('');

  suggestions.style.display = 'block';
};

const fetchStudents = async () => {
  const value = studentSearch.value.trim();
  if (value.length < 2) {
    clearSuggestions();
    return;
  }

  try {
    const response = await fetch(`/healthrecord/students?q=${encodeURIComponent(value)}`);
    if (!response.ok) {
      throw new Error('Failed to load suggestions');
    }
    const data = await response.json();
    showSuggestions(Array.isArray(data) ? data : []);
  } catch (error) {
    clearSuggestions();
  }
};

studentSearch.addEventListener('input', debounce(fetchStudents, 200));

if (quantityInput) {
  quantityInput.addEventListener('input', () => {
    renderSummary(studentIdField.value ? {
      name: fields.name.value,
      reg: fields.reg.value,
      studentClass: fields.studentClass.value,
      section: fields.section.value,
      roll: fields.roll.value
    } : null);
  });
}

suggestions.addEventListener('click', (event) => {
  const item = event.target.closest('.hm-suggestion-item');
  if (!item || !item.dataset.student) {
    return;
  }
  const student = JSON.parse(decodeURIComponent(item.dataset.student));
  setStudent(student);
  clearSuggestions();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.hm-field')) {
    clearSuggestions();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!studentIdField.value || !fields.name.value) {
    statusEl.textContent = 'Select a student from the suggestions first.';
    return;
  }

  if (!quantityInput.value || Number(quantityInput.value) <= 0) {
    statusEl.textContent = 'Enter a valid quantity.';
    return;
  }

  statusEl.textContent = 'Saving pad record...';

  const formData = new FormData(form);
  const payload = new URLSearchParams(formData);

  try {
    const response = await fetch('/healthrecord/padrecord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload
    });

    if (!response.ok) {
      throw new Error('Failed');
    }

    statusEl.textContent = 'Pad record saved successfully.';
    form.reset();
    Object.values(fields).forEach((field) => {
      field.value = '';
    });
    studentIdField.value = '';
    studentSearch.value = '';
    clearSuggestions();
    renderSummary(null);
    if (padDateDisplay) {
      padDateDisplay.value = formatDualDate(new Date());
    }
    if (recordRange) {
      recordRange.value = 'today';
    }
    if (recordDate) {
      recordDate.value = '';
    }
    if (recordDateBs) {
      recordDateBs.value = '';
    }
    await loadRecords();
  } catch (error) {
    statusEl.textContent = 'Unable to save pad record. Please try again.';
  }
});

if (recordFilterBtn) {
  recordFilterBtn.addEventListener('click', loadRecords);
}

if (recordRange) {
  recordRange.addEventListener('change', () => {
    loadRecords();
  });
}

if (recordDate && !recordDateBs) {
  recordDate.addEventListener('change', loadRecords);
}

if (padDateDisplay) {
  padDateDisplay.value = formatDualDate(new Date());
}

initRecordDateSync();
renderSummary(null);
loadRecords();
