(() => {
  const bootstrap = window.__CURRICULUM_BOOTSTRAP__ || {};
  const form = document.getElementById('curriculum-form');
  const forClassSelect = document.getElementById('forClass');
  const subjectSelect = document.getElementById('subject');
  const unitsWrap = document.getElementById('units-wrap');
  const emptyState = document.getElementById('empty-state');
  const saveStatus = document.getElementById('save-status');
  const modeChip = document.getElementById('mode-chip');
  const languageToggle = document.getElementById('language-toggle');
  const addUnitButton = document.getElementById('add-unit-btn');
  const refreshButton = document.getElementById('refresh-btn');
  const editorNotice = document.getElementById('editor-notice');

  const arrayFields = [
    { name: 'content', label: 'Content', placeholder: 'Add content item' },
    { name: 'instructionalMaterial', label: 'Instructional Material', placeholder: 'Add material item' },
    { name: 'objectives', label: 'Objectives', placeholder: 'Add objective item' },
    { name: 'instructionalMethod', label: 'Instructional Method', placeholder: 'Add method item' },
    { name: 'evaluationprocess', label: 'Evaluation Process', placeholder: 'Add evaluation item' }
  ];

  let saveTimer = null;
  let isSaving = false;
  let hasPendingChanges = false;
  let isRendering = false;
  let activeCurriculumId = bootstrap.curriculum && bootstrap.curriculum._id ? bootstrap.curriculum._id : '';
  const AUTOSAVE_DELAY = 1000;

  const toArray = (value) => (Array.isArray(value) ? value : []);

  const escapeHtml = (value) => {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  };

  const setStatus = (text, tone = 'default') => {
    console.log('Setting status:', text, tone);
    saveStatus.textContent = text;
    saveStatus.dataset.tone = tone;
  };

  const setNotice = (text) => {
    if (!text) {
      editorNotice.style.display = 'none';
      editorNotice.textContent = '';
      return;
    }

    editorNotice.style.display = 'block';
    editorNotice.textContent = text;
  };

  const updateModeLabel = () => {
    const nepaliMode = Boolean(window.isNepaliMode);
    modeChip.textContent = nepaliMode ? 'Nepali mode' : 'English mode';
    languageToggle.textContent = nepaliMode ? 'Switch to English' : 'Switch to Nepali';
  };

  const setNepaliMode = (enabled) => {
    window.isNepaliMode = enabled;
    updateModeLabel();
  };

  const createArrayRow = (unitIndex, fieldName, rowIndex = 0, value = '') => {
    return `
      <div class="array-row" data-array-row>
        <textarea class="array-input" data-array-field="${fieldName}" name="units[${unitIndex}][${fieldName}][${rowIndex}]" rows="2" placeholder="Enter ${escapeHtml(fieldName)}">${escapeHtml(value)}</textarea>
        <button type="button" class="btn btn-danger" data-remove-array-row>Remove</button>
      </div>
    `;
  };

  const createArrayBlock = (unitIndex, field) => {
    return `
      <section class="array-block" data-array-block="${field.name}">
        <div class="array-head">
          <h4>${escapeHtml(field.label)}</h4>
          <button type="button" class="btn btn-secondary" data-add-array-row="${field.name}">Add More</button>
        </div>
        <div class="array-rows" data-array-rows="${field.name}"></div>
      </section>
    `;
  };

  const createUnitCard = (unit = {}, index = 0) => {
    const arraysMarkup = arrayFields.map((field) => createArrayBlock(index, field)).join('');

    return `
      <article class="unit-card" data-unit-card data-unit-index="${index}">
        <div class="unit-head">
          <h3>Unit ${index + 1}</h3>
          <button type="button" class="btn btn-danger" data-remove-unit>Remove Unit</button>
        </div>

        <div class="grid-2">
          <div class="field">
            <label>Unit Name</label>
            <input type="text" data-field="unitName" name="units[${index}][unitName]" placeholder="Unit name" value="${escapeHtml(unit.unitName || '')}">
          </div>

          <div class="field">
            <label>Period</label>
            <input type="text" data-field="period" name="units[${index}][period]" placeholder="Period" value="${escapeHtml(unit.period || '')}">
          </div>

          <div class="field full-span">
            <label>Remarks</label>
            <textarea data-field="remarks" name="units[${index}][remarks]" rows="2" placeholder="Optional remarks">${escapeHtml(unit.remarks || '')}</textarea>
          </div>
        </div>

        ${arraysMarkup}
      </article>
    `;
  };

  const addArrayRowToBlock = (block, unitIndex, value = '') => {
    const fieldName = block.dataset.arrayBlock;
    const rows = block.querySelector(`[data-array-rows="${fieldName}"]`);
    const rowIndex = rows.querySelectorAll('[data-array-row]').length;
    rows.insertAdjacentHTML('beforeend', createArrayRow(unitIndex, fieldName, rowIndex, value));
  };

  const reindexArrayRows = (block, unitIndex) => {
    const fieldName = block.dataset.arrayBlock;
    block.querySelectorAll('[data-array-row]').forEach((row, rowIndex) => {
      const input = row.querySelector('[data-array-field]');
      if (input) {
        input.name = `units[${unitIndex}][${fieldName}][${rowIndex}]`;
      }
    });
  };

  const renderUnits = (curriculum = null) => {
    isRendering = true;
    const units = curriculum && Array.isArray(curriculum.units) && curriculum.units.length ? curriculum.units : [{}];

    unitsWrap.innerHTML = units.map((unit, index) => createUnitCard(unit, index)).join('');

    unitsWrap.querySelectorAll('[data-unit-card]').forEach((card, cardIndex) => {
      const unit = units[cardIndex] || {};

      arrayFields.forEach((field) => {
        const rows = card.querySelector(`[data-array-rows="${field.name}"]`);
        rows.innerHTML = '';

        const values = toArray(unit[field.name]);
        if (values.length) {
          values.forEach((value) => addArrayRowToBlock(card.querySelector(`[data-array-block="${field.name}"]`), cardIndex, value));
        } else {
          addArrayRowToBlock(card.querySelector(`[data-array-block="${field.name}"]`), cardIndex, '');
        }
      });
    });

    activeCurriculumId = curriculum && curriculum._id ? curriculum._id : '';
    hasPendingChanges = false;
    isRendering = false;
    emptyState.style.display = 'none';
  };

  const readUnitCard = (card) => {
    console.log('Reading unit card:', card);
    const unitNameEl = card.querySelector('[data-field="unitName"]');
    console.log('unitName element:', unitNameEl);
    const unitName = unitNameEl ? unitNameEl.value.trim() : '';
    if (!unitNameEl) console.log('unitName element not found for card:', card);
    const periodEl = card.querySelector('[data-field="period"]');
    const period = periodEl ? periodEl.value.trim() : '';
    const remarksEl = card.querySelector('[data-field="remarks"]');
    const remarks = remarksEl ? remarksEl.value.trim() : '';
    const readArrayValues = (fieldName) => {
      return [...card.querySelectorAll(`[data-array-field="${fieldName}"]`)]
        .map((input) => input.value.trim())
        .filter(Boolean);
    };

    return {
      unitName,
      period,
      remarks,
      content: readArrayValues('content'),
      instructionalMaterial: readArrayValues('instructionalMaterial'),
      objectives: readArrayValues('objectives'),
      instructionalMethod: readArrayValues('instructionalMethod'),
      evaluationprocess: readArrayValues('evaluationprocess')
    };
  };

  const readFormData = () => {
    const cards = [...unitsWrap.querySelectorAll('[data-unit-card]')];
    console.log('Found unit cards:', cards.length);
    const units = cards.map(readUnitCard);
    console.log('Units read:', units);
    return {
      forClass: forClassSelect.value.trim(),
      subject: subjectSelect.value.trim(),
      units
    };
  };

  const hasScope = () => Boolean(forClassSelect.value.trim() && subjectSelect.value.trim());

  const readResponseBody = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();

    if (!bodyText.trim()) {
      return {};
    }

    if (contentType.includes('application/json')) {
      return JSON.parse(bodyText);
    }

    const trimmedBody = bodyText.trim();
    if (trimmedBody.startsWith('<!DOCTYPE') || trimmedBody.startsWith('<html')) {
      throw new Error('Server returned HTML instead of JSON. Check session, authorization, or route response.');
    }

    try {
      return JSON.parse(bodyText);
    } catch (error) {
      throw new Error('Server returned a non-JSON response.');
    }
  };

  const scheduleSave = (delay = AUTOSAVE_DELAY) => {
    if (isRendering || !hasScope()) {
      return;
    }

    hasPendingChanges = true;
    setStatus('Saving draft...', 'saving');
    console.log('Scheduling save with delay:', delay);
    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(async () => {
      console.log('Save timeout executing');
      saveTimer = null;
      if (!hasPendingChanges || isSaving) {
        console.log('Skipping save: hasPendingChanges=', hasPendingChanges, 'isSaving=', isSaving);
        return;
      }
      try {
        await saveCurriculum();
        hasPendingChanges = false;
      } catch (error) {
        console.error('Autosave error:', error);
        setStatus('Save failed', 'error');
      } finally {
        isSaving = false;
      }
    }, delay);
  };

  const saveCurriculum = async () => {
    console.log('Starting save');
    if (isSaving) {
      return null;
    }

    isSaving = true;

    if (!hasScope()) {
      isSaving = false;
      setStatus('Select class and subject first', 'idle');
      return;
    }

    const payload = readFormData();
    console.log('Payload units length:', payload.units.length);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch('/createcirriculum', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Save failed with status ${response.status}`);
      }

      const result = await readResponseBody(response);
      activeCurriculumId = result.curriculum && result.curriculum._id ? result.curriculum._id : activeCurriculumId || '';
      setStatus('Saved', 'saved');
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Save request timed out');
      }
      throw error;
    } finally {
      isSaving = false;
    }
  };

  const loadCurriculum = async () => {
    if (!hasScope()) {
      setNotice('Select a class and subject to load an existing curriculum or start a new draft.');
      unitsWrap.innerHTML = '';
      emptyState.style.display = 'block';
      activeCurriculumId = '';
      setStatus('Awaiting selection', 'idle');
      return;
    }

    setStatus('Loading...', 'loading');
    const params = new URLSearchParams({
      forClass: forClassSelect.value.trim(),
      subject: subjectSelect.value.trim()
    });

    const response = await fetch(`/createcirriculum/data?${params.toString()}`, {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Load failed with status ${response.status}`);
    }

    const result = await readResponseBody(response);
    const curriculum = result.curriculum || null;

    renderUnits(curriculum);
    setNotice(curriculum ? 'Loaded existing curriculum from the database.' : 'No saved curriculum found. A new draft is ready.');
    setStatus(curriculum ? 'Loaded' : 'Draft ready', curriculum ? 'loaded' : 'idle');

    if (!curriculum) {
      await saveCurriculum();
    }
  };

  languageToggle.addEventListener('click', () => {
    setNepaliMode(!window.isNepaliMode);
  });

  addUnitButton.addEventListener('click', () => {
    const nextIndex = unitsWrap.querySelectorAll('[data-unit-card]').length;
    unitsWrap.insertAdjacentHTML('beforeend', createUnitCard({}, nextIndex));
    const newCard = unitsWrap.querySelector('[data-unit-card]:last-child');
    arrayFields.forEach((field) => addArrayRowToBlock(newCard.querySelector(`[data-array-block="${field.name}"]`), nextIndex, ''));
    setNotice('New unit added.');
    scheduleSave(250);
  });

  refreshButton.addEventListener('click', () => {
    loadCurriculum().catch((error) => {
      console.error(error);
      setStatus('Load failed', 'error');
    });
  });

  unitsWrap.addEventListener('click', (event) => {
    const addArrayButton = event.target.closest('[data-add-array-row]');
    if (addArrayButton) {
      const block = addArrayButton.closest('[data-array-block]');
      const unitCard = addArrayButton.closest('[data-unit-card]');
      if (block && unitCard) {
        addArrayRowToBlock(block, Number(unitCard.dataset.unitIndex || 0), '');
        reindexArrayRows(block, Number(unitCard.dataset.unitIndex || 0));
      }
      scheduleSave(250);
      return;
    }

    const removeArrayButton = event.target.closest('[data-remove-array-row]');
    if (removeArrayButton) {
      const row = removeArrayButton.closest('[data-array-row]');
      const block = removeArrayButton.closest('[data-array-block]');
      const unitCard = removeArrayButton.closest('[data-unit-card]');
      if (block.querySelectorAll('[data-array-row]').length > 1) {
        row.remove();
      } else {
        row.querySelector('textarea, input').value = '';
      }
      if (block && unitCard) {
        reindexArrayRows(block, Number(unitCard.dataset.unitIndex || 0));
      }
      scheduleSave(250);
      return;
    }

    const removeUnitButton = event.target.closest('[data-remove-unit]');
    if (removeUnitButton) {
      const units = [...unitsWrap.querySelectorAll('[data-unit-card]')];
      if (units.length > 1) {
        removeUnitButton.closest('[data-unit-card]').remove();
      } else {
        removeUnitButton.closest('[data-unit-card]').querySelectorAll('input, textarea').forEach((field) => {
          field.value = '';
        });
        removeUnitButton.closest('[data-unit-card]').querySelectorAll('[data-array-row]').forEach((row) => {
          row.querySelector('input, textarea').value = '';
        });
      }
      unitsWrap.querySelectorAll('[data-unit-card]').forEach((card, index) => {
        card.dataset.unitIndex = index;
        card.querySelectorAll('[data-array-block]').forEach((block) => reindexArrayRows(block, index));
      });
      scheduleSave(250);
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches('input, textarea') && unitsWrap.contains(event.target)) {
      console.log("INPUT TRIGGERED on", event.target.name);
      console.log("Scope:", hasScope());
      console.log('isRendering:', isRendering);
      console.log('unitsWrap.contains(event.target):', unitsWrap.contains(event.target));
      if (!isRendering) {
        scheduleSave();
      }
    }
  });

  form.addEventListener('change', () => {
    if (!isRendering) {
      scheduleSave(AUTOSAVE_DELAY);
    }
  });

  forClassSelect.addEventListener('change', () => {
    loadCurriculum().catch((error) => {
      console.error(error);
      setStatus('Load failed', 'error');
    });
  });

  subjectSelect.addEventListener('change', () => {
    loadCurriculum().catch((error) => {
      console.error(error);
      setStatus('Load failed', 'error');
    });
  });

  const initialize = async () => {
    setNepaliMode(false);

    if (bootstrap.curriculum) {
      renderUnits(bootstrap.curriculum);
      setNotice('Loaded existing curriculum from the database.');
      setStatus('Loaded', 'loaded');
      return;
    }

    if (hasScope()) {
      await loadCurriculum();
      return;
    }

    unitsWrap.innerHTML = '';
    emptyState.style.display = 'block';
    setNotice('Choose a class and subject to begin building the curriculum.');
    setStatus('Awaiting selection', 'idle');
  };

  updateModeLabel();
  initialize().catch((error) => {
    console.error('Curriculum init error:', error);
    setStatus('Initialization failed', 'error');
  });
})();
