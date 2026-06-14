const shell = document.querySelector('.hm-shell');
const menuToggle = document.querySelector('.hm-menu-toggle');
const sidenav = document.getElementById('hmSidebar');
const sidenavClose = document.querySelector('.hm-sidenav-close');
const backdrop = document.getElementById('hmBackdrop');
const navLinks = document.querySelectorAll('.hm-nav-link');

const studentSearch = document.getElementById('studentSearch');
const suggestions = document.getElementById('studentSuggestions');
const summary = document.getElementById('studentSummary');
const form = document.getElementById('healthRecordForm');
const statusEl = document.getElementById('formStatus');
const recordRange = document.getElementById('recordRange');
const recordDate = document.getElementById('recordDate');
const recordDateBs = document.getElementById('recordDateBs');
const recordFilterBtn = document.getElementById('recordFilterBtn');
const recordsTableBody = document.getElementById('recordsTableBody');
const DEFAULT_RANGE = 'today';
const referSaveTimers = new Map();
const REFER_SAVE_DELAY = 600;

console.log('[HealthRecord] client script loaded');

const fields = {
  reg: document.getElementById('reg'),
  name: document.getElementById('name'),
  studentClass: document.getElementById('studentClass'),
  section: document.getElementById('section'),
  roll: document.getElementById('roll'),
  fatherName: document.getElementById('fatherName'),
  address: document.getElementById('address')
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
      <div><strong>Father</strong><span>${student.fatherName || '-'}</span></div>
      <div><strong>Address</strong><span>${student.address || '-'}</span></div>
    </div>
  `;
};

const setStudent = (student) => {
  fields.reg.value = student.reg || '';
  fields.name.value = student.name || '';
  fields.studentClass.value = student.studentClass || '';
  fields.section.value = student.section || '';
  fields.roll.value = student.roll || '';
  fields.fatherName.value = student.fatherName || '';
  fields.address.value = student.address || '';
  studentSearch.value = student.name || '';
  renderSummary(student);
};

const clearSuggestions = () => {
  suggestions.innerHTML = '';
  suggestions.style.display = 'none';
};

const formatRecordDate = (value, nepaliDate) => {
  if (nepaliDate) {
    return nepaliDate;
  }

  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const iso = formatIsoDate(date);
  const bsLabel = iso ? convertAdToBs(iso) : '';

  return bsLabel || '-';
};

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
    recordsTableBody.innerHTML = '<tr><td colspan="10" class="hm-empty">No records found.</td></tr>';
    return;
  }

  recordsTableBody.innerHTML = records.map((record, index) => {
    const contact = record.contact || '-';
    const callAction = record.dialNumber
      ? `<a class="hm-call-link" href="tel:${record.dialNumber}">Call</a>`
      : '<span class="hm-muted">N/A</span>';

    const isReferred = Boolean(record.referred) || Boolean(String(record.referNote || '').trim());
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${formatRecordDate(record.createdAt, record.nepaliDate)}</td>
        <td>${record.name || '-'}</td>
        <td>${record.studentClass || '-'}-${record.section || '-'}</td>
        <td>${record.diagnosis || '-'}</td>
        <td>${record.treatment || '-'}</td>
        <td>${record.remarks || '-'}</td>
        <td>
          <div class="hm-refer" data-refer-wrap>
            <button type="button" class="hm-refer-toggle" data-refer-toggle data-id="${record._id}" data-referred="${isReferred}">
              ${isReferred ? 'Referred' : 'Not referred'}
            </button>
            <textarea
              class="hm-refer-note${isReferred ? '' : ' is-hidden'}"
              data-refer-note
              data-id="${record._id}"
              placeholder="Referral note">${escapeHtml(record.referNote || '')}</textarea>
            <span class="hm-refer-status" data-refer-status></span>
          </div>
        </td>
        <td>${contact}</td>
        <td>${callAction}</td>
      </tr>
    `;
  }).join('');
};

const saveReferral = async (recordId, referred, referNote, statusEl) => {
  if (!recordId) {
    return;
  }

  if (statusEl) {
    statusEl.textContent = 'Saving...';
  }

  try {
    const response = await fetch('/healthrecord/refer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: recordId,
        referred,
        referNote
      })
    });

    if (!response.ok) {
      throw new Error('Save failed');
    }

    if (statusEl) {
      statusEl.textContent = 'Saved';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 1200);
    }
  } catch (error) {
    if (statusEl) {
      statusEl.textContent = 'Save failed';
    }
  }
};

const scheduleReferralSave = (recordId, referred, referNote, statusEl) => {
  if (referSaveTimers.has(recordId)) {
    clearTimeout(referSaveTimers.get(recordId));
  }

  const timer = setTimeout(() => {
    referSaveTimers.delete(recordId);
    saveReferral(recordId, referred, referNote, statusEl);
  }, REFER_SAVE_DELAY);

  referSaveTimers.set(recordId, timer);
};

const loadRecords = async () => {
  if (!recordsTableBody) {
    return;
  }

  recordsTableBody.innerHTML = '<tr><td colspan="10" class="hm-empty">Loading records...</td></tr>';

  const params = new URLSearchParams();
  if (recordRange && recordRange.value) {
    params.set('range', recordRange.value);
  }
  if (recordDate && recordDate.value) {
    params.set('date', recordDate.value);
  }

  try {
    const response = await fetch(`/healthrecord/records?${params.toString()}`);
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      let message = `Unable to fetch records (${response.status})`;
      if (contentType.includes('application/json')) {
        const errorBody = await response.json();
        message = errorBody.message || message;
      } else {
        const textBody = await response.text();
        if (textBody && textBody.trim()) {
          message = textBody.slice(0, 120);
        }
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
    recordsTableBody.innerHTML = `<tr><td colspan="10" class="hm-empty">${safeMessage}</td></tr>`;
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
      <div class="hm-suggestion-item" data-student='${JSON.stringify(student)}'>
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

suggestions.addEventListener('click', (event) => {
  const item = event.target.closest('.hm-suggestion-item');
  if (!item || !item.dataset.student) {
    return;
  }
  const student = JSON.parse(item.dataset.student);
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
  console.log('[HealthRecord] submit triggered');

  if (!fields.reg.value || !fields.name.value) {
    console.warn('[HealthRecord] submit blocked: student not selected');
    statusEl.textContent = 'Select a student from the suggestions first.';
    return;
  }

  statusEl.textContent = 'Saving health record...';

  const formData = new FormData(form);
  const payload = new URLSearchParams(formData);
  console.log('[HealthRecord] submitting payload', Object.fromEntries(payload.entries()));

  try {
    const response = await fetch('/healthrecord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload
    });

    console.log('[HealthRecord] save response', {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type') || ''
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error('[HealthRecord] save failed response body', responseText);
      throw new Error('Failed');
    }

    console.log('[HealthRecord] save succeeded');
    statusEl.textContent = 'Health record saved successfully.';
    form.reset();
    Object.values(fields).forEach((field) => {
      field.value = '';
    });
    if (recordDate) {
      recordDate.value = '';
    }
    if (recordDateBs) {
      recordDateBs.value = '';
    }
    if (recordRange) {
      recordRange.value = DEFAULT_RANGE;
    }
    renderSummary(null);
    await loadRecords();
  } catch (error) {
    console.error('[HealthRecord] save request failed', error);
    statusEl.textContent = 'Unable to save health record. Please try again.';
  }
});

if (recordFilterBtn) {
  recordFilterBtn.addEventListener('click', loadRecords);
}

if (recordRange) {
  if (!recordRange.value) {
    recordRange.value = DEFAULT_RANGE;
  }
  recordRange.addEventListener('change', () => {
    loadRecords();
  });
}

if (recordDate && !recordDateBs) {
  recordDate.addEventListener('change', loadRecords);
}

if (recordsTableBody) {
  recordsTableBody.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-refer-toggle]');
    if (!toggle) {
      return;
    }

    const wrap = toggle.closest('[data-refer-wrap]');
    const note = wrap ? wrap.querySelector('[data-refer-note]') : null;
    const statusEl = wrap ? wrap.querySelector('[data-refer-status]') : null;
    const recordId = toggle.dataset.id;
    const currentlyReferred = toggle.dataset.referred === 'true';
    const nextReferred = !currentlyReferred;

    toggle.dataset.referred = String(nextReferred);
    toggle.textContent = nextReferred ? 'Referred' : 'Not referred';

    if (note) {
      if (nextReferred) {
        note.classList.remove('is-hidden');
        note.focus();
      } else {
        note.value = '';
        note.classList.add('is-hidden');
      }
    }

    scheduleReferralSave(recordId, nextReferred, note ? note.value.trim() : '', statusEl);
  });

  recordsTableBody.addEventListener('input', (event) => {
    const note = event.target.closest('[data-refer-note]');
    if (!note) {
      return;
    }

    const wrap = note.closest('[data-refer-wrap]');
    const toggle = wrap ? wrap.querySelector('[data-refer-toggle]') : null;
    const statusEl = wrap ? wrap.querySelector('[data-refer-status]') : null;
    const recordId = note.dataset.id;
    const noteValue = note.value.trim();
    const referred = Boolean(noteValue);

    if (toggle) {
      toggle.dataset.referred = String(referred);
      toggle.textContent = referred ? 'Referred' : 'Not referred';
    }

    if (!noteValue) {
      note.classList.add('is-hidden');
    } else {
      note.classList.remove('is-hidden');
    }

    scheduleReferralSave(recordId, referred, noteValue, statusEl);
  });
}

initRecordDateSync();
renderSummary(null);
loadRecords();
