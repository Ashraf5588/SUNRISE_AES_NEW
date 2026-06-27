    window.filterLearningOutcomes = function(selectElement, themeIndex) {
      const selectedTheme = selectElement.value;
      const themeItemIndex = themeIndex;

      console.log(`Filtering for theme: ${selectedTheme}, themeItemIndex: ${themeItemIndex}`);

      // Get wrappers for this specific student only
      const outcomeWrappers = document.querySelectorAll(`.learning-outcome-wrapper`);
      
      console.log('Found wrappers:', outcomeWrappers.length);

      let selectedWrapper = null;
      outcomeWrappers.forEach((wrapper, index) => {
        const wrapperTheme = wrapper.dataset.theme;
        const isSelected = wrapperTheme === selectedTheme;

        console.log(`Wrapper ${index}: theme="${wrapperTheme}", selected=${isSelected}`);

        // Always keep legacy wrappers hidden to use the new quick-select table UI.
        wrapper.style.display = 'none';

        if (isSelected) {
          selectedWrapper = wrapper;
        }

        // Important: Don't disable fields - instead modify form submission behavior.
        // Keep inputs enabled so they can be renamed and submitted, but hidden from view.
        const themeFields = wrapper.querySelectorAll('.theme-field');
        themeFields.forEach(field => {
          // mark which wrapper is selected via data attribute for debugging
          field.setAttribute('data-theme-selected', isSelected ? 'true' : 'false');
        });

        // Handle mark inputs - also keep enabled
        const markInputs = wrapper.querySelectorAll('.marks-input');
        markInputs.forEach(input => {
          input.setAttribute('data-theme-selected', isSelected ? 'true' : 'false');
        });
      });
      
      // CRITICAL FIX: Update form field names for the selected theme to use index [0]
      // This ensures the backend receives data in the expected format
      if (selectedWrapper && selectedTheme) {
        updateFieldNamesForSelectedTheme(selectedWrapper);
      }
      
      // If a theme is selected, populate theme view and quick-select lists.
      if (selectedTheme) {
        // Populate student-specific theme data if available, otherwise use server-rendered themeData
        const themesSource = window.studentThemeData || (typeof themeData !== 'undefined' ? [].concat(...themeData.map(td => td.themes)) : []);
        console.log('Populating theme view from themesSource for:', selectedTheme);
        populateThemeData(selectedTheme, themesSource);
        populateQuickSelects(selectedTheme, themesSource);
      }
    }

    // Populate quick-select dropdowns from themeData for a given theme
    // Populate quick-select dropdowns from provided themes array (themesArr)
    function populateQuickSelects(themeName, themesArr) {
      const loSelect = document.getElementById('quickLO');
      const aspectSelect = document.getElementById('quickAspect');
      const toolSelect = document.getElementById('quickTool');
      const indicatorsDiv = document.getElementById('quickIndicators');

      loSelect.innerHTML = '<option value="" selected disabled>Select Learning Outcome</option>';
      aspectSelect.innerHTML = '<option value="" selected disabled>Select Aspect</option>';
      toolSelect.innerHTML = '<option value="" selected disabled>Select Tool</option>';
        aspectSelect.innerHTML = '<option value="" selected disabled>Select Aspect</option>';
        document.getElementById('quickTool').innerHTML = '<option value="" selected disabled>Select Tool</option>';
      // Find themeItem from provided themes array
      let themeItem = null;
      if (Array.isArray(themesArr)) {
        themeItem = themesArr.find(item => item.themeName === themeName) || null;
      }
      if (!themeItem) return;

      // Populate LOs - support both 'learningOutcome' and 'learningOutcomes'
      const loArray = Array.isArray(themeItem.learningOutcome) ? themeItem.learningOutcome : (Array.isArray(themeItem.learningOutcomes) ? themeItem.learningOutcomes : []);
      loArray.forEach((lo, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = (lo.learningOutcomeName || lo.name || lo.learningOutcomeName === 0 ? lo.learningOutcomeName : null) || lo.name || `Learning Outcome ${idx+1}`;
        loSelect.appendChild(opt);
      });

      // Populate aspect/tool options for the selected theme. For English, aspects come from the selected LO in themeData
      // and tools come from the tools collection.
      (async function(){
        try{
          const cls = (document.getElementById('studentClassHidden') && document.getElementById('studentClassHidden').value) || (document.getElementById('studentClass') && document.getElementById('studentClass').value) || '';
          const subj = (document.getElementById('subjectHidden') && document.getElementById('subjectHidden').value) || (document.getElementById('subject') && document.getElementById('subject').value) || '';
          const subjNorm = String(subj || '').toLowerCase();
          if (subjNorm === 'english') {
            aspectSelect.style.display = '';
            aspectSelect.innerHTML = '<option value="" selected disabled>Select Aspect</option>';
            toolSelect.innerHTML = '<option value="" selected disabled>Select Tool</option>';
            if (Array.isArray(window.globalToolsList) && window.globalToolsList.length) {
              window.globalToolsList.forEach((tool, tIdx) => {
                const opt = document.createElement('option');
                opt.value = tIdx;
                opt.textContent = (typeof tool === 'string') ? tool.trim() : (tool.toolName || tool.name || `Tool ${tIdx+1}`);
                toolSelect.appendChild(opt);
              });
            }
            try { applyQuickSelection(themeName); } catch(e){}
            return;
          }
          if (subjNorm && subjNorm !== 'nepali') {
            try {
              aspectSelect.style.display = 'none';
            } catch (e) {}
            toolSelect.innerHTML = '<option value="" selected disabled>Select Tool</option>';
            if (Array.isArray(window.globalToolsList) && window.globalToolsList.length) {
              window.globalToolsList.forEach((tool, tIdx) => {
                const opt = document.createElement('option');
                opt.value = tIdx;
                opt.textContent = (typeof tool === 'string') ? tool.trim() : (tool.toolName || tool.name || `Tool ${tIdx+1}`);
                toolSelect.appendChild(opt);
              });
            }
            try { applyQuickSelection(themeName); } catch(e){}
            return;
          }
          if(!cls || !subj) return;
          const res = await fetch(`/aspect/get/theme?studentClass=${encodeURIComponent(cls)}&subject=${encodeURIComponent(subj)}`);
          const j = await res.json();
          if(j && j.success && Array.isArray(j.aspects) && j.aspects.length){
            aspectSelect.style.display = '';
            aspectSelect.innerHTML = '<option value="" selected disabled>Select Aspect</option>';
            j.aspects.forEach((asp, aIdx) => {
              const opt = document.createElement('option');
              opt.value = aIdx;
              opt.textContent = asp.aspectName || `Aspect ${aIdx+1}`;
              aspectSelect.appendChild(opt);
            });
            aspectSelect._aspectContainerAspects = j.aspects;
          } else {
            try { applyQuickSelection(themeName); } catch(e){ console.warn('applyQuickSelection failed', e); }
          }
        }catch(e){ console.warn('populateQuickSelects aspectcontainer fetch failed', e); try { applyQuickSelection(themeName); } catch(err){} }
      })();
    }

    // Persist and restore the last quick selection per subject/class/section+theme
    function getQuickSelectionKey(themeName){
      const subj = (document.getElementById('subjectHidden') && document.getElementById('subjectHidden').value) || (document.getElementById('subject') && document.getElementById('subject').value) || '';
      const cls = (document.getElementById('studentClassHidden') && document.getElementById('studentClassHidden').value) || (document.getElementById('studentClass') && document.getElementById('studentClass').value) || '';
      const sec = (document.getElementById('sectionHidden') && document.getElementById('sectionHidden').value) || (document.getElementById('section') && document.getElementById('section').value) || '';
      return `themeform_lastSelection_${subj}_${cls}_${sec}_${themeName}`;
    }

    function saveQuickSelection(){
      try{
        const themeName = document.getElementById('themeName').value || '';
        if(!themeName) return;
        const key = getQuickSelectionKey(themeName);
        const payload = {
          lo: document.getElementById('quickLO').value || '',
          asp: document.getElementById('quickAspect').value || '',
          tool: document.getElementById('quickTool').value || '',
          ts: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(payload));
      }catch(e){console.warn('saveQuickSelection failed', e);}
    }

    function loadQuickSelection(themeName){
      try{
        const key = getQuickSelectionKey(themeName);
        const s = localStorage.getItem(key);
        return s ? JSON.parse(s) : null;
      }catch(e){console.warn('loadQuickSelection failed', e); return null;}
    }

    function applyQuickSelection(themeName){
      const sel = loadQuickSelection(themeName);
      if(!sel) return;
      const loSelect = document.getElementById('quickLO');
      const aspSelect = document.getElementById('quickAspect');
      const toolSelect = document.getElementById('quickTool');

      // Apply LO if valid
      if (sel.lo !== undefined && loSelect.options[sel.lo]) {
        loSelect.value = sel.lo;
        try{ onLOChange(); } catch(e){ console.warn('onLOChange failed', e); }
      }

      // Apply aspect if valid (onLOChange should have populated aspects)
      if (sel.asp !== undefined && aspSelect.options[sel.asp]) {
        aspSelect.value = sel.asp;
        try{ onAspectChange(); } catch(e){ console.warn('onAspectChange failed', e); }
      }

      // Apply tool if valid
      if (sel.tool !== undefined && toolSelect.options[sel.tool]) {
        toolSelect.value = sel.tool;
        try{ onToolChange(); } catch(e){ console.warn('onToolChange failed', e); }
      }
    }

    function onLOChange() {
      const loIdx = document.getElementById('quickLO').value;
      const themeName = document.getElementById('themeName').value;
      const aspectSelect = document.getElementById('quickAspect');
      const quickToolSelect = document.getElementById('quickTool');
      quickToolSelect.innerHTML = '<option value="" selected disabled>Select Tool</option>';
      document.getElementById('quickIndicators').innerHTML = '';
      const subjName = (document.getElementById('subject') && document.getElementById('subject').value || '').trim().toLowerCase();
      try {
        if (subjName === 'english' && Array.isArray(window.globalToolsList) && window.globalToolsList.length) {
          window.globalToolsList.forEach((tool, tIdx) => {
            const opt = document.createElement('option');
            opt.value = tIdx;
            opt.textContent = (typeof tool === 'string') ? tool.trim() : (tool.toolName || tool.name || `Tool ${tIdx+1}`);
            quickToolSelect.appendChild(opt);
          });
        }
      } catch (e) { /* ignore */ }
      if (loIdx === '' || loIdx === null) {
        aspectSelect.innerHTML = '<option value="" selected disabled>Select Aspect</option>';
        return;
      }
      if (subjName === 'english') {
        aspectSelect.innerHTML = '<option value="" selected disabled>Select Aspect</option>';
        let themeItem = null;
        try { themeData.forEach(td => td.themes.forEach(item => { if(item.themeName === themeName) themeItem = item; })); } catch (e) { themeItem = null; }
        if (!themeItem) {
          try { saveQuickSelection(); } catch(e){ console.warn('saveQuickSelection failed', e); }
          return;
        }
        const loArray = Array.isArray(themeItem.learningOutcome) ? themeItem.learningOutcome : (Array.isArray(themeItem.learningOutcomes) ? themeItem.learningOutcomes : []);
        const lo = loArray[Number(loIdx)];
        if (Array.isArray(lo && lo.assessmentAspects) && lo.assessmentAspects.length) {
          lo.assessmentAspects.forEach((asp, aIdx) => {
            const opt = document.createElement('option');
            opt.value = aIdx;
            opt.textContent = asp.aspectName || asp.name || `Aspect ${aIdx+1}`;
            aspectSelect.appendChild(opt);
          });
        }
        try { saveQuickSelection(); } catch(e){ console.warn('saveQuickSelection failed', e); }
        return;
      }
      if (aspectSelect._aspectContainerAspects && Array.isArray(aspectSelect._aspectContainerAspects) && aspectSelect._aspectContainerAspects.length) {
        try { saveQuickSelection(); } catch(e){ console.warn('saveQuickSelection failed', e); }
        return;
      }
      aspectSelect.innerHTML = '<option value="" selected disabled>Select Aspect</option>';
      let themeItem = null;
      themeData.forEach(td => td.themes.forEach(item => { if(item.themeName === themeName) themeItem = item; }));
      if (!themeItem) return;
      const loArray = Array.isArray(themeItem.learningOutcome) ? themeItem.learningOutcome : (Array.isArray(themeItem.learningOutcomes) ? themeItem.learningOutcomes : []);
      const lo = loArray[Number(loIdx)];
      if (!lo) return;
      if (Array.isArray(lo.assessmentAspects) && lo.assessmentAspects.length) {
        lo.assessmentAspects.forEach((asp, aIdx) => {
          const opt = document.createElement('option');
          opt.value = aIdx;
          opt.textContent = asp.aspectName || `Aspect ${aIdx+1}`;
          aspectSelect.appendChild(opt);
        });
      }
      try { saveQuickSelection(); } catch(e){ console.warn('saveQuickSelection failed', e); }
    }

    function onAspectChange() {
      const aspSelect = document.getElementById('quickAspect');
      const aspIdx = aspSelect.value;
      const toolSelect = document.getElementById('quickTool');
      toolSelect.innerHTML = '<option value="" selected disabled>Select Tool</option>';
      document.getElementById('quickIndicators').innerHTML = '';
      if (!aspIdx) return;
      const subjName = (document.getElementById('subject') && document.getElementById('subject').value || '').trim().toLowerCase();
      if (subjName === 'english') {
        if (Array.isArray(window.globalToolsList) && window.globalToolsList.length) {
          window.globalToolsList.forEach((tool, tIdx) => {
            const opt = document.createElement('option');
            opt.value = tIdx;
            opt.textContent = (typeof tool === 'string') ? tool.trim() : (tool.toolName || tool.name || `Tool ${tIdx+1}`);
            toolSelect.appendChild(opt);
          });
        }
        try { saveQuickSelection(); } catch(e){ console.warn('saveQuickSelection failed', e); }
        return;
      }
      const acAspects = aspSelect._aspectContainerAspects;
      if (Array.isArray(acAspects) && acAspects.length){
        const asp = acAspects[Number(aspIdx)];
        if (!asp || !Array.isArray(asp.tools)) return;
        asp.tools.forEach((tool, tIdx) => {
          const opt = document.createElement('option');
          opt.value = tIdx;
          opt.textContent = (typeof tool === 'string') ? tool.trim() : (tool.toolName || tool.name || `Tool ${tIdx+1}`);
          toolSelect.appendChild(opt);
        });
        try { saveQuickSelection(); } catch(e){ console.warn('saveQuickSelection failed', e); }
        return;
      }
      const loIdx = document.getElementById('quickLO').value;
      const themeName = document.getElementById('themeName').value;
      if (loIdx === '' || aspIdx === '' ) return;
      let themeItem = null;
      themeData.forEach(td => td.themes.forEach(item => { if(item.themeName === themeName) themeItem = item; }));
      if (!themeItem) return;
      const loArray = Array.isArray(themeItem.learningOutcome) ? themeItem.learningOutcome : (Array.isArray(themeItem.learningOutcomes) ? themeItem.learningOutcomes : []);
      const lo = loArray[Number(loIdx)];
      const asp = lo && lo.assessmentAspects ? lo.assessmentAspects[Number(aspIdx)] : null;
      if (!asp) return;
      if (Array.isArray(asp.tools)) {
        asp.tools.forEach((tool, tIdx) => {
          const opt = document.createElement('option');
          opt.value = tIdx;
          opt.textContent = (typeof tool === 'string') ? tool.trim() : (tool.toolName || tool.name || `Tool ${tIdx+1}`);
          toolSelect.appendChild(opt);
        });
      }
      try { saveQuickSelection(); } catch(e){ console.warn('saveQuickSelection failed', e); }
    }

    function getSavedThemeSelectionContext(themeName, loIdx, aspIdx, toolIdx) {
  try {
    const savedThemes = Array.isArray(window.studentThemeData) ? window.studentThemeData : [];
    const savedTheme = savedThemes.find(t => t && (t.themeName || t.name) === themeName);
    if (!savedTheme) return null;

    const loArray = Array.isArray(savedTheme.learningOutcomes)
      ? savedTheme.learningOutcomes
      : (Array.isArray(savedTheme.learningOutcome) ? savedTheme.learningOutcome : []);
    const loObj = loArray[Number(loIdx)] || null;
    if (!loObj) return null;

    const aspArray = Array.isArray(loObj.assessmentAspects) ? loObj.assessmentAspects : [];
    const aspObj = aspArray[Number(aspIdx)] || null;
    if (!aspObj) return null;

    const toolArray = Array.isArray(aspObj.tools) ? aspObj.tools : [];
    // Try to find tool by name first, then fallback to index
    const toolName = getSelectedToolName();
    let toolObj = null;
    if (toolName) {
      toolObj = toolArray.find(t => (t.toolName || t.name) === toolName);
    }
    if (!toolObj) {
      toolObj = toolArray[Number(toolIdx)] || null;
    }
    return { savedTheme, loObj, aspObj, toolObj };
  } catch (e) {
    console.warn('Could not resolve saved theme selection context', e);
    return null;
  }
}

function getSelectedToolName() {
  const quickTool = document.getElementById('quickTool');
  if (!quickTool || !quickTool.options || quickTool.selectedIndex < 0) return '';
  const selectedOption = quickTool.options[quickTool.selectedIndex];
  return selectedOption ? selectedOption.textContent.trim() : '';
}
    function getSavedIndicatorSelection(ind, savedTool, timing, fallbackIndex) {
  const currentId = ind && (ind._id || ind.id || '');
  
  // Get selected IDs from savedTool
  let selectedIds = [];
  if (timing === 'Before') {
    selectedIds = savedTool && (savedTool.selectedIndicatorsBefore || savedTool.selectedIndicatorsBeforeIds || []);
  } else {
    selectedIds = savedTool && (savedTool.selectedIndicatorsAfter || savedTool.selectedIndicatorsAfterIds || []);
  }
  
  // Also check if the indicator itself has marks that were saved
  const indicatorMarks = timing === 'Before'
    ? (ind && (ind.marksBeforeIntervention || ind.marksBefore || ind.obtainedBefore || null))
    : (ind && (ind.marksAfterIntervention || ind.marksAfter || ind.obtainedAfter || null));

  // Check if this indicator ID is in the selected IDs list
  const matchedById = Boolean(currentId && Array.isArray(selectedIds) && selectedIds.some(id => String(id) === String(currentId)));

  // Also check if this specific indicator has marks saved (even if ID doesn't match)
  const hasSavedMarks = indicatorMarks !== null && Number(indicatorMarks) > 0;

  // Check by value matching (if savedTool has total marks that match this indicator's max marks)
  const targetValue = timing === 'Before'
    ? (savedTool && (savedTool.totalBefore ?? savedTool.totalMarksBeforeIntervention ?? savedTool.marksBeforeIntervention ?? null))
    : (savedTool && (savedTool.totalAfter ?? savedTool.totalMarksAfterIntervention ?? savedTool.marksAfterIntervention ?? null));

  const targetNumber = Number(targetValue);
  const currentValue = Number(ind && (ind.maxMarks || ind.indicatorsMarks || 0));
  const matchedByValue = Number.isFinite(targetNumber) && targetNumber > 0 && currentValue === targetNumber;

  // If this indicator has its own marks saved, mark it as matched
  const matchedByOwnMarks = hasSavedMarks;

  const toolIndicators = savedTool && Array.isArray(savedTool.indicators) ? savedTool.indicators : [];
  const indicatorById = currentId ? toolIndicators.find(item => String(item && (item._id || item.id)) === String(currentId)) : null;
  const fallbackIndicator = toolIndicators[fallbackIndex] || null;

  // Check if the indicator's ID is in the selectedIndicators array at the tool level
  let matchedByToolLevel = false;
  if (savedTool && currentId) {
    const toolSelectedIds = timing === 'Before' 
      ? (savedTool.selectedIndicatorsBefore || [])
      : (savedTool.selectedIndicatorsAfter || []);
    matchedByToolLevel = toolSelectedIds.some(id => String(id) === String(currentId));
  }

  return {
    matched: matchedById || matchedByValue || matchedByOwnMarks || matchedByToolLevel,
    indicatorData: indicatorById || fallbackIndicator || ind,
    targetValue: targetNumber
  };
}
// Helper function to find tool by name across all data
function findToolByNameInStudentData(themeName, toolName) {
  try {
    const savedThemes = Array.isArray(window.studentThemeData) ? window.studentThemeData : [];
    const savedTheme = savedThemes.find(t => t && (t.themeName || t.name) === themeName);
    if (!savedTheme) return null;
    
    const loArray = Array.isArray(savedTheme.learningOutcomes)
      ? savedTheme.learningOutcomes
      : (Array.isArray(savedTheme.learningOutcome) ? savedTheme.learningOutcome : []);
    
    for (const lo of loArray) {
      if (lo.assessmentAspects) {
        for (const aspect of lo.assessmentAspects) {
          if (aspect.tools) {
            for (const tool of aspect.tools) {
              if ((tool.toolName || tool.name) === toolName) {
                return tool;
              }
            }
          }
        }
      }
    }
    return null;
  } catch (e) {
    console.warn('findToolByNameInStudentData failed', e);
    return null;
  }
}
      // helper to update hidden fields when checkboxes used
     function updateQuickCheckboxes() {
  try {
    // Get checked radio buttons (for non-Hamro subjects)
    const beforeRadios = document.querySelectorAll('#quickIndicators input[name^="quickMarkBefore_"]:checked');
    const afterRadios = document.querySelectorAll('#quickIndicators input[name^="quickMarkAfter_"]:checked');
    
    // Get checked checkboxes (for Hamro Serofero)
    const beforeBoxes = Array.from(document.querySelectorAll('.quick-indicator-checkbox[data-timing="Before"]:checked'));
    const afterBoxes = Array.from(document.querySelectorAll('.quick-indicator-checkbox[data-timing="After"]:checked'));
    
    let beforeIds = [];
    let afterIds = [];
    const selectedNames = new Set();
    let sumBefore = 0;
    let sumAfter = 0;
    let maxSum = 0;

    // Process radio buttons (Mathematics, Nepali, English)
    beforeRadios.forEach(radio => {
      if (radio.checked) {
        const name = radio.dataset.indicatorName || '';
        if (name) selectedNames.add(name);
        const val = parseFloat(radio.value) || 0;
        sumBefore += val;
        maxSum += val;
        if (radio.dataset.indicatorId) beforeIds.push(radio.dataset.indicatorId);
        console.log('✅ updateQuickCheckboxes - BEFORE radio found:', { name, val, id: radio.dataset.indicatorId });
      }
    });
    
    afterRadios.forEach(radio => {
      if (radio.checked) {
        const name = radio.dataset.indicatorName || '';
        if (name) selectedNames.add(name);
        const val = parseFloat(radio.value) || 0;
        sumAfter += val;
        maxSum += val;
        if (radio.dataset.indicatorId) afterIds.push(radio.dataset.indicatorId);
        console.log('✅ updateQuickCheckboxes - AFTER radio found:', { name, val, id: radio.dataset.indicatorId });
      }
    });

    // Process checkboxes (Hamro Serofero)
    beforeBoxes.forEach(b => {
      if (b.checked) {
        const name = b.dataset.indicatorName || b.getAttribute('data-indicator-name') || b.value || '';
        if (name) selectedNames.add(name);
        const val = parseFloat(b.value) || 0;
        sumBefore += val;
        const maxMarks = parseFloat(b.dataset.maxMarks) || 0;
        maxSum += maxMarks;
        if (b.dataset.indicatorId) beforeIds.push(b.dataset.indicatorId);
      }
    });
    
    afterBoxes.forEach(b => {
      if (b.checked) {
        const name = b.dataset.indicatorName || b.getAttribute('data-indicator-name') || b.value || '';
        if (name) selectedNames.add(name);
        const val = parseFloat(b.value) || 0;
        sumAfter += val;
        const maxMarks = parseFloat(b.dataset.maxMarks) || 0;
        maxSum += maxMarks;
        if (b.dataset.indicatorId) afterIds.push(b.dataset.indicatorId);
      }
    });

    const namesArr = Array.from(selectedNames);
    
    // Update ALL hidden fields
    const selHidden = document.getElementById('selectedIndicatorHidden');
    if (selHidden) selHidden.value = namesArr.join(',');
    
    const selIdsBefore = document.getElementById('selectedIndicatorIdsBeforeHidden');
    const selIdsAfter = document.getElementById('selectedIndicatorIdsAfterHidden');
    if (selIdsBefore) selIdsBefore.value = beforeIds.join(',');
    if (selIdsAfter) selIdsAfter.value = afterIds.join(',');
    
    const beforeHidden = document.getElementById('selectedIndicatorMarksBeforeHidden');
    const afterHidden = document.getElementById('selectedIndicatorMarksAfterHidden');
    const maxHidden = document.getElementById('selectedIndicatorMaxMarksHidden');
    
    if (beforeHidden) beforeHidden.value = sumBefore;
    if (afterHidden) afterHidden.value = sumAfter;
    if (maxHidden) maxHidden.value = maxSum;
    
    // ALSO update the selectedLOTotalBefore/After fields
    const loTotalBefore = document.getElementById('selectedLOTotalBefore');
    const loTotalAfter = document.getElementById('selectedLOTotalAfter');
    if (loTotalBefore) loTotalBefore.value = sumBefore;
    if (loTotalAfter) loTotalAfter.value = sumAfter;
    
    console.log('✅ updateQuickCheckboxes - Final values:', {
      beforeIds: beforeIds.join(','),
      afterIds: afterIds.join(','),
      sumBefore,
      sumAfter,
      maxSum,
      names: namesArr.join(',')
    });
  } catch (e) { 
    console.warn('updateQuickCheckboxes failed', e); 
  }
}
window.updateQuickCheckboxes = updateQuickCheckboxes;
   function onToolChange() {
  const aspSelect = document.getElementById('quickAspect');
  const toolIdx = document.getElementById('quickTool').value;
  console.log('onToolChange called', { toolIdx, aspSelectPresent: !!aspSelect, globalToolsLen: Array.isArray(window.globalToolsList) ? window.globalToolsList.length : 0 });
  const indicatorsDiv = document.getElementById('quickIndicators');
  indicatorsDiv.innerHTML = '';
  const aspectHidden = (aspSelect && (aspSelect.style.display === 'none' || aspSelect.hidden || aspSelect.options.length <= 1));
  console.log('aspectHidden?', aspectHidden);
  if (!toolIdx) return;

  const subjName = (document.getElementById('subject') && document.getElementById('subject').value || '').trim().toLowerCase();

  let currentAspectObj = null;
  let selectedAspectName = '';
  const selectedAspectIdx = Number(aspSelect.value);
  const selectedAspectOption = (aspSelect && aspSelect.options && aspSelect.selectedIndex >= 0) ? aspSelect.options[aspSelect.selectedIndex] : null;
  selectedAspectName = (selectedAspectOption && selectedAspectOption.textContent) ? selectedAspectOption.textContent.trim() : '';

  if (subjName === 'english') {
    const loIdx = document.getElementById('quickLO').value;
    const themeName = document.getElementById('themeName').value;
    let themeItem = null;
    try {
      themeData.forEach(td => td.themes.forEach(item => { if (item.themeName === themeName) themeItem = item; }));
    } catch (e) { themeItem = null; }
    const loArray = Array.isArray(themeItem && themeItem.learningOutcome) ? themeItem.learningOutcome : (Array.isArray(themeItem && themeItem.learningOutcomes) ? themeItem.learningOutcomes : []);
    const loObj = loArray[Number(loIdx)] || null;
    currentAspectObj = (loObj && Array.isArray(loObj.assessmentAspects)) ? loObj.assessmentAspects[selectedAspectIdx] : null;
    if (!selectedAspectName) {
      selectedAspectName = (currentAspectObj && (currentAspectObj.aspectName || currentAspectObj.name)) || '';
    }
  } else if (aspSelect && aspSelect._aspectContainerAspects && Array.isArray(aspSelect._aspectContainerAspects)) {
    currentAspectObj = aspSelect._aspectContainerAspects[selectedAspectIdx] || null;
    if (!selectedAspectName) {
      selectedAspectName = (currentAspectObj && (currentAspectObj.aspectName || currentAspectObj.name)) || '';
    }
  } else {
    const loIdx = document.getElementById('quickLO').value;
    const themeName = document.getElementById('themeName').value;
    let themeItem = null;
    try {
      themeData.forEach(td => td.themes.forEach(item => { if (item.themeName === themeName) themeItem = item; }));
    } catch (e) { themeItem = null; }
    const loArray = Array.isArray(themeItem && themeItem.learningOutcome) ? themeItem.learningOutcome : (Array.isArray(themeItem && themeItem.learningOutcomes) ? themeItem.learningOutcomes : []);
    const loObj = loArray[Number(loIdx)] || null;
    currentAspectObj = (loObj && Array.isArray(loObj.assessmentAspects)) ? loObj.assessmentAspects[selectedAspectIdx] : null;
    if (!selectedAspectName) {
      selectedAspectName = (currentAspectObj && (currentAspectObj.aspectName || currentAspectObj.name)) || '';
    }
  }

  // ==================== ENGLISH SECTION ====================
   // ==================== ENGLISH SECTION ====================
  if (subjName === 'english') {
    let indicators = [];
    let tool = null;
    let toolNameLocal = '';

    tool = (Array.isArray(window.globalToolsList) && window.globalToolsList[Number(toolIdx)]) ? window.globalToolsList[Number(toolIdx)] : null;
    toolNameLocal = (typeof tool === 'string') ? tool.trim() : (tool && (tool.toolName || tool.name)) || '';
    const selectedToolHiddenElem = document.getElementById('selectedToolHidden');
    if (selectedToolHiddenElem) selectedToolHiddenElem.value = toolNameLocal || selectedToolHiddenElem.value || '';

    if (currentAspectObj && Array.isArray(currentAspectObj.indicators) && currentAspectObj.indicators.length) {
      indicators = currentAspectObj.indicators;
    } else if (tool && Array.isArray(tool.indicators) && tool.indicators.length) {
      indicators = tool.indicators;
    } else if (currentAspectObj && Array.isArray(currentAspectObj.tools)) {
      currentAspectObj.tools.forEach(t => { if (t && Array.isArray(t.indicators)) indicators = indicators.concat(t.indicators); });
    }

    if (!indicators || !Array.isArray(indicators) || indicators.length === 0) {
      indicators = [{ indicatorName: 'Indicator 1', maxMarks: 1 }];
    }

    const table = document.createElement('table');
    table.className = 'evaluation-table';

    const caption = document.createElement('caption');
    caption.style.fontWeight = '700';
    caption.style.marginBottom = '8px';
    const themeName = document.getElementById('themeName').value || '';
    caption.textContent = themeName;
    table.appendChild(caption);

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Learning Outcome', 'Assessment Aspect', 'Tool', 'Indicator', 'Eval Date Before', 'Marks Before', 'Eval Date After', 'Marks After'].forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    const loIdx = document.getElementById('quickLO').value;
    const aspIdx = aspSelect.value;
    const loName = (document.getElementById('quickLO').options[document.getElementById('quickLO').selectedIndex] || {}).text || '';
    const aspName = selectedAspectName || (currentAspectObj && (currentAspectObj.aspectName || currentAspectObj.name)) || '';
    const toolUnique = `${themeName}_${loIdx}_${aspIdx}_${toolIdx}`.replace(/[^a-zA-Z0-9_-]/g, '_');

    const savedSelection = getSavedThemeSelectionContext(themeName, loIdx, aspIdx, toolIdx);
    const savedTool = savedSelection && savedSelection.toolObj ? savedSelection.toolObj : null;

    indicators.forEach((ind, iIdx) => {
      const savedIndicatorStateBefore = getSavedIndicatorSelection(ind, savedTool, 'Before', iIdx);
      const savedIndicatorStateAfter = getSavedIndicatorSelection(ind, savedTool, 'After', iIdx);
      const indicatorData = savedIndicatorStateBefore.indicatorData || savedIndicatorStateAfter.indicatorData || ind;

      const tr = document.createElement('tr');

      if (iIdx === 0) {
        const tdLO = document.createElement('td');
        tdLO.rowSpan = indicators.length;
        tdLO.textContent = loName || `LO ${Number(loIdx)+1}`;
        tr.appendChild(tdLO);

        const tdAsp = document.createElement('td');
        tdAsp.rowSpan = indicators.length;
        tdAsp.textContent = aspName || `Aspect ${Number(aspIdx)+1}`;
        tr.appendChild(tdAsp);

        const tdTool = document.createElement('td');
        tdTool.rowSpan = indicators.length;
        tdTool.textContent = toolNameLocal || `Tool ${Number(toolIdx)+1}`;
        tr.appendChild(tdTool);
      }

      const tdIndicator = document.createElement('td');
      tdIndicator.textContent = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
      tr.appendChild(tdIndicator);

      if (iIdx === 0) {
        const tdEvalBefore = document.createElement('td');
        tdEvalBefore.rowSpan = indicators.length;
        const dateBefore = document.createElement('input');
        dateBefore.type = 'text';
        dateBefore.className = 'nepali-datepicker quick-eval-date-before';
        dateBefore.id = `quick_eval_before_${toolUnique}`;
        dateBefore.name = `subjects[0][themes][0][learningOutcomes][${loIdx}][assessmentAspects][${aspIdx}][tools][${toolIdx}][evaluationDateBefore]`;
        dateBefore.value = (indicatorData && (indicatorData.evaluationDateBefore || indicatorData.evaluationDateBefore === '') ? indicatorData.evaluationDateBefore : (savedTool && (savedTool.evaluationDateBefore || '')) || (tool && tool.evaluationDateBefore) || (ind && (ind.evaluationDateBefore || '')) || '') ;
        dateBefore.addEventListener('change', () => {
          document.getElementById('selectedEvalDateBeforeHidden').value = dateBefore.value || '';
        });
        tdEvalBefore.appendChild(dateBefore);
        tr.appendChild(tdEvalBefore);
      }

      const tdMarksBefore = document.createElement('td');
      const valBefore = ind.maxMarks || ind.indicatorsMarks || 0;
      const subjNameCheck = (document.getElementById('subject') && document.getElementById('subject').value || '').trim().toLowerCase();
      
      if (subjNameCheck === 'hamro serofero') {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'quick-indicator-checkbox';
        cb.dataset.indicatorName = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
        const indicatorId = indicatorData && (indicatorData._id || indicatorData.id) ? (indicatorData._id || indicatorData.id) : '';
        if (indicatorId) cb.dataset.indicatorId = indicatorId;
        cb.dataset.maxMarks = valBefore || 1;
        cb.value = 1;
        cb.setAttribute('data-timing','Before');
        cb.addEventListener('change', updateQuickCheckboxes);
        let shouldCheck = false;
        if (savedIndicatorStateBefore.matched) shouldCheck = true;
        if (!shouldCheck) {
          const savedMarks = indicatorData.marksBeforeIntervention || indicatorData.marksBefore || indicatorData.obtainedBefore || 0;
          if (Number(savedMarks) > 0) shouldCheck = true;
        }
        if (!shouldCheck && savedTool && indicatorId) {
          const selectedIds = savedTool.selectedIndicatorsBefore || [];
          if (selectedIds.some(id => String(id) === String(indicatorId))) shouldCheck = true;
        }
        if (!shouldCheck && savedTool) {
          const totalBefore = savedTool.totalBefore || savedTool.totalMarksBeforeIntervention || 0;
          if (Number(totalBefore) > 0 && Number(totalBefore) === Number(valBefore)) shouldCheck = true;
        }
        if (shouldCheck) cb.checked = true;
        tdMarksBefore.appendChild(cb);
        const spanBefore = document.createElement('span');
        spanBefore.style.marginLeft = '6px';
        spanBefore.textContent = String(cb.value);
        tdMarksBefore.appendChild(spanBefore);
      } else {
        // ★★★ FIXED: Proper nested path with toolIdx for English ★★★
        const rbBeforeName = `subjects[0][themes][0][learningOutcomes][${loIdx}][assessmentAspects][${aspIdx}][tools][${toolIdx}][indicators][${iIdx}][marksBeforeIntervention]`;
        const rbBefore = document.createElement('input');
        rbBefore.type = 'radio';
        rbBefore.name = rbBeforeName;
        rbBefore.value = valBefore;
        const indicatorId = indicatorData && (indicatorData._id || indicatorData.id) ? (indicatorData._id || indicatorData.id) : '';
        rbBefore.dataset.indicatorId = indicatorId;
        rbBefore.dataset.indicatorName = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
        
        // ★★★ ADD: Store loIdx, aspIdx, toolIdx, iIdx for reference ★★★
        rbBefore.dataset.loIdx = loIdx;
        rbBefore.dataset.aspIdx = aspIdx;
        rbBefore.dataset.toolIdx = toolIdx;
        rbBefore.dataset.indicatorIdx = iIdx;
        rbBefore.dataset.timing = 'Before';
        
        rbBefore.addEventListener('click', function() {
          const val = parseFloat(this.value) || 0;
          const name = this.dataset.indicatorName || '';
          const id = this.dataset.indicatorId || '';
          const lo = this.dataset.loIdx || loIdx;
          const asp = this.dataset.aspIdx || aspIdx;
          const tool = this.dataset.toolIdx || toolIdx;
          const idx = this.dataset.indicatorIdx || iIdx;
          
          document.getElementById('selectedIndicatorMarksBeforeHidden').value = val;
          document.getElementById('selectedIndicatorHidden').value = name;
          document.getElementById('selectedIndicatorMaxMarksHidden').value = val;
          
          // ★★★ CRITICAL: Store indicator ID for selectedIndicatorsBefore ★★★
          if (document.getElementById('selectedIndicatorIdsBeforeHidden')) {
            document.getElementById('selectedIndicatorIdsBeforeHidden').value = id;
            console.log('✅ BEFORE radio selected - stored indicator ID:', id, 'for indicator:', name);
          }
          
          // ★★★ ALSO update selectedLOTotalBefore ★★★
          const loTotalBefore = document.getElementById('selectedLOTotalBefore');
          if (loTotalBefore) {
            loTotalBefore.value = val;
          }
          
          // ★★★ Update the hidden field for selectedIndicatorsBefore in the form ★★★
          updateSelectedIndicatorsHiddenFields(lo, asp, tool, id, 'Before');
          
          scheduleAutoSave();
        });

        // Pre-select logic
        let shouldSelect = false;
        if (savedIndicatorStateBefore.matched) shouldSelect = true;
        if (!shouldSelect) {
          const savedMarks = indicatorData.marksBeforeIntervention || indicatorData.marksBefore || indicatorData.obtainedBefore || 0;
          if (Number(savedMarks) > 0) shouldSelect = true;
        }
        if (!shouldSelect && savedTool && indicatorId) {
          const selectedIds = savedTool.selectedIndicatorsBefore || [];
          if (selectedIds.some(id => String(id) === String(indicatorId))) shouldSelect = true;
        }
        if (!shouldSelect && savedTool) {
          const totalBefore = savedTool.totalBefore || savedTool.totalMarksBeforeIntervention || 0;
          if (Number(totalBefore) > 0 && Number(totalBefore) === Number(valBefore)) shouldSelect = true;
        }
        if (shouldSelect) {
          rbBefore.checked = true;
          document.getElementById('selectedIndicatorMarksBeforeHidden').value = valBefore;
          document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
          document.getElementById('selectedIndicatorMaxMarksHidden').value = valBefore;
          if (document.getElementById('selectedIndicatorIdsBeforeHidden')) {
            document.getElementById('selectedIndicatorIdsBeforeHidden').value = rbBefore.dataset.indicatorId || '';
          }
          // Also update selectedLOTotalBefore
          const loTotalBefore = document.getElementById('selectedLOTotalBefore');
          if (loTotalBefore) loTotalBefore.value = valBefore;
        }

        tdMarksBefore.appendChild(rbBefore);
        const spanBefore = document.createElement('span');
        spanBefore.style.marginLeft = '6px';
        spanBefore.textContent = String(valBefore);
        tdMarksBefore.appendChild(spanBefore);
      }
      tr.appendChild(tdMarksBefore);

      if (iIdx === 0) {
        const tdEvalAfter = document.createElement('td');
        tdEvalAfter.rowSpan = indicators.length;
        const dateAfter = document.createElement('input');
        dateAfter.type = 'text';
        dateAfter.className = 'nepali-datepicker quick-eval-date-after';
        dateAfter.id = `quick_eval_after_${toolUnique}`;
        dateAfter.name = `subjects[0][themes][0][learningOutcomes][${loIdx}][assessmentAspects][${aspIdx}][tools][${toolIdx}][evaluationDateAfter]`;
        dateAfter.value = (ind && (ind.evaluationDateAfter || ind.evaluationDateAfter === '') ? ind.evaluationDateAfter : (tool.evaluationDateAfter || ''));
        dateAfter.addEventListener('change', () => {
          document.getElementById('selectedEvalDateAfterHidden').value = dateAfter.value || '';
        });
        tdEvalAfter.appendChild(dateAfter);
        tr.appendChild(tdEvalAfter);
      }

      const tdMarksAfter = document.createElement('td');
      const valAfter = ind.maxMarks || ind.indicatorsMarks || 0;
      const subjNameCheck2 = (document.getElementById('subject') && document.getElementById('subject').value || '').trim().toLowerCase();

      if (subjNameCheck2 === 'hamro serofero') {
        const cb2 = document.createElement('input');
        cb2.type = 'checkbox';
        cb2.className = 'quick-indicator-checkbox';
        cb2.dataset.indicatorName = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
        const indicatorIdAfter = indicatorData && (indicatorData._id || indicatorData.id) ? (indicatorData._id || indicatorData.id) : '';
        if (indicatorIdAfter) cb2.dataset.indicatorId = indicatorIdAfter;
        cb2.dataset.maxMarks = valAfter || 1;
        cb2.value = 1;
        cb2.setAttribute('data-timing','After');
        cb2.addEventListener('change', updateQuickCheckboxes);
        let shouldCheckAfter = false;
        if (savedIndicatorStateAfter.matched) shouldCheckAfter = true;
        if (!shouldCheckAfter) {
          const savedMarksAfter = indicatorData.marksAfterIntervention || indicatorData.marksAfter || indicatorData.obtainedAfter || 0;
          if (Number(savedMarksAfter) > 0) shouldCheckAfter = true;
        }
        if (!shouldCheckAfter && savedTool && indicatorIdAfter) {
          const selectedIdsAfter = savedTool.selectedIndicatorsAfter || [];
          if (selectedIdsAfter.some(id => String(id) === String(indicatorIdAfter))) shouldCheckAfter = true;
        }
        if (!shouldCheckAfter && savedTool) {
          const totalAfter = savedTool.totalAfter || savedTool.totalMarksAfterIntervention || 0;
          if (Number(totalAfter) > 0 && Number(totalAfter) === Number(valAfter)) shouldCheckAfter = true;
        }
        if (shouldCheckAfter) cb2.checked = true;
        tdMarksAfter.appendChild(cb2);
        const spanAfter = document.createElement('span');
        spanAfter.style.marginLeft = '6px';
        spanAfter.textContent = String(cb2.value);
        tdMarksAfter.appendChild(spanAfter);
      } else {
        // ★★★ FIXED: Proper nested path with toolIdx for English ★★★
        const rbAfterName = `subjects[0][themes][0][learningOutcomes][${loIdx}][assessmentAspects][${aspIdx}][tools][${toolIdx}][indicators][${iIdx}][marksAfterIntervention]`;
        const rbAfter = document.createElement('input');
        rbAfter.type = 'radio';
        rbAfter.name = rbAfterName;
        rbAfter.value = valAfter;
        const indicatorIdAfter = indicatorData && (indicatorData._id || indicatorData.id) ? (indicatorData._id || indicatorData.id) : '';
        rbAfter.dataset.indicatorId = indicatorIdAfter;
        rbAfter.dataset.indicatorName = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
        
        // ★★★ ADD: Store loIdx, aspIdx, toolIdx, iIdx for reference ★★★
        rbAfter.dataset.loIdx = loIdx;
        rbAfter.dataset.aspIdx = aspIdx;
        rbAfter.dataset.toolIdx = toolIdx;
        rbAfter.dataset.indicatorIdx = iIdx;
        rbAfter.dataset.timing = 'After';
        
        rbAfter.addEventListener('click', function() {
          const val = parseFloat(this.value) || 0;
          const name = this.dataset.indicatorName || '';
          const id = this.dataset.indicatorId || '';
          const lo = this.dataset.loIdx || loIdx;
          const asp = this.dataset.aspIdx || aspIdx;
          const tool = this.dataset.toolIdx || toolIdx;
          const idx = this.dataset.indicatorIdx || iIdx;
          
          document.getElementById('selectedIndicatorMarksAfterHidden').value = val;
          document.getElementById('selectedIndicatorHidden').value = name;
          document.getElementById('selectedIndicatorMaxMarksHidden').value = val;
          
          // ★★★ CRITICAL: Store indicator ID for selectedIndicatorsAfter ★★★
          if (document.getElementById('selectedIndicatorIdsAfterHidden')) {
            document.getElementById('selectedIndicatorIdsAfterHidden').value = id;
            console.log('✅ AFTER radio selected - stored indicator ID:', id, 'for indicator:', name);
          }
          
          // ★★★ ALSO update selectedLOTotalAfter ★★★
          const loTotalAfter = document.getElementById('selectedLOTotalAfter');
          if (loTotalAfter) {
            loTotalAfter.value = val;
          }
          
          // ★★★ Update the hidden field for selectedIndicatorsAfter in the form ★★★
          updateSelectedIndicatorsHiddenFields(lo, asp, tool, id, 'After');
          
          scheduleAutoSave();
        });

        // Pre-select logic for AFTER
        let shouldSelectAfter = false;
        if (savedIndicatorStateAfter.matched) shouldSelectAfter = true;
        if (!shouldSelectAfter) {
          const savedMarksAfter = indicatorData.marksAfterIntervention || indicatorData.marksAfter || indicatorData.obtainedAfter || 0;
          if (Number(savedMarksAfter) > 0) shouldSelectAfter = true;
        }
        if (!shouldSelectAfter && savedTool && indicatorIdAfter) {
          const selectedIdsAfter = savedTool.selectedIndicatorsAfter || [];
          if (selectedIdsAfter.some(id => String(id) === String(indicatorIdAfter))) shouldSelectAfter = true;
        }
        if (!shouldSelectAfter && savedTool) {
          const totalAfter = savedTool.totalAfter || savedTool.totalMarksAfterIntervention || 0;
          if (Number(totalAfter) > 0 && Number(totalAfter) === Number(valAfter)) shouldSelectAfter = true;
        }
        if (shouldSelectAfter) {
          rbAfter.checked = true;
          document.getElementById('selectedIndicatorMarksAfterHidden').value = valAfter;
          document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
          document.getElementById('selectedIndicatorMaxMarksHidden').value = valAfter;
          if (document.getElementById('selectedIndicatorIdsAfterHidden')) {
            document.getElementById('selectedIndicatorIdsAfterHidden').value = rbAfter.dataset.indicatorId || '';
          }
          // Also update selectedLOTotalAfter
          const loTotalAfter = document.getElementById('selectedLOTotalAfter');
          if (loTotalAfter) loTotalAfter.value = valAfter;
        }

        tdMarksAfter.appendChild(rbAfter);
        const spanAfter = document.createElement('span');
        spanAfter.style.marginLeft = '6px';
        spanAfter.textContent = String(valAfter);
        tdMarksAfter.appendChild(spanAfter);
      }
      tr.appendChild(tdMarksAfter);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    indicatorsDiv.innerHTML = '';
    indicatorsDiv.appendChild(table);
    console.log('Rendered indicators table from AspectContainer, indicators count:', indicators.length);

    try {
      const newDateInputs = indicatorsDiv.querySelectorAll('.nepali-datepicker:not([data-initialized])');
      newDateInputs.forEach(inp => {
        if (typeof inp.nepaliDatePicker === 'function') {
          try { inp.nepaliDatePicker(); inp.setAttribute('data-initialized', 'true'); } catch(e){ console.warn('nepaliDatePicker init failed', e); }
        }
      });
    } catch(e) { console.warn('Error initializing nepali datepickers', e); }
    try {
      try { updateQuickCheckboxes(); } catch(e) {}
      const db = indicatorsDiv.querySelector('.quick-eval-date-before');
      const da = indicatorsDiv.querySelector('.quick-eval-date-after');
      if (db && document.getElementById('selectedEvalDateBeforeHidden')) document.getElementById('selectedEvalDateBeforeHidden').value = db.value || '';
      if (da && document.getElementById('selectedEvalDateAfterHidden')) document.getElementById('selectedEvalDateAfterHidden').value = da.value || '';
    } catch(e) { console.warn('Error initializing quick hidden fields', e); }

    try { saveQuickSelection(); } catch(e){ console.warn('saveQuickSelection failed', e); }
    return;
  }
      // If aspect is intentionally hidden (subjects other than Nepali/English), use tools from globalToolsList
      if (aspectHidden) {
        const loIdx = document.getElementById('quickLO').value;
        const themeName = document.getElementById('themeName').value;
        const tool = (Array.isArray(window.globalToolsList) && window.globalToolsList[Number(toolIdx)]) ? window.globalToolsList[Number(toolIdx)] : null;
        const subjName = (document.getElementById('subject') && document.getElementById('subject').value || '').trim().toLowerCase();
        const useThemeFormatIndicators = ['mathematics', 'hamro serofero','hamro serophero'].includes(subjName);

        let indicators = [];
        if (useThemeFormatIndicators) {
          let themeItem = null;
          try { themeData.forEach(td => td.themes.forEach(item => { if (item.themeName === themeName) themeItem = item; })); } catch(e) { themeItem = null; }
          const toolNameLocal = (typeof tool === 'string') ? tool.trim() : (tool && (tool.toolName || tool.name)) || '';
          if (themeItem) {
            const loArray = Array.isArray(themeItem.learningOutcome) ? themeItem.learningOutcome : (Array.isArray(themeItem.learningOutcomes) ? themeItem.learningOutcomes : []);
            const loObj = loArray[Number(loIdx)];
            if (loObj) {
              const matchingTool = (() => {
                if (!Array.isArray(loObj.assessmentAspects)) return null;
                for (const aspect of loObj.assessmentAspects) {
                  if (!aspect || !Array.isArray(aspect.tools)) continue;
                  for (const candidate of aspect.tools) {
                    if (!candidate) continue;
                    const candidateName = candidate.toolName || candidate.name || '';
                    if (candidateName && toolNameLocal && String(candidateName).toLowerCase() === String(toolNameLocal).toLowerCase()) {
                      return candidate;
                    }
                  }
                }
                return null;
              })();
              if (matchingTool && Array.isArray(matchingTool.indicators) && matchingTool.indicators.length) {
                indicators = matchingTool.indicators;
              } else if (Array.isArray(loObj.indicators) && loObj.indicators.length) {
                indicators = loObj.indicators;
              } else if (Array.isArray(loObj.assessmentAspects)) {
                loObj.assessmentAspects.forEach(aspect => {
                  if (!aspect) return;
                  const toolsArr = Array.isArray(aspect.tools) ? aspect.tools : [];
                  toolsArr.forEach(t => {
                    if (t && Array.isArray(t.indicators) && t.indicators.length) {
                      indicators = indicators.concat(t.indicators);
                    }
                  });
                });
              }
            }
          }
        } else if (tool && Array.isArray(tool.indicators) && tool.indicators.length) {
          indicators = tool.indicators;
        } else {
          let themeItem = null;
          try { themeData.forEach(td => td.themes.forEach(item => { if (item.themeName === themeName) themeItem = item; })); } catch(e) { themeItem = null; }
          if (themeItem) {
            const loArray = Array.isArray(themeItem.learningOutcome) ? themeItem.learningOutcome : (Array.isArray(themeItem.learningOutcomes) ? themeItem.learningOutcomes : []);
            const loObj = loArray[Number(loIdx)];
            if (loObj) {
              if (Array.isArray(loObj.indicators) && loObj.indicators.length) {
                indicators = loObj.indicators;
              } else if (Array.isArray(loObj.assessmentAspects)) {
                loObj.assessmentAspects.forEach(aspect => {
                  if (!aspect) return;
                  const toolsArr = Array.isArray(aspect.tools) ? aspect.tools : [];
                  toolsArr.forEach(t => {
                    if (t && Array.isArray(t.indicators) && t.indicators.length) {
                      indicators = indicators.concat(t.indicators);
                    }
                  });
                });
              }
            }
          }
        }
        if (!indicators || !Array.isArray(indicators) || indicators.length === 0) {
          console.warn('No indicators found for selected tool (aspectHidden path)', { tool, indicators, useThemeFormatIndicators });
          return;
        }

        const table = document.createElement('table');
        table.className = 'evaluation-table';

        const caption = document.createElement('caption');
        caption.style.fontWeight = '700';
        caption.style.marginBottom = '8px';
        caption.textContent = themeName;
        table.appendChild(caption);

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const headers = useThemeFormatIndicators ? ['Learning Outcome', 'Tool', 'Indicator', 'Eval Date Before', 'Marks Before', 'Eval Date After', 'Marks After'] : ['Learning Outcome', 'Assessment Aspect', 'Tool', 'Indicator', 'Eval Date Before', 'Marks Before', 'Eval Date After', 'Marks After'];
        headers.forEach(h => {
          const th = document.createElement('th');
          th.textContent = h;
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        const aspIdx = 0;
       const savedSelection = getSavedThemeSelectionContext(themeName, loIdx, aspIdx, toolIdx);
const savedTool = savedSelection && savedSelection.toolObj ? savedSelection.toolObj : null;
        const loName = (document.getElementById('quickLO').options[document.getElementById('quickLO').selectedIndex] || {}).text || '';
        const aspName = '';
        const toolNameLocal = (typeof tool === 'string') ? tool.trim() : (tool && (tool.toolName || tool.name)) || '';
        const toolUnique = `${themeName}_${(document.getElementById('quickLO').value || '')}_${aspIdx}_${toolIdx}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      

        indicators.forEach((ind, iIdx) => {
          const savedIndicatorStateBefore = getSavedIndicatorSelection(ind, savedTool, 'Before', iIdx);
          const savedIndicatorStateAfter = getSavedIndicatorSelection(ind, savedTool, 'After', iIdx);
          const indicatorData = savedIndicatorStateBefore.indicatorData || savedIndicatorStateAfter.indicatorData || ind;
          const tr = document.createElement('tr');
          const indicatorName = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));

          if (iIdx === 0) {
            const tdLO = document.createElement('td');
            tdLO.rowSpan = indicators.length;
            tdLO.textContent = loName || `LO ${Number(loIdx)+1}`;
            tr.appendChild(tdLO);

            if (!useThemeFormatIndicators) {
              const tdAsp = document.createElement('td');
              tdAsp.rowSpan = indicators.length;
              tdAsp.textContent = aspName;
              tr.appendChild(tdAsp);
            }

            const tdTool = document.createElement('td');
            tdTool.rowSpan = indicators.length;
            tdTool.textContent = toolNameLocal || `Tool ${Number(toolIdx)+1}`;
            tr.appendChild(tdTool);
          }

          const tdIndicator = document.createElement('td');
          tdIndicator.textContent = indicatorName;
          tr.appendChild(tdIndicator);

          if (iIdx === 0) {
            const tdEvalBefore = document.createElement('td');
            tdEvalBefore.rowSpan = indicators.length;
            const dateBefore = document.createElement('input');
            dateBefore.type = 'text';
            dateBefore.className = 'nepali-datepicker quick-eval-date-before';
            dateBefore.id = `quick_eval_before_${toolUnique}`;
            dateBefore.name = `subjects[0][themes][0][learningOutcomes][${loIdx}][assessmentAspects][${aspIdx}][tools][${toolIdx}][evaluationDateBefore]`;
            dateBefore.value = (indicatorData && (indicatorData.evaluationDateBefore || indicatorData.evaluationDateBefore === '') ? indicatorData.evaluationDateBefore : (savedTool && (savedTool.evaluationDateBefore || '')) || (tool && (tool.evaluationDateBefore || '')) || '');
            dateBefore.addEventListener('change', () => {
              document.getElementById('selectedEvalDateBeforeHidden').value = dateBefore.value || '';
            });
            tdEvalBefore.appendChild(dateBefore);
            tr.appendChild(tdEvalBefore);
          }

          const tdMarksBefore = document.createElement('td');
          const valBefore = ind.maxMarks || ind.indicatorsMarks || 0;
          if (subjName === 'hamro serofero') {
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'quick-indicator-checkbox';
  cb.dataset.indicatorName = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
  // Store indicator ID
  const indicatorId = indicatorData && (indicatorData._id || indicatorData.id) ? (indicatorData._id || indicatorData.id) : '';
  if (indicatorId) cb.dataset.indicatorId = indicatorId;
  cb.dataset.maxMarks = valBefore || 1;
  cb.value = 1; // default value per requirement
  cb.setAttribute('data-timing','Before');
  cb.addEventListener('change', updateQuickCheckboxes);
  
  // ENHANCED PRE-CHECK LOGIC FOR HAMRO SEROFERO (BEFORE)
  let shouldCheck = false;
  
  // 1. Check if savedIndicatorState says matched
  if (savedIndicatorStateBefore.matched) {
    shouldCheck = true;
    console.log('✅ Hamro Serofero BEFORE matched by savedIndicatorState');
  }
  
  // 2. Check if this indicator has saved marks in the data
  if (!shouldCheck) {
    const savedMarks = indicatorData.marksBeforeIntervention || indicatorData.marksBefore || indicatorData.obtainedBefore || 0;
    if (Number(savedMarks) > 0) {
      shouldCheck = true;
      console.log('✅ Hamro Serofero BEFORE matched by saved marks:', savedMarks);
    }
  }
  
  // 3. Check if this indicator ID is in the tool's selectedIndicatorsBefore array
  if (!shouldCheck && savedTool && indicatorId) {
    const selectedIds = savedTool.selectedIndicatorsBefore || [];
    if (selectedIds.some(id => String(id) === String(indicatorId))) {
      shouldCheck = true;
      console.log('✅ Hamro Serofero BEFORE matched by indicator ID in selectedIndicatorsBefore');
    }
  }
  
  // 4. Check if the tool has totalBefore that matches this indicator's max marks
  if (!shouldCheck && savedTool) {
    const totalBefore = savedTool.totalBefore || savedTool.totalMarksBeforeIntervention || 0;
    if (Number(totalBefore) > 0 && Number(totalBefore) === Number(valBefore)) {
      shouldCheck = true;
      console.log('✅ Hamro Serofero BEFORE matched by totalBefore value match');
    }
  }
  
  // 5. Check if this indicator name appears in the tool's indicators with saved data
  if (!shouldCheck && savedTool && savedTool.indicators) {
    const indicatorName = indicatorData.indicatorName || indicatorData.name || '';
    const matchingIndicator = savedTool.indicators.find(ind => 
      (ind.indicatorName || ind.name) === indicatorName && 
      (Number(ind.marksBeforeIntervention || ind.marksBefore || ind.obtainedBefore || 0) > 0)
    );
    if (matchingIndicator) {
      shouldCheck = true;
      console.log('✅ Hamro Serofero BEFORE matched by indicator name in saved tool indicators');
    }
  }
  
  // 6. Check if the indicator has marksBeforeIntervention directly in the data
  if (!shouldCheck && indicatorData) {
    const directMarks = indicatorData.marksBeforeIntervention || indicatorData.marksBefore || 0;
    if (Number(directMarks) > 0) {
      shouldCheck = true;
      console.log('✅ Hamro Serofero BEFORE matched by direct marksBeforeIntervention:', directMarks);
    }
  }
  
  // Apply the check
  if (shouldCheck) {
    cb.checked = true;
    // Update hidden fields
    document.getElementById('selectedIndicatorMarksBeforeHidden').value = cb.value;
    document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
    document.getElementById('selectedIndicatorMaxMarksHidden').value = valBefore;
    if (document.getElementById('selectedIndicatorIdsBeforeHidden')) {
      document.getElementById('selectedIndicatorIdsBeforeHidden').value = cb.dataset.indicatorId || '';
    }
  }
  
  tdMarksBefore.appendChild(cb);
  const spanBefore = document.createElement('span');
  spanBefore.style.marginLeft = '6px';
  spanBefore.textContent = String(cb.value);
  tdMarksBefore.appendChild(spanBefore);
}
          else {
          const rbBeforeName = 'quickMarkBefore_' + toolUnique;
const rbBefore = document.createElement('input');
rbBefore.type = 'radio';
rbBefore.name = rbBeforeName;
rbBefore.value = valBefore;
const indicatorId = indicatorData && (indicatorData._id || indicatorData.id) ? (indicatorData._id || indicatorData.id) : '';
rbBefore.dataset.indicatorId = indicatorId;
// ★★★ FIX: Use indicatorData to get the name ★★★
rbBefore.dataset.indicatorName = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
rbBefore.addEventListener('click', () => {
  document.getElementById('selectedIndicatorMarksBeforeHidden').value = rbBefore.value;
  document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
  document.getElementById('selectedIndicatorMaxMarksHidden').value = valBefore;
  if (document.getElementById('selectedIndicatorIdsBeforeHidden')) {
    document.getElementById('selectedIndicatorIdsBeforeHidden').value = rbBefore.dataset.indicatorId || '';
  }
  scheduleAutoSave();
});
            
            try {
              if (typeof indicatorData.obtainedBefore !== 'undefined' && Number(indicatorData.obtainedBefore) === Number(valBefore)) {
                rbBefore.checked = true;
                document.getElementById('selectedIndicatorMarksBeforeHidden').value = rbBefore.value;
                document.getElementById('selectedIndicatorHidden').value = indicatorName;
                document.getElementById('selectedIndicatorMaxMarksHidden').value = valBefore;
                if (document.getElementById('selectedIndicatorIdsBeforeHidden')) document.getElementById('selectedIndicatorIdsBeforeHidden').value = rbBefore.dataset.indicatorId || '';
              }
            } catch(e) {}
            tdMarksBefore.appendChild(rbBefore);
            const spanBefore = document.createElement('span');
            spanBefore.style.marginLeft = '6px';
            spanBefore.textContent = String(valBefore);
            tdMarksBefore.appendChild(spanBefore);
          }
          tr.appendChild(tdMarksBefore);

          if (iIdx === 0) {
            const tdEvalAfter = document.createElement('td');
            tdEvalAfter.rowSpan = indicators.length;
            const dateAfter = document.createElement('input');
            dateAfter.type = 'text';
            dateAfter.className = 'nepali-datepicker quick-eval-date-after';
            dateAfter.id = `quick_eval_after_${toolUnique}`;
            dateAfter.name = `subjects[0][themes][0][learningOutcomes][${loIdx}][assessmentAspects][${aspIdx}][tools][${toolIdx}][evaluationDateAfter]`;
            dateAfter.value = (indicatorData && (indicatorData.evaluationDateAfter || indicatorData.evaluationDateAfter === '') ? indicatorData.evaluationDateAfter : (savedTool && (savedTool.evaluationDateAfter || '')) || (tool && (tool.evaluationDateAfter || '')) || '');
            dateAfter.addEventListener('change', () => {
              document.getElementById('selectedEvalDateAfterHidden').value = dateAfter.value || '';
            });
            tdEvalAfter.appendChild(dateAfter);
            tr.appendChild(tdEvalAfter);
          }

          const tdMarksAfter = document.createElement('td');
          const valAfter = ind.maxMarks || ind.indicatorsMarks || 0;
     if (subjName === 'hamro serofero') {
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'quick-indicator-checkbox';
  cb.dataset.indicatorName = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
  // Store indicator ID
  const indicatorId = indicatorData && (indicatorData._id || indicatorData.id) ? (indicatorData._id || indicatorData.id) : '';
  if (indicatorId) cb.dataset.indicatorId = indicatorId;
  cb.dataset.maxMarks = valBefore || 1;
  cb.value = 1; // default value per requirement
  cb.setAttribute('data-timing','Before');
  cb.addEventListener('change', updateQuickCheckboxes);
  
  // ENHANCED PRE-CHECK LOGIC FOR HAMRO SEROFERO (BEFORE)
  let shouldCheck = false;
  
  // 1. Check if savedIndicatorState says matched
  if (savedIndicatorStateBefore.matched) {
    shouldCheck = true;
    console.log('✅ Hamro Serofero BEFORE matched by savedIndicatorState');
  }
  
  // 2. Check if this indicator has saved marks in the data
  if (!shouldCheck) {
    const savedMarks = indicatorData.marksBeforeIntervention || indicatorData.marksBefore || indicatorData.obtainedBefore || 0;
    if (Number(savedMarks) > 0) {
      shouldCheck = true;
      console.log('✅ Hamro Serofero BEFORE matched by saved marks:', savedMarks);
    }
  }
  
  // 3. Check if this indicator ID is in the tool's selectedIndicatorsBefore array
  if (!shouldCheck && savedTool && indicatorId) {
    const selectedIds = savedTool.selectedIndicatorsBefore || [];
    if (selectedIds.some(id => String(id) === String(indicatorId))) {
      shouldCheck = true;
      console.log('✅ Hamro Serofero BEFORE matched by indicator ID in selectedIndicatorsBefore');
    }
  }
  
  // 4. Check if the tool has totalBefore that matches this indicator's max marks
  if (!shouldCheck && savedTool) {
    const totalBefore = savedTool.totalBefore || savedTool.totalMarksBeforeIntervention || 0;
    if (Number(totalBefore) > 0 && Number(totalBefore) === Number(valBefore)) {
      shouldCheck = true;
      console.log('✅ Hamro Serofero BEFORE matched by totalBefore value match');
    }
  }
  
  // 5. Check if this indicator name appears in the tool's indicators with saved data
  if (!shouldCheck && savedTool && savedTool.indicators) {
    const indicatorName = indicatorData.indicatorName || indicatorData.name || '';
    const matchingIndicator = savedTool.indicators.find(ind => 
      (ind.indicatorName || ind.name) === indicatorName && 
      (Number(ind.marksBeforeIntervention || ind.marksBefore || ind.obtainedBefore || 0) > 0)
    );
    if (matchingIndicator) {
      shouldCheck = true;
      console.log('✅ Hamro Serofero BEFORE matched by indicator name in saved tool indicators');
    }
  }
  
  // 6. Check if the indicator has marksBeforeIntervention directly in the data
  if (!shouldCheck && indicatorData) {
    const directMarks = indicatorData.marksBeforeIntervention || indicatorData.marksBefore || 0;
    if (Number(directMarks) > 0) {
      shouldCheck = true;
      console.log('✅ Hamro Serofero BEFORE matched by direct marksBeforeIntervention:', directMarks);
    }
  }
  
  // Apply the check
  if (shouldCheck) {
    cb.checked = true;
    // Update hidden fields
    document.getElementById('selectedIndicatorMarksBeforeHidden').value = cb.value;
    document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
    document.getElementById('selectedIndicatorMaxMarksHidden').value = valBefore;
    if (document.getElementById('selectedIndicatorIdsBeforeHidden')) {
      document.getElementById('selectedIndicatorIdsBeforeHidden').value = cb.dataset.indicatorId || '';
    }
  }
  
  tdMarksBefore.appendChild(cb);
  const spanBefore = document.createElement('span');
  spanBefore.style.marginLeft = '6px';
  spanBefore.textContent = String(cb.value);
  tdMarksBefore.appendChild(spanBefore);
}
          
          
          else {
         const rbAfterName = 'quickMarkAfter_' + toolUnique;
const rbAfter = document.createElement('input');
rbAfter.type = 'radio';
rbAfter.name = rbAfterName;
rbAfter.value = valAfter;
const indicatorIdAfter = indicatorData && (indicatorData._id || indicatorData.id) ? (indicatorData._id || indicatorData.id) : '';
rbAfter.dataset.indicatorId = indicatorIdAfter;
// ★★★ FIX: Use indicatorData to get the name ★★★
rbAfter.dataset.indicatorName = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
rbAfter.addEventListener('click', () => {
  document.getElementById('selectedIndicatorMarksAfterHidden').value = rbAfter.value;
  document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
  document.getElementById('selectedIndicatorMaxMarksHidden').value = valAfter;
  if (document.getElementById('selectedIndicatorIdsAfterHidden')) {
    document.getElementById('selectedIndicatorIdsAfterHidden').value = rbAfter.dataset.indicatorId || '';
  }
  scheduleAutoSave();
});
            try {
              if (typeof indicatorData.obtainedAfter !== 'undefined' && Number(indicatorData.obtainedAfter) === Number(valAfter)) {
                rbAfter.checked = true;
                document.getElementById('selectedIndicatorMarksAfterHidden').value = rbAfter.value;
                document.getElementById('selectedIndicatorHidden').value = indicatorName;
                document.getElementById('selectedIndicatorMaxMarksHidden').value = valAfter;
                if (document.getElementById('selectedIndicatorIdsAfterHidden')) document.getElementById('selectedIndicatorIdsAfterHidden').value = rbAfter.dataset.indicatorId || '';
              }
            } catch(e) {}
            tdMarksAfter.appendChild(rbAfter);
            const spanAfter = document.createElement('span');
            spanAfter.style.marginLeft = '6px';
            spanAfter.textContent = String(valAfter);
            tdMarksAfter.appendChild(spanAfter);
          }
          tr.appendChild(tdMarksAfter);

          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        indicatorsDiv.innerHTML = '';
        indicatorsDiv.appendChild(table);
        console.log('Rendered indicators table from theme-format data for subject', subjName, 'indicators count:', indicators.length);

              try {
          const newDateInputs = indicatorsDiv.querySelectorAll('.nepali-datepicker:not([data-initialized])');
          newDateInputs.forEach(inp => {
            if (typeof inp.nepaliDatePicker === 'function') {
              try { inp.nepaliDatePicker(); inp.setAttribute('data-initialized', 'true'); } catch(e){ console.warn('nepaliDatePicker init failed', e); }
            }
          });
        } catch(e) { console.warn('Error initializing nepali datepickers', e); }

        // ===== FORCE RADIO SELECTION FOR MATHEMATICS/ASPECT HIDDEN =====
        setTimeout(function() {
          try {
            console.log('🔍 Running force selection for aspectHidden path');
            const radios = document.querySelectorAll('#quickIndicators input[type="radio"]');
            let selectedBefore = false;
            let selectedAfter = false;
            
            radios.forEach(function(radio) {
              if (!radio.name) return;
              const val = parseFloat(radio.value);
              
              if (radio.name.startsWith('quickMarkBefore_')) {
                const totalBefore = savedTool ? (savedTool.totalBefore || savedTool.totalMarksBeforeIntervention || 0) : 0;
                if (val === totalBefore && totalBefore > 0) {
                  radio.checked = true;
                  selectedBefore = true;
                  document.getElementById('selectedIndicatorMarksBeforeHidden').value = radio.value;
                  document.getElementById('selectedIndicatorHidden').value = radio.dataset.indicatorName || '';
                  document.getElementById('selectedIndicatorMaxMarksHidden').value = radio.value;
                  if (document.getElementById('selectedIndicatorIdsBeforeHidden')) {
                    document.getElementById('selectedIndicatorIdsBeforeHidden').value = radio.dataset.indicatorId || '';
                  }
                  console.log('✅ Force selected BEFORE radio:', { value: radio.value, name: radio.dataset.indicatorName });
                }
              } else if (radio.name.startsWith('quickMarkAfter_')) {
                const totalAfter = savedTool ? (savedTool.totalAfter || savedTool.totalMarksAfterIntervention || 0) : 0;
                if (val === totalAfter && totalAfter > 0) {
                  radio.checked = true;
                  selectedAfter = true;
                  document.getElementById('selectedIndicatorMarksAfterHidden').value = radio.value;
                  document.getElementById('selectedIndicatorHidden').value = radio.dataset.indicatorName || '';
                  document.getElementById('selectedIndicatorMaxMarksHidden').value = radio.value;
                  if (document.getElementById('selectedIndicatorIdsAfterHidden')) {
                    document.getElementById('selectedIndicatorIdsAfterHidden').value = radio.dataset.indicatorId || '';
                  }
                  console.log('✅ Force selected AFTER radio:', { value: radio.value, name: radio.dataset.indicatorName });
                }
              }
            });
            
            // Try indicator name matching if total matching didn't work
            if (!selectedBefore || !selectedAfter) {
              const rows = document.querySelectorAll('#quickIndicators table tbody tr');
              rows.forEach(function(row) {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                  const indicatorName = cells[3] ? cells[3].textContent.trim() : '';
                  if (savedTool && savedTool.indicators) {
                    const savedIndicator = savedTool.indicators.find(ind => 
                      (ind.indicatorName || ind.name) === indicatorName
                    );
                    if (savedIndicator) {
                      const beforeRadio = row.querySelector('input[name^="quickMarkBefore_"]');
                      const afterRadio = row.querySelector('input[name^="quickMarkAfter_"]');
                      
                      const beforeMarks = savedIndicator.marksBeforeIntervention || savedIndicator.marksBefore || savedIndicator.obtainedBefore || 0;
                      const afterMarks = savedIndicator.marksAfterIntervention || savedIndicator.marksAfter || savedIndicator.obtainedAfter || 0;
                      
                      if (beforeRadio && beforeMarks > 0 && !selectedBefore) {
                        beforeRadio.checked = true;
                        selectedBefore = true;
                        document.getElementById('selectedIndicatorMarksBeforeHidden').value = beforeRadio.value;
                        document.getElementById('selectedIndicatorHidden').value = indicatorName;
                        document.getElementById('selectedIndicatorMaxMarksHidden').value = beforeRadio.value;
                        if (document.getElementById('selectedIndicatorIdsBeforeHidden')) {
                          document.getElementById('selectedIndicatorIdsBeforeHidden').value = beforeRadio.dataset.indicatorId || '';
                        }
                        console.log('✅ Selected BEFORE radio by indicator name:', indicatorName);
                      }
                      if (afterRadio && afterMarks > 0 && !selectedAfter) {
                        afterRadio.checked = true;
                        selectedAfter = true;
                        document.getElementById('selectedIndicatorMarksAfterHidden').value = afterRadio.value;
                        document.getElementById('selectedIndicatorHidden').value = indicatorName;
                        document.getElementById('selectedIndicatorMaxMarksHidden').value = afterRadio.value;
                        if (document.getElementById('selectedIndicatorIdsAfterHidden')) {
                          document.getElementById('selectedIndicatorIdsAfterHidden').value = afterRadio.dataset.indicatorId || '';
                        }
                        console.log('✅ Selected AFTER radio by indicator name:', indicatorName);
                      }
                    }
                  }
                }
              });
            }
            
            updateQuickCheckboxes();
            console.log('✅ Force selection complete - Before:', selectedBefore, 'After:', selectedAfter);
          } catch(e) {
            console.warn('Force selection failed:', e);
          }
        }, 300);

        try { saveQuickSelection(); } catch(e){ console.warn('saveQuickSelection failed', e); }
        return;
      }
      // Nepali subject should render tool indicators from the aspect container
           // Nepali subject should render tool indicators from the aspect container
      if (subjName === 'nepali' && currentAspectObj && Array.isArray(currentAspectObj.tools)) {
        const themeName = document.getElementById('themeName').value;
        const loIdx = document.getElementById('quickLO').value;
        const aspIdx = aspSelect.value;
        const tool = currentAspectObj.tools[Number(toolIdx)];
        if (!tool || !Array.isArray(tool.indicators)) {
          console.warn('Nepali tool selected but no indicators found', { toolIdx, currentAspectObj });
          return;
        }
        
        // ★★★ FIX: Get savedTool for pre-selection ★★★
        const savedSelection = getSavedThemeSelectionContext(themeName, loIdx, aspIdx, toolIdx);
        const savedTool = savedSelection && savedSelection.toolObj ? savedSelection.toolObj : null;
        
        const resolveIndicatorIdForNepali = (indicatorName) => {
          if (!indicatorName) return '';
          if (!Array.isArray(themeData)) return '';
          let found = '';
          try {
            themeData.some(td => {
              if (!td || !Array.isArray(td.themes)) return false;
              return td.themes.some(theme => {
                if (found || theme.themeName !== themeName) return false;
                const loArray = Array.isArray(theme.learningOutcome) ? theme.learningOutcome : (Array.isArray(theme.learningOutcomes) ? theme.learningOutcomes : []);
                const loObj2 = loArray[Number(loIdx)];
                if (!loObj2 || !Array.isArray(loObj2.assessmentAspects)) return false;
                const aspObj2 = loObj2.assessmentAspects[Number(aspIdx)];
                if (!aspObj2 || !Array.isArray(aspObj2.tools)) return false;
                const toolObj2 = aspObj2.tools[Number(toolIdx)];
                if (!toolObj2 || !Array.isArray(toolObj2.indicators)) return false;
                return toolObj2.indicators.some(ii => {
                  const iName = (ii && (ii.indicatorName || ii.name)) || '';
                  if (iName === indicatorName) {
                    found = ii._id || '';
                    return true;
                  }
                  return false;
                });
              });
            });
          } catch (e) {
            console.warn('resolveIndicatorIdForNepali failed', e);
          }
          return found;
        };
        
        const indicators = tool.indicators;
        const table = document.createElement('table');
        table.className = 'evaluation-table';
        const caption = document.createElement('caption');
        caption.style.fontWeight = '700';
        caption.style.marginBottom = '8px';
        caption.textContent = themeName;
        table.appendChild(caption);
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Learning Outcome', 'Assessment Aspect', 'Tool', 'Indicator', 'Eval Date Before', 'Marks Before', 'Eval Date After', 'Marks After'].forEach(h => {
          const th = document.createElement('th');
          th.textContent = h;
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        const loName = (document.getElementById('quickLO').options[document.getElementById('quickLO').selectedIndex] || {}).text || '';
        const aspName = selectedAspectName || '';
        const toolNameLocal = tool && (tool.toolName || tool.name) ? (tool.toolName || tool.name) : '';
        const toolUnique = `${themeName}_${loIdx}_${aspIdx}_${toolIdx}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        indicators.forEach((ind, iIdx) => {
          // ★★★ FIX: Define indicatorData ★★★
          const savedIndicatorStateBefore = getSavedIndicatorSelection(ind, savedTool, 'Before', iIdx);
          const savedIndicatorStateAfter = getSavedIndicatorSelection(ind, savedTool, 'After', iIdx);
          const indicatorData = savedIndicatorStateBefore.indicatorData || savedIndicatorStateAfter.indicatorData || ind;
          
          const tr = document.createElement('tr');
          if (iIdx === 0) {
            const tdLO = document.createElement('td');
            tdLO.rowSpan = indicators.length;
            tdLO.textContent = loName || `LO ${Number(loIdx)+1}`;
            tr.appendChild(tdLO);
            const tdAsp = document.createElement('td');
            tdAsp.rowSpan = indicators.length;
            tdAsp.textContent = aspName || `Aspect ${Number(aspIdx)+1}`;
            tr.appendChild(tdAsp);
            const tdTool = document.createElement('td');
            tdTool.rowSpan = indicators.length;
            tdTool.textContent = toolNameLocal || `Tool ${Number(toolIdx)+1}`;
            tr.appendChild(tdTool);
          }
          const tdIndicator = document.createElement('td');
          tdIndicator.textContent = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
          tr.appendChild(tdIndicator);
          if (iIdx === 0) {
            const tdEvalBefore = document.createElement('td');
            tdEvalBefore.rowSpan = indicators.length;
            const dateBefore = document.createElement('input');
            dateBefore.type = 'text';
            dateBefore.className = 'nepali-datepicker quick-eval-date-before';
            dateBefore.id = `quick_eval_before_${toolUnique}`;
            dateBefore.name = `subjects[0][themes][0][learningOutcomes][${loIdx}][assessmentAspects][${aspIdx}][tools][${toolIdx}][evaluationDateBefore]`;
            // Try to get saved date from savedTool first, then from tool
            const savedDateBefore = savedTool ? (savedTool.evaluationDateBefore || '') : '';
            dateBefore.value = (ind && (ind.evaluationDateBefore || ind.evaluationDateBefore === '') ? ind.evaluationDateBefore : savedDateBefore || tool.evaluationDateBefore || '');
            dateBefore.addEventListener('change', () => {
              document.getElementById('selectedEvalDateBeforeHidden').value = dateBefore.value || '';
            });
            tdEvalBefore.appendChild(dateBefore);
            tr.appendChild(tdEvalBefore);
          }
          const tdMarksBefore = document.createElement('td');
          const valBefore = ind.maxMarks || ind.indicatorsMarks || 0;
       const rbBeforeName = 'quickMarkBefore_' + toolUnique;
const rbBefore = document.createElement('input');
rbBefore.type = 'radio';
rbBefore.name = rbBeforeName;
rbBefore.value = valBefore;
const indicatorId = indicatorData && (indicatorData._id || indicatorData.id) ? (indicatorData._id || indicatorData.id) : '';
rbBefore.dataset.indicatorId = indicatorId;
// ★★★ FIX: Use indicatorData to get the name ★★★
rbBefore.dataset.indicatorName = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
rbBefore.addEventListener('click', () => {
  document.getElementById('selectedIndicatorMarksBeforeHidden').value = rbBefore.value;
  document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
  document.getElementById('selectedIndicatorMaxMarksHidden').value = valBefore;
  if (document.getElementById('selectedIndicatorIdsBeforeHidden')) {
    document.getElementById('selectedIndicatorIdsBeforeHidden').value = rbBefore.dataset.indicatorId || '';
  }
  scheduleAutoSave();
});
          // Pre-select if matched
          if (savedIndicatorStateBefore.matched) {
            rbBefore.checked = true;
            document.getElementById('selectedIndicatorMarksBeforeHidden').value = rbBefore.value;
            document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
            document.getElementById('selectedIndicatorMaxMarksHidden').value = valBefore;
            if (document.getElementById('selectedIndicatorIdsBeforeHidden')) {
              document.getElementById('selectedIndicatorIdsBeforeHidden').value = rbBefore.dataset.indicatorId || '';
            }
          }
          
          tdMarksBefore.appendChild(rbBefore);
          const spanBefore = document.createElement('span');
          spanBefore.style.marginLeft = '6px';
          spanBefore.textContent = String(valBefore);
          tdMarksBefore.appendChild(spanBefore);
          tr.appendChild(tdMarksBefore);
          
          if (iIdx === 0) {
            const tdEvalAfter = document.createElement('td');
            tdEvalAfter.rowSpan = indicators.length;
            const dateAfter = document.createElement('input');
            dateAfter.type = 'text';
            dateAfter.className = 'nepali-datepicker quick-eval-date-after';
            dateAfter.id = `quick_eval_after_${toolUnique}`;
            dateAfter.name = `subjects[0][themes][0][learningOutcomes][${loIdx}][assessmentAspects][${aspIdx}][tools][${toolIdx}][evaluationDateAfter]`;
            const savedDateAfter = savedTool ? (savedTool.evaluationDateAfter || '') : '';
            dateAfter.value = (ind && (ind.evaluationDateAfter || ind.evaluationDateAfter === '') ? ind.evaluationDateAfter : savedDateAfter || tool.evaluationDateAfter || '');
            dateAfter.addEventListener('change', () => {
              document.getElementById('selectedEvalDateAfterHidden').value = dateAfter.value || '';
            });
            tdEvalAfter.appendChild(dateAfter);
            tr.appendChild(tdEvalAfter);
          }
          
          const tdMarksAfter = document.createElement('td');
          const valAfter = ind.maxMarks || ind.indicatorsMarks || 0;
       const rbAfterName = 'quickMarkAfter_' + toolUnique;
const rbAfter = document.createElement('input');
rbAfter.type = 'radio';
rbAfter.name = rbAfterName;
rbAfter.value = valAfter;
const indicatorIdAfter = indicatorData && (indicatorData._id || indicatorData.id) ? (indicatorData._id || indicatorData.id) : '';
rbAfter.dataset.indicatorId = indicatorIdAfter;
// ★★★ FIX: Use indicatorData to get the name ★★★
rbAfter.dataset.indicatorName = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
rbAfter.addEventListener('click', () => {
  document.getElementById('selectedIndicatorMarksAfterHidden').value = rbAfter.value;
  document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
  document.getElementById('selectedIndicatorMaxMarksHidden').value = valAfter;
  if (document.getElementById('selectedIndicatorIdsAfterHidden')) {
    document.getElementById('selectedIndicatorIdsAfterHidden').value = rbAfter.dataset.indicatorId || '';
  }
  scheduleAutoSave();
});
          
          // Pre-select if matched
          if (savedIndicatorStateAfter.matched) {
            rbAfter.checked = true;
            document.getElementById('selectedIndicatorMarksAfterHidden').value = rbAfter.value;
            document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
            document.getElementById('selectedIndicatorMaxMarksHidden').value = valAfter;
            if (document.getElementById('selectedIndicatorIdsAfterHidden')) {
              document.getElementById('selectedIndicatorIdsAfterHidden').value = rbAfter.dataset.indicatorId || '';
            }
          }
          
          tdMarksAfter.appendChild(rbAfter);
          const spanAfter = document.createElement('span');
          spanAfter.style.marginLeft = '6px';
          spanAfter.textContent = String(valAfter);
          tdMarksAfter.appendChild(spanAfter);
          tr.appendChild(tdMarksAfter);
          tbody.appendChild(tr);
        });
        
        table.appendChild(tbody);
        indicatorsDiv.innerHTML = '';
        indicatorsDiv.appendChild(table);
        try {
          const newDateInputs = indicatorsDiv.querySelectorAll('.nepali-datepicker:not([data-initialized])');
          newDateInputs.forEach(inp => {
            if (typeof inp.nepaliDatePicker === 'function') {
              try { inp.nepaliDatePicker(); inp.setAttribute('data-initialized', 'true'); } catch(e){ console.warn('nepaliDatePicker init failed', e); }
            }
          });
        } catch(e) { console.warn('Error initializing nepali datepickers', e); }
        try { updateQuickCheckboxes(); } catch(e) {}
        try { saveQuickSelection(); } catch(e){ console.warn('saveQuickSelection failed', e); }
        return;
      }
      // Fallback to themeData behavior
      const fallbackLoIdx = document.getElementById('quickLO').value;
      const fallbackAspectIdx = document.getElementById('quickAspect').value;
      const themeName = document.getElementById('themeName').value;
      if (fallbackLoIdx === '' || fallbackAspectIdx === '' || toolIdx === '') return;
      let themeItem = null;
      themeData.forEach(td => td.themes.forEach(item => { if(item.themeName === themeName) themeItem = item; }));
      if (!themeItem) return;
      const loArray = Array.isArray(themeItem.learningOutcome) ? themeItem.learningOutcome : (Array.isArray(themeItem.learningOutcomes) ? themeItem.learningOutcomes : []);
      const loObj = loArray[Number(fallbackLoIdx)];
      if (!loObj || !Array.isArray(loObj.assessmentAspects)) return;
      const fallbackAspectObj = loObj.assessmentAspects[Number(fallbackAspectIdx)];
      if (!fallbackAspectObj || !Array.isArray(fallbackAspectObj.tools)) return;
      const tool = fallbackAspectObj.tools[Number(toolIdx)];
      if (!tool || !Array.isArray(tool.indicators)) return;
      // Build a table showing LO / Aspect / Tool / Indicators (radio per indicator)
      const indicators = tool.indicators;
      const table = document.createElement('table');
      table.className = 'evaluation-table';

      // Caption with theme name
      const caption = document.createElement('caption');
      caption.style.fontWeight = '700';
      caption.style.marginBottom = '8px';
      caption.textContent = themeName;
      table.appendChild(caption);

      // Header: LO | Aspect | Tool | Indicator | Eval Date Before | Marks Before | Eval Date After | Marks After
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['Learning Outcome', 'Assessment Aspect', 'Tool', 'Indicator', 'Eval Date Before', 'Marks Before', 'Eval Date After', 'Marks After'].forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      const loName = (themeItem && themeItem.learningOutcome && themeItem.learningOutcome[Number(loIdx)] && (themeItem.learningOutcome[Number(loIdx)].learningOutcomeName || themeItem.learningOutcome[Number(loIdx)].name)) || (themeItem && themeItem.learningOutcomes && themeItem.learningOutcomes[Number(loIdx)] && (themeItem.learningOutcomes[Number(loIdx)].learningOutcomeName || themeItem.learningOutcomes[Number(loIdx)].name)) || '';
      const aspName = (themeItem && themeItem.learningOutcome && themeItem.learningOutcome[Number(loIdx)] && themeItem.learningOutcome[Number(loIdx)].assessmentAspects && themeItem.learningOutcome[Number(loIdx)].assessmentAspects[Number(aspIdx)] && (themeItem.learningOutcome[Number(loIdx)].assessmentAspects[Number(aspIdx)].aspectName || themeItem.learningOutcome[Number(loIdx)].assessmentAspects[Number(aspIdx)].name)) || (themeItem && themeItem.learningOutcomes && themeItem.learningOutcomes[Number(loIdx)] && themeItem.learningOutcomes[Number(loIdx)].assessmentAspects && themeItem.learningOutcomes[Number(loIdx)].assessmentAspects[Number(aspIdx)] && (themeItem.learningOutcomes[Number(loIdx)].assessmentAspects[Number(aspIdx)].aspectName || themeItem.learningOutcomes[Number(loIdx)].assessmentAspects[Number(aspIdx)].name)) || '';
      let toolNameLocal = (typeof tool === 'string') ? (tool || '').trim() : (tool && (tool.toolName || tool.name)) || '';
      // Prefer globalToolsList label for hidden-aspect subjects (non-Nepali) when available
      try {
        if ((!toolNameLocal || toolNameLocal === '') && Array.isArray(window.globalToolsList) && window.globalToolsList[Number(toolIdx)]) {
          const g = window.globalToolsList[Number(toolIdx)];
          const glabel = (typeof g === 'string') ? g.trim() : (g && (g.toolName || g.name));
          if (glabel) {
            toolNameLocal = glabel;
          }
        }
      } catch(e) { /* ignore */ }
      console.log('Resolved toolNameLocal for quick indicators:', { toolIdx, toolNameLocal });

      // Create a unique id for this tool's quick groups
      const toolUnique = `${themeName}_${loIdx}_${aspIdx}_${toolIdx}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const savedSelection = getSavedThemeSelectionContext(themeName, loIdx, aspIdx, toolIdx);
      const savedTool = savedSelection && savedSelection.toolObj ? savedSelection.toolObj : null;

      // For each indicator create a row. Dates and tool/LO/Aspect cells use rowspan = indicators.length
      indicators.forEach((ind, iIdx) => {
        const savedIndicatorStateBefore = getSavedIndicatorSelection(ind, savedTool, 'Before', iIdx);
        const savedIndicatorStateAfter = getSavedIndicatorSelection(ind, savedTool, 'After', iIdx);
        const indicatorData = savedIndicatorStateBefore.indicatorData || savedIndicatorStateAfter.indicatorData || ind;
        const tr = document.createElement('tr');

        if (iIdx === 0) {
          const tdLO = document.createElement('td');
          tdLO.rowSpan = indicators.length;
          tdLO.textContent = loName || `LO ${Number(loIdx)+1}`;
          tr.appendChild(tdLO);

          const tdAsp = document.createElement('td');
          tdAsp.rowSpan = indicators.length;
          tdAsp.textContent = aspName || `Aspect ${Number(aspIdx)+1}`;
          tr.appendChild(tdAsp);

          const tdTool = document.createElement('td');
          tdTool.rowSpan = indicators.length;
          tdTool.textContent = toolNameLocal || `Tool ${Number(toolIdx)+1}`;
          tr.appendChild(tdTool);
        }

        // Indicator name
        const tdIndicator = document.createElement('td');
        tdIndicator.textContent = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
        tr.appendChild(tdIndicator);

        // Eval Date Before (only on first row)
        if (iIdx === 0) {
          const tdEvalBefore = document.createElement('td');
          tdEvalBefore.rowSpan = indicators.length;
          const dateBefore = document.createElement('input');
          dateBefore.type = 'text';
          dateBefore.className = 'nepali-datepicker quick-eval-date-before';
          dateBefore.id = `quick_eval_before_${toolUnique}`;
          // Set name so browser includes this input in form submit (tool-level path)
          dateBefore.name = `subjects[0][themes][0][learningOutcomes][${loIdx}][assessmentAspects][${aspIdx}][tools][${toolIdx}][evaluationDateBefore]`;
          // initialize with existing tool/LO date if available
          dateBefore.value = (indicatorData && (indicatorData.evaluationDateBefore || indicatorData.evaluationDateBefore === '') ? indicatorData.evaluationDateBefore : (savedTool && (savedTool.evaluationDateBefore || '')) || (tool.evaluationDateBefore || loObj.evaluationDateBefore || '')) ;
          dateBefore.addEventListener('change', () => {
            document.getElementById('selectedEvalDateBeforeHidden').value = dateBefore.value || '';
          });
          tdEvalBefore.appendChild(dateBefore);
          tr.appendChild(tdEvalBefore);
        }

        // Marks Before: show radio per indicator but single group per tool
        const tdMarksBefore = document.createElement('td');
        const rbBeforeName = 'quickMarkBefore_' + toolUnique;
        const valBefore = ind.maxMarks || ind.indicatorsMarks || 0;
        const rbBefore = document.createElement('input');
        rbBefore.type = 'radio';
        rbBefore.name = rbBeforeName;
        rbBefore.value = valBefore;
        rbBefore.addEventListener('click', () => {
          document.getElementById('selectedIndicatorMarksBeforeHidden').value = rbBefore.value;
          document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
          document.getElementById('selectedIndicatorMaxMarksHidden').value = valBefore;
        });
        try {
  if (savedIndicatorStateBefore.matched || (typeof indicatorData.obtainedBefore !== 'undefined' && Number(indicatorData.obtainedBefore) === Number(valBefore))) {
    rbBefore.checked = true;
    document.getElementById('selectedIndicatorMarksBeforeHidden').value = rbBefore.value;
    document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
    // ...
  }
} catch (e) {}
        tdMarksBefore.appendChild(rbBefore);
        const spanBefore = document.createElement('span');
        spanBefore.style.marginLeft = '6px';
        spanBefore.textContent = String(valBefore);
        tdMarksBefore.appendChild(spanBefore);
        tr.appendChild(tdMarksBefore);

        // Eval Date After (only on first row)
        if (iIdx === 0) {
          const tdEvalAfter = document.createElement('td');
          tdEvalAfter.rowSpan = indicators.length;
          const dateAfter = document.createElement('input');
          dateAfter.type = 'text';
          dateAfter.className = 'nepali-datepicker quick-eval-date-after';
          dateAfter.id = `quick_eval_after_${toolUnique}`;
          dateAfter.name = `subjects[0][themes][0][learningOutcomes][${loIdx}][assessmentAspects][${aspIdx}][tools][${toolIdx}][evaluationDateAfter]`;
          dateAfter.value = (indicatorData && (indicatorData.evaluationDateAfter || indicatorData.evaluationDateAfter === '') ? indicatorData.evaluationDateAfter : (savedTool && (savedTool.evaluationDateAfter || '')) || (tool.evaluationDateAfter || loObj.evaluationDateAfter || ''));
          dateAfter.addEventListener('change', () => {
            document.getElementById('selectedEvalDateAfterHidden').value = dateAfter.value || '';
          });
          tdEvalAfter.appendChild(dateAfter);
          tr.appendChild(tdEvalAfter);
        }

        // Marks After
        const tdMarksAfter = document.createElement('td');
        const valAfter = ind.maxMarks || ind.indicatorsMarks || 0;
        const subjName2 = (document.getElementById('subject') && document.getElementById('subject').value || '').trim().toLowerCase();
       if (subjName2 === 'hamro serofero') {
  const cb2 = document.createElement('input');
  cb2.type = 'checkbox';
  cb2.className = 'quick-indicator-checkbox';
  cb2.dataset.indicatorName = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
  // Store indicator ID
  const indicatorIdAfter = indicatorData && (indicatorData._id || indicatorData.id) ? (indicatorData._id || indicatorData.id) : '';
  if (indicatorIdAfter) cb2.dataset.indicatorId = indicatorIdAfter;
  cb2.dataset.maxMarks = valAfter || 1;
  cb2.value = 1; // default value
  cb2.setAttribute('data-timing','After');
  cb2.addEventListener('change', updateQuickCheckboxes);
  
  // ENHANCED PRE-CHECK LOGIC FOR HAMRO SEROFERO (AFTER)
  let shouldCheckAfter = false;
  
  // 1. Check if savedIndicatorState says matched
  if (savedIndicatorStateAfter.matched) {
    shouldCheckAfter = true;
    console.log('✅ Hamro Serofero AFTER matched by savedIndicatorState');
  }
  
  // 2. Check if this indicator has saved marks in the data
  if (!shouldCheckAfter) {
    const savedMarksAfter = indicatorData.marksAfterIntervention || indicatorData.marksAfter || indicatorData.obtainedAfter || 0;
    if (Number(savedMarksAfter) > 0) {
      shouldCheckAfter = true;
      console.log('✅ Hamro Serofero AFTER matched by saved marks:', savedMarksAfter);
    }
  }
  
  // 3. Check if this indicator ID is in the tool's selectedIndicatorsAfter array
  if (!shouldCheckAfter && savedTool && indicatorIdAfter) {
    const selectedIdsAfter = savedTool.selectedIndicatorsAfter || [];
    if (selectedIdsAfter.some(id => String(id) === String(indicatorIdAfter))) {
      shouldCheckAfter = true;
      console.log('✅ Hamro Serofero AFTER matched by indicator ID in selectedIndicatorsAfter');
    }
  }
  
  // 4. Check if the tool has totalAfter that matches this indicator's max marks
  if (!shouldCheckAfter && savedTool) {
    const totalAfter = savedTool.totalAfter || savedTool.totalMarksAfterIntervention || 0;
    if (Number(totalAfter) > 0 && Number(totalAfter) === Number(valAfter)) {
      shouldCheckAfter = true;
      console.log('✅ Hamro Serofero AFTER matched by totalAfter value match');
    }
  }
  
  // 5. Check if this indicator name appears in the tool's indicators with saved data
  if (!shouldCheckAfter && savedTool && savedTool.indicators) {
    const indicatorNameAfter = indicatorData.indicatorName || indicatorData.name || '';
    const matchingIndicatorAfter = savedTool.indicators.find(ind => 
      (ind.indicatorName || ind.name) === indicatorNameAfter && 
      (Number(ind.marksAfterIntervention || ind.marksAfter || ind.obtainedAfter || 0) > 0)
    );
    if (matchingIndicatorAfter) {
      shouldCheckAfter = true;
      console.log('✅ Hamro Serofero AFTER matched by indicator name in saved tool indicators');
    }
  }
  
  // 6. Check if the indicator has marksAfterIntervention directly in the data
  if (!shouldCheckAfter && indicatorData) {
    const directMarksAfter = indicatorData.marksAfterIntervention || indicatorData.marksAfter || 0;
    if (Number(directMarksAfter) > 0) {
      shouldCheckAfter = true;
      console.log('✅ Hamro Serofero AFTER matched by direct marksAfterIntervention:', directMarksAfter);
    }
  }
  
  // Apply the check
  if (shouldCheckAfter) {
    cb2.checked = true;
    // Update hidden fields
    document.getElementById('selectedIndicatorMarksAfterHidden').value = cb2.value;
    document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
    document.getElementById('selectedIndicatorMaxMarksHidden').value = valAfter;
    if (document.getElementById('selectedIndicatorIdsAfterHidden')) {
      document.getElementById('selectedIndicatorIdsAfterHidden').value = cb2.dataset.indicatorId || '';
    }
  }
  
  tdMarksAfter.appendChild(cb2);
  const spanAfter = document.createElement('span');
  spanAfter.style.marginLeft = '6px';
  spanAfter.textContent = String(cb2.value);
  tdMarksAfter.appendChild(spanAfter);
}
        
        else {
          const rbAfterName = 'quickMarkAfter_' + toolUnique;
          const rbAfter = document.createElement('input');
          rbAfter.type = 'radio';
          rbAfter.name = rbAfterName;
          rbAfter.value = valAfter;
          rbAfter.addEventListener('click', () => {
            document.getElementById('selectedIndicatorMarksAfterHidden').value = rbAfter.value;
            document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
            document.getElementById('selectedIndicatorMaxMarksHidden').value = valAfter;
          });
          try {
  if (savedIndicatorStateAfter.matched || (typeof indicatorData.obtainedAfter !== 'undefined' && Number(indicatorData.obtainedAfter) === Number(valAfter))) {
    rbAfter.checked = true;
    document.getElementById('selectedIndicatorMarksAfterHidden').value = rbAfter.value;
    document.getElementById('selectedIndicatorHidden').value = indicatorData.indicatorName || indicatorData.name || ('Indicator ' + (iIdx+1));
    // ...
  }
}  catch (e) {}
          tdMarksAfter.appendChild(rbAfter);
          const spanAfter = document.createElement('span');
          spanAfter.style.marginLeft = '6px';
          spanAfter.textContent = String(valAfter);
          tdMarksAfter.appendChild(spanAfter);
        }
        tr.appendChild(tdMarksAfter);

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      indicatorsDiv.innerHTML = '';
      indicatorsDiv.appendChild(table);
      // Initialize nepali datepickers for dynamically added inputs if plugin present
      try {
        const newDateInputs = indicatorsDiv.querySelectorAll('.nepali-datepicker:not([data-initialized])');
        newDateInputs.forEach(inp => {
          if (typeof inp.nepaliDatePicker === 'function') {
            try { inp.nepaliDatePicker(); inp.setAttribute('data-initialized', 'true'); } catch(e){ console.warn('nepaliDatePicker init failed', e); }
          }
        });
      } catch(e) { console.warn('Error initializing nepali datepickers', e); }
      // Initialize hidden fields from newly rendered inputs and checkbox states
            try {
        try { updateQuickCheckboxes(); } catch(e) { /* ignore */ }
        const db = indicatorsDiv.querySelector('.quick-eval-date-before');
        const da = indicatorsDiv.querySelector('.quick-eval-date-after');
        if (db && document.getElementById('selectedEvalDateBeforeHidden')) document.getElementById('selectedEvalDateBeforeHidden').value = db.value || '';
        if (da && document.getElementById('selectedEvalDateAfterHidden')) document.getElementById('selectedEvalDateAfterHidden').value = da.value || '';
      } catch(e) { console.warn('Error initializing quick hidden fields', e); }
      
      // ===== FORCE RADIO SELECTION FOR FALLBACK (NEPALI) =====
      setTimeout(function() {
        try {
          console.log('🔍 Running force selection for fallback path');
          const radios = document.querySelectorAll('#quickIndicators input[type="radio"]');
          let selectedBefore = false;
          let selectedAfter = false;
          
          radios.forEach(function(radio) {
            if (!radio.name) return;
            const val = parseFloat(radio.value);
            
            if (radio.name.startsWith('quickMarkBefore_')) {
              const totalBefore = savedTool ? (savedTool.totalBefore || savedTool.totalMarksBeforeIntervention || 0) : 0;
              if (val === totalBefore && totalBefore > 0) {
                radio.checked = true;
                selectedBefore = true;
                document.getElementById('selectedIndicatorMarksBeforeHidden').value = radio.value;
                document.getElementById('selectedIndicatorHidden').value = radio.dataset.indicatorName || '';
                document.getElementById('selectedIndicatorMaxMarksHidden').value = radio.value;
                if (document.getElementById('selectedIndicatorIdsBeforeHidden')) {
                  document.getElementById('selectedIndicatorIdsBeforeHidden').value = radio.dataset.indicatorId || '';
                }
                console.log('✅ Fallback - Force selected BEFORE radio:', { value: radio.value, name: radio.dataset.indicatorName });
              }
            } else if (radio.name.startsWith('quickMarkAfter_')) {
              const totalAfter = savedTool ? (savedTool.totalAfter || savedTool.totalMarksAfterIntervention || 0) : 0;
              if (val === totalAfter && totalAfter > 0) {
                radio.checked = true;
                selectedAfter = true;
                document.getElementById('selectedIndicatorMarksAfterHidden').value = radio.value;
                document.getElementById('selectedIndicatorHidden').value = radio.dataset.indicatorName || '';
                document.getElementById('selectedIndicatorMaxMarksHidden').value = radio.value;
                if (document.getElementById('selectedIndicatorIdsAfterHidden')) {
                  document.getElementById('selectedIndicatorIdsAfterHidden').value = radio.dataset.indicatorId || '';
                }
                console.log('✅ Fallback - Force selected AFTER radio:', { value: radio.value, name: radio.dataset.indicatorName });
              }
            }
          });
          
          // Try indicator name matching
          if (!selectedBefore || !selectedAfter) {
            const rows = document.querySelectorAll('#quickIndicators table tbody tr');
            rows.forEach(function(row) {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 4) {
                const indicatorName = cells[3] ? cells[3].textContent.trim() : '';
                if (savedTool && savedTool.indicators) {
                  const savedIndicator = savedTool.indicators.find(ind => 
                    (ind.indicatorName || ind.name) === indicatorName
                  );
                  if (savedIndicator) {
                    const beforeRadio = row.querySelector('input[name^="quickMarkBefore_"]');
                    const afterRadio = row.querySelector('input[name^="quickMarkAfter_"]');
                    
                    const beforeMarks = savedIndicator.marksBeforeIntervention || savedIndicator.marksBefore || savedIndicator.obtainedBefore || 0;
                    const afterMarks = savedIndicator.marksAfterIntervention || savedIndicator.marksAfter || savedIndicator.obtainedAfter || 0;
                    
                    if (beforeRadio && beforeMarks > 0 && !selectedBefore) {
                      beforeRadio.checked = true;
                      selectedBefore = true;
                      document.getElementById('selectedIndicatorMarksBeforeHidden').value = beforeRadio.value;
                      document.getElementById('selectedIndicatorHidden').value = indicatorName;
                      document.getElementById('selectedIndicatorMaxMarksHidden').value = beforeRadio.value;
                      if (document.getElementById('selectedIndicatorIdsBeforeHidden')) {
                        document.getElementById('selectedIndicatorIdsBeforeHidden').value = beforeRadio.dataset.indicatorId || '';
                      }
                      console.log('✅ Fallback - Selected BEFORE radio by indicator name:', indicatorName);
                    }
                    if (afterRadio && afterMarks > 0 && !selectedAfter) {
                      afterRadio.checked = true;
                      selectedAfter = true;
                      document.getElementById('selectedIndicatorMarksAfterHidden').value = afterRadio.value;
                      document.getElementById('selectedIndicatorHidden').value = indicatorName;
                      document.getElementById('selectedIndicatorMaxMarksHidden').value = afterRadio.value;
                      if (document.getElementById('selectedIndicatorIdsAfterHidden')) {
                        document.getElementById('selectedIndicatorIdsAfterHidden').value = afterRadio.dataset.indicatorId || '';
                      }
                      console.log('✅ Fallback - Selected AFTER radio by indicator name:', indicatorName);
                    }
                  }
                }
              }
            });
          }
          
          updateQuickCheckboxes();
          console.log('✅ Fallback force selection complete - Before:', selectedBefore, 'After:', selectedAfter);
        } catch(e) {
          console.warn('Fallback force selection failed:', e);
        }
      }, 300);
      
      // persist current selection (LO/Aspect/Tool)
      try { saveQuickSelection(); } catch(e){ console.warn('saveQuickSelection failed', e); }
    }
   function saveSelectedIndicator() {
  const theme = document.getElementById('themeName').value;
  if (!theme) { alert('Select theme first'); return; }
  const loIdx = document.getElementById('quickLO').value;
  const aspSelect = document.getElementById('quickAspect');
  const aspIdx = document.getElementById('quickAspect').value;
  const toolIdx = document.getElementById('quickTool').value;
  // Accept selection from our hidden quick fields (set by radios) as well
  const selectedIndicatorName = document.getElementById('selectedIndicatorHidden').value;
  const aspectHidden = (aspSelect && (aspSelect.style.display === 'none' || aspSelect.hidden || aspSelect.options.length <= 1));
  if (!loIdx || !toolIdx || !selectedIndicatorName) {
    alert('Select LO, tool and one indicator');
    return;
  }

  // set hidden fields (ensure LO/Aspect/Tool names are set)
  const quickLO = document.getElementById('quickLO');
  const quickAsp = document.getElementById('quickAspect');
  const quickTool = document.getElementById('quickTool');
  const quickLOText = (quickLO && quickLO.options[quickLO.selectedIndex] ? quickLO.options[quickLO.selectedIndex].text : '') || '';
  const quickAspText = (quickAsp && quickAsp.options[quickAsp.selectedIndex] ? quickAsp.options[quickAsp.selectedIndex].text : '') || '';
  const quickToolText = (quickTool && quickTool.options[quickTool.selectedIndex] ? quickTool.options[quickTool.selectedIndex].text : '') || '';
  const subjName = (document.getElementById('subject') && document.getElementById('subject').value || '').trim().toLowerCase();

  document.getElementById('selectedThemeNameHidden').value = theme;
  document.getElementById('selectedLOHidden').value = quickLOText;
  document.getElementById('selectedAspectHidden').value = quickAspText;
  const selectedToolHidden = document.getElementById('selectedToolHidden');
  if (selectedToolHidden) {
    selectedToolHidden.value = quickToolText || selectedToolHidden.value;
  }
  if (!quickToolText) {
    const gtool = (Array.isArray(window.globalToolsList) && window.globalToolsList[Number(toolIdx)]) ? window.globalToolsList[Number(toolIdx)] : null;
    if (selectedToolHidden) {
      selectedToolHidden.value = (typeof gtool === 'string') ? gtool : (gtool && (gtool.toolName || gtool.name)) || selectedToolHidden.value;
    }
  }
  if (subjName !== 'english') {
    if (aspSelect && aspSelect._aspectContainerAspects && Array.isArray(aspSelect._aspectContainerAspects) && aspSelect._aspectContainerAspects.length) {
      const acAsp = aspSelect._aspectContainerAspects[Number(aspSelect.value)] || {};
      document.getElementById('selectedAspectHidden').value = acAsp.aspectName || acAsp.name || quickAspText;
      const acTool = (acAsp.tools && acAsp.tools[Number(document.getElementById('quickTool').value)]) || {};
      if (selectedToolHidden) selectedToolHidden.value = acTool.toolName || acTool.name || quickToolText || selectedToolHidden.value;
    } else {
      const themeItem = (Array.isArray(themeData) ? themeData.flatMap(td => td.themes).find(t => t.themeName === theme) : null) || null;
      const loArray = themeItem ? (Array.isArray(themeItem.learningOutcome) ? themeItem.learningOutcome : (Array.isArray(themeItem.learningOutcomes) ? themeItem.learningOutcomes : [])) : [];
      const lo = loArray[Number(loIdx)] || {};
      document.getElementById('selectedLOHidden').value = lo.learningOutcomeName || lo.name || quickLOText;
      const asp = (lo.assessmentAspects && lo.assessmentAspects[Number(aspIdx)]) || {};
      document.getElementById('selectedAspectHidden').value = asp.aspectName || asp.name || quickAspText;
      const tool = (asp.tools && asp.tools[Number(toolIdx)]) || {};
      if (selectedToolHidden) selectedToolHidden.value = tool.toolName || tool.name || quickToolText || selectedToolHidden.value;
    }
  }
  if (aspectHidden) {
    document.getElementById('selectedAspectHidden').value = '';
    const gtool = (Array.isArray(window.globalToolsList) && window.globalToolsList[Number(toolIdx)]) ? window.globalToolsList[Number(toolIdx)] : null;
    if (selectedToolHidden) selectedToolHidden.value = (typeof gtool === 'string') ? gtool : (gtool && (gtool.toolName || gtool.name)) || selectedToolHidden.value;
  }

  const evalBeforeInput = document.querySelector('.quick-eval-date-before');
  const evalAfterInput = document.querySelector('.quick-eval-date-after');
  const selDateBefore = evalBeforeInput ? evalBeforeInput.value : document.getElementById('selectedEvalDateBeforeHidden').value;
  const selDateAfter = evalAfterInput ? evalAfterInput.value : document.getElementById('selectedEvalDateAfterHidden').value;
  const selMax = document.getElementById('selectedIndicatorMaxMarksHidden').value;
  const selMarksBefore = document.getElementById('selectedIndicatorMarksBeforeHidden').value;
  const selMarksAfter = document.getElementById('selectedIndicatorMarksAfterHidden').value;

  if (selMax) document.getElementById('selectedIndicatorMaxMarksHidden').value = selMax;
  if (selMarksBefore) document.getElementById('selectedIndicatorMarksBeforeHidden').value = selMarksBefore;
  if (selMarksAfter) document.getElementById('selectedIndicatorMarksAfterHidden').value = selMarksAfter;
  if (evalBeforeInput) document.getElementById('selectedEvalDateBeforeHidden').value = selDateBefore || '';
  if (evalAfterInput) document.getElementById('selectedEvalDateAfterHidden').value = selDateAfter || '';

  // Set roll/name/class/section hidden fields via syncHiddenFields
  syncHiddenFields();

  // Submit the form (this will use themeformSave to persist for the student)
  // Inject nested hidden inputs for selected indicator ids so server receives arrays
  try {
    const form = document.getElementById('themeEvaluationForm');
    
    // ★★★ FIXED: Include aspIdx and toolIdx in the path ★★★
    const nameBefore = `subjects[0][themes][0][learningOutcomes][${loIdx}][assessmentAspects][${aspIdx}][tools][${toolIdx}][selectedIndicatorsBefore][]`;
    const nameAfter = `subjects[0][themes][0][learningOutcomes][${loIdx}][assessmentAspects][${aspIdx}][tools][${toolIdx}][selectedIndicatorsAfter][]`;
    Array.from(form.querySelectorAll(`input[name="${nameBefore}"]`)).forEach(n=>n.remove());
    Array.from(form.querySelectorAll(`input[name="${nameAfter}"]`)).forEach(n=>n.remove());
    const gatherSelectedIndicatorIds = (timing) => {
      const ids = new Set();
      const selector = `input[name^="quickMark${timing}_"]:checked, .quick-indicator-checkbox[data-timing="${timing}"]:checked`;
      Array.from(form.querySelectorAll(selector)).forEach(el => {
        if (el.dataset.indicatorId) ids.add(el.dataset.indicatorId);
      });
      return ids;
    };
    const idsBeforeStr = (document.getElementById('selectedIndicatorIdsBeforeHidden')||{value:''}).value || '';
    const idsAfterStr = (document.getElementById('selectedIndicatorIdsAfterHidden')||{value:''}).value || '';
    const idsBefore = Array.from(new Set([
      ...idsBeforeStr.split(',').map(s=>s.trim()).filter(Boolean),
      ...Array.from(gatherSelectedIndicatorIds('Before'))
    ]));
    const idsAfter = Array.from(new Set([
      ...idsAfterStr.split(',').map(s=>s.trim()).filter(Boolean),
      ...Array.from(gatherSelectedIndicatorIds('After'))
    ]));
    idsBefore.forEach(id => {
      const inp = document.createElement('input'); inp.type='hidden'; inp.name = nameBefore; inp.value = id; form.appendChild(inp);
    });
    idsAfter.forEach(id => {
      const inp = document.createElement('input'); inp.type='hidden'; inp.name = nameAfter; inp.value = id; form.appendChild(inp);
    });
    
    // ★★★ FIX FOR ENGLISH: Add keepAspectIndex to tell server which aspect to keep ★★★
    const subjName2 = (document.getElementById('subject') && document.getElementById('subject').value || '').trim().toLowerCase();
    if (subjName2 === 'english' && aspIdx !== undefined && aspIdx !== '') {
      let aspectToKeep = form.querySelector('input[name="keepAspectIndex"]');
      if (!aspectToKeep) {
        aspectToKeep = document.createElement('input');
        aspectToKeep.type = 'hidden';
        aspectToKeep.name = 'keepAspectIndex';
        form.appendChild(aspectToKeep);
      }
      aspectToKeep.value = aspIdx;
      console.log('✅ Save: Added keepAspectIndex with value:', aspIdx);
    }
    
  } catch(e) { console.warn('Could not inject selectedIndicators inputs', e); }

  document.getElementById('themeEvaluationForm').submit();
}
    function clearQuickSelection() {
      document.getElementById('quickLO').selectedIndex = 0;
      document.getElementById('quickAspect').innerHTML = '<option value="" selected disabled>Select Aspect</option>';
      document.getElementById('quickTool').innerHTML = '<option value="" selected disabled>Select Tool</option>';
      document.getElementById('quickIndicators').innerHTML = '';
      document.getElementById('selectedIndicatorHidden').value = '';
      document.getElementById('selectedIndicatorMaxMarksHidden').value = 0;
      document.getElementById('selectedIndicatorMarksBeforeHidden').value = 0;
      document.getElementById('selectedIndicatorMarksAfterHidden').value = 0;
      document.getElementById('selectedEvalDateBeforeHidden').value = '';
      document.getElementById('selectedEvalDateAfterHidden').value = '';
      // remove stored quick selection for this theme
      try{
        const themeName = document.getElementById('themeName').value || '';
        if(themeName){ localStorage.removeItem(getQuickSelectionKey(themeName)); }
      }catch(e){ console.warn('clear quick selection failed', e); }
    }
    
    // New function to update field names for the selected theme
    function updateFieldNamesForSelectedTheme(selectedWrapper) {
      console.log('Updating field names for selected theme wrapper');
      
      // Update all form fields within the selected wrapper to use index [0]
      const allInputs = selectedWrapper.querySelectorAll('input, select, textarea');
      
      allInputs.forEach(input => {
        if (input.name && input.name.includes('[themes][')) {
          // Replace any [themes][X] with [themes][0] to ensure consistency
          const originalName = input.name;
          const updatedName = input.name.replace(/\[themes\]\[\d+\]/, '[themes][0]');
          
          if (originalName !== updatedName) {
            console.log(`Updated field name: ${originalName} -> ${updatedName}`);
            input.name = updatedName;
          }
        }
      });
      
      // Also update the theme name field to use index [0]
      const themeNameSelect = document.getElementById('themeName');
      if (themeNameSelect) {
        themeNameSelect.name = 'subjects[0][themes][0][themeName]';
      }
    }

    
    
    function updateMarks(input, outcomeIndex, indicatorIndex, timing, themeIndex) {
      // Ensure the input value is valid
      let value = parseFloat(input.value) || 0;
      const maxMarks = parseFloat(input.dataset.maxMarks) || 0;
      
      // Cap the value at the maximum marks
      if (value > maxMarks) {
        value = maxMarks;
        input.value = maxMarks;
      }
      
      // Ensure value is not negative
      if (value < 0) {
        value = 0;
        input.value = 0;
      }
      
      console.log('Input value changed:', {
        value: value,
        maxMarks: maxMarks,
        timing: timing,
        outcomeIndex: outcomeIndex,
        indicatorIndex: indicatorIndex,
        themeIndex: themeIndex
      });
      
      // Set the appropriate field name based on timing (Before or After intervention)
      // Use the provided themeIndex parameter
      const fieldName = timing === 'Before' ? 
        `subjects[0][themes][${themeIndex}][learningOutcomes][${outcomeIndex}][indicators][${indicatorIndex}][marksBeforeIntervention]` :
        `subjects[0][themes][${themeIndex}][learningOutcomes][${outcomeIndex}][indicators][${indicatorIndex}][marksAfterIntervention]`;

      // Get the hidden input field - try multiple approaches to find it
      let inputField = null;
      
      // Look for hidden field with matching name pattern in the same cell
      const cell = input.closest('td');
      if (cell) {
        inputField = cell.querySelector(`input[type="hidden"][name$="[marks${timing}Intervention]"]`);
      }
      
      // If not found, try to find by the exact field name in the entire document
      if (!inputField) {
        inputField = document.querySelector(`input[type="hidden"][name="${fieldName}"]`);
      }
      
      // Set the value based on input value
      if (inputField) {
        inputField.value = value;
        console.log('Updated hidden field:', { fieldName, value });
      } else {
        console.warn('Could not find hidden input field for', fieldName);
      }
      
      // Update total for this learning outcome
      updateLearningOutcomeTotal(outcomeIndex, timing, themeIndex);
      
      // Update overall theme totals
      calculateOverallTotals();
      
      // Trigger autosave after marks are updated
      scheduleAutoSave();
    }
    
    // Increment value function for + buttons
    function incrementValue(button, outcomeIndex, indicatorIndex, timing, themeIndex = 0) {
      // Get the input element (sibling of the button)
      const inputElement = button.previousElementSibling;
      if (!inputElement || !inputElement.classList.contains('marks-input')) return;
      
      // Get current and max values
      let currentValue = parseFloat(inputElement.value) || 0;
      const maxMarks = parseFloat(inputElement.dataset.maxMarks) || 0;
      
      // Increment by 1, but don't exceed max marks
      if (currentValue < maxMarks) {
        currentValue += 1;
        inputElement.value = currentValue;
        
        // Update marks using the existing function with themeIndex
        updateMarks(inputElement, outcomeIndex, indicatorIndex, timing, themeIndex);
      }
    }
    
    // Decrement value function for - buttons
    function decrementValue(button, outcomeIndex, indicatorIndex, timing, themeIndex = 0) {
      // Get the input element (sibling of the button)
      const inputElement = button.nextElementSibling;
      if (!inputElement || !inputElement.classList.contains('marks-input')) return;
      
      // Get current value
      let currentValue = parseFloat(inputElement.value) || 0;
      
      // Decrement by 1, but not below zero
      if (currentValue > 0) {
        currentValue -= 1;
        inputElement.value = currentValue;
        
        // Update marks using the existing function with themeIndex
        updateMarks(inputElement, outcomeIndex, indicatorIndex, timing, themeIndex);
      }
    }
    
    function updateLearningOutcomeTotal(outcomeIndex, timing, themeIndex = 0) {
      // Build the IDs using the provided theme index
      const totalId = timing === 'Before' ? `totalBefore_${themeIndex}_${outcomeIndex}` : `totalAfter_${themeIndex}_${outcomeIndex}`;
      const inputSelector = timing === 'Before' ? '.indicator-before' : '.indicator-after';
      
      // Get the total field - if it doesn't exist, just skip (some outcomes may not have totals)
      const totalField = document.getElementById(totalId);
      if (!totalField) {
        console.log(`Total field not needed: ${totalId}`);
        return;
      }
      
      // Find the wrapper that contains this total field
      const wrapper = totalField.closest('.learning-outcome-wrapper');
      if (!wrapper) {
        console.warn(`Learning outcome wrapper not found for total field: ${totalId}`);
        return;
      }
      
      // Find the table in this wrapper
      const table = wrapper.querySelector('table');
      if (!table) {
        console.warn(`Table not found in wrapper`);
        return;
      }
      
      // Get all inputs with the current timing and sum them
      const allInputsForTiming = table.querySelectorAll(inputSelector);
      
      let total = 0;
      allInputsForTiming.forEach(input => {
        total += parseFloat(input.value) || 0;
      });
      
      // Update the total field
      totalField.value = total;
      
      // Update the display element if it exists
      const displayId = `outcome${timing}Display_${themeIndex}_${outcomeIndex}`;
      const displayElement = document.getElementById(displayId);
      if (displayElement) {
        displayElement.textContent = total;
      }
      
      console.log(`Updated ${timing} total for outcome ${outcomeIndex}: ${total}`);
    }
    
    function calculateOverallTotals(studentIndex = null) {
      // Only calculate for visible learning outcome wrapper (the currently selected theme)
      const activeWrapperSelector = studentIndex !== null 
        ? `.learning-outcome-wrapper[data-student-index="${studentIndex}"][style*="display: block"], .learning-outcome-wrapper[data-student-index="${studentIndex}"][style*="display:block"]`
        : '.learning-outcome-wrapper[style*="display: block"], .learning-outcome-wrapper[style*="display:block"]';
      
      const activeWrapper = document.querySelector(activeWrapperSelector);
      if (!activeWrapper) return;
      
      const themeIndex = activeWrapper.dataset.themeIndex;
      const studentSuffix = studentIndex !== null ? `-student-${studentIndex}` : '';
      
      let overallBefore = 0;
      let overallAfter = 0;
      let totalMaxMarks = 0;
      
      // Sum up all learning outcome totals for the active theme
      // Get all before and after total inputs in the active wrapper
      const beforeTotals = activeWrapper.querySelectorAll('input[id^="totalBefore_"]');
      const afterTotals = activeWrapper.querySelectorAll('input[id^="totalAfter_"]');
      
      beforeTotals.forEach(input => {
        overallBefore += parseFloat(input.value) || 0;
      });
      
      afterTotals.forEach(input => {
        overallAfter += parseFloat(input.value) || 0;
      });
      
      // Count total learning outcomes
      const totalOutcomes = beforeTotals.length;
      
      // Calculate total max marks
      const allMaxMarksInputs = activeWrapper.querySelectorAll('input[name$="[maxMarks]"]');
      allMaxMarksInputs.forEach(input => {
        totalMaxMarks += parseFloat(input.value) || 0;
      });
      
      // Update the overall total fields
      const overallBeforeId = `overallTotalBefore_${themeIndex}${studentSuffix}`;
      const overallAfterId = `overallTotalAfter_${themeIndex}${studentSuffix}`;
      const totalOutcomesId = `totalOutcomes_${themeIndex}${studentSuffix}`;
      const totalMaxMarksId = `totalMaxMarks_${themeIndex}${studentSuffix}`;
      
      const overallBeforeField = document.getElementById(overallBeforeId);
      const overallAfterField = document.getElementById(overallAfterId);
      const totalOutcomesElement = document.getElementById(totalOutcomesId);
      const totalMaxMarksElement = document.getElementById(totalMaxMarksId);
      
      // Check if values have changed before updating
      let valuesChanged = false;
      
      if (overallBeforeField && parseFloat(overallBeforeField.value) !== overallBefore) {
        overallBeforeField.value = overallBefore;
        valuesChanged = true;
      }
      
      if (overallAfterField && parseFloat(overallAfterField.value) !== overallAfter) {
        overallAfterField.value = overallAfter;
        valuesChanged = true;
      }
      
      if (totalOutcomesElement) totalOutcomesElement.textContent = totalOutcomes;
      if (totalMaxMarksElement) totalMaxMarksElement.textContent = totalMaxMarks;
    }

    // ===== AUTO-SAVE FUNCTIONALITY =====
    let autoSaveTimeout;
    let isSaving = false;

    // Show save status indicator
    function showSaveStatus(message, type = 'info') {
      const existingStatus = document.querySelector('.auto-save-status');
      if (existingStatus) {
        existingStatus.remove();
      }

      const status = document.createElement('div');
      status.className = 'auto-save-status';
      status.textContent = message;
      status.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 14px;
        z-index: 9999;
        transition: all 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        ${type === 'success' ? 'background-color: #4CAF50; color: white;' : ''}
        ${type === 'error' ? 'background-color: #f44336; color: white;' : ''}
        ${type === 'saving' ? 'background-color: #2196F3; color: white;' : ''}
      `;

      document.body.appendChild(status);

      if (type === 'success') {
        setTimeout(() => {
          if (status.parentNode) {
            status.style.opacity = '0';
            setTimeout(() => status.remove(), 300);
          }
        }, 2000);
      }
    }

    // Collect current form data
    function collectFormData() {
      const form = document.getElementById('themeEvaluationForm');
      updateQuickCheckboxes();
      const formData = new FormData(form);
      const data = {};

      for (let [key, value] of formData.entries()) {
        data[key] = value;
      }

      return data;
    }

    // Auto-save function
    async function performAutoSave() {
  if (isSaving) return;

  // Sync hidden fields from display fields before collecting data
  syncHiddenFields();
  
  const roll = document.getElementById('rollHidden').value.trim();
  const name = document.getElementById('nameHidden').value.trim();
  let themeName = document.getElementById('themeNameHidden').value.trim();
  
  // Require roll, name and theme selection
  if (!roll || !name) {
    console.log('Auto-save skipped: roll or name not entered');
    return;
  }
  
  // If theme not explicitly selected, try to detect from visible wrapper
  if (!themeName) {
    const visibleWrapper = document.querySelector('.learning-outcome-wrapper[style*="display: block"], .learning-outcome-wrapper[style*="display:block"]');
    if (visibleWrapper) {
      themeName = visibleWrapper.dataset.theme;
      if (themeName) {
        document.getElementById('themeNameHidden').value = themeName;
      }
    }
  }
  
  // Must have a theme selected or visible
  if (!themeName) {
    console.log('Auto-save skipped: no theme selected');
    return;
  }

  isSaving = true;
  showSaveStatus('Saving...', 'saving');
  let disabledFields = [];

  try {
    const form = document.getElementById('themeEvaluationForm');

    // Mirror submit preprocessing: update field names for selected theme
    const selectedWrapper = document.querySelector('.learning-outcome-wrapper[style*="display: block"], .learning-outcome-wrapper[style*="display:block"]');
    if (selectedWrapper) {
      try {
        updateFieldNamesForSelectedTheme(selectedWrapper);
      } catch (e) {
        console.warn('updateFieldNamesForSelectedTheme failed in autosave', e);
      }

      // Disable fields from non-selected wrappers so they're not submitted
      const allWrappers = document.querySelectorAll('.learning-outcome-wrapper');
      allWrappers.forEach(wrapper => {
        const isVisible = wrapper === selectedWrapper || wrapper.style.display === 'block' || wrapper.style.display === '' && wrapper.dataset.theme === themeName;
        if (!isVisible) {
          const fields = wrapper.querySelectorAll('input, select, textarea');
          fields.forEach(field => {
            if (!field.disabled) {
              field.disabled = true;
              disabledFields.push(field);
            }
          });
        }
      });
    }
    
    updateQuickCheckboxes();
    
    const loIdx = document.getElementById('quickLO').value;
    const aspIdx = document.getElementById('quickAspect').value;
    const toolIdx = document.getElementById('quickTool').value;
    const subjName = (document.getElementById('subject') && document.getElementById('subject').value || '').trim().toLowerCase();
    
    if (loIdx) {
        // ★★★ FIXED: Include aspIdx and toolIdx in the path ★★★
        const nameBefore = `subjects[0][themes][0][learningOutcomes][${loIdx}][assessmentAspects][${aspIdx}][tools][${toolIdx}][selectedIndicatorsBefore][]`;
        const nameAfter = `subjects[0][themes][0][learningOutcomes][${loIdx}][assessmentAspects][${aspIdx}][tools][${toolIdx}][selectedIndicatorsAfter][]`;
        Array.from(form.querySelectorAll(`input[name="${nameBefore}"]`)).forEach(n => n.remove());
        Array.from(form.querySelectorAll(`input[name="${nameAfter}"]`)).forEach(n => n.remove());
        
        // Get the IDs from hidden fields
        
    
    const toolSelect = document.getElementById('quickTool');
    const selectedToolName = toolSelect ? toolSelect.options[toolSelect.selectedIndex]?.text || '' : '';
    if (selectedToolName) {
        // Find the toolName hidden input and set its value
        const toolNameInput = document.querySelector('input[name="subjects[0][themes][0][learningOutcomes][0][assessmentAspects][0][tools][0][toolName]"]');
        if (toolNameInput) {
            toolNameInput.value = selectedToolName;
            console.log('✅ Set toolName to:', selectedToolName);
        } else {
            // If the hidden input doesn't exist, create it
            const inp = document.createElement('input');
            inp.type = 'hidden';
            inp.name = 'subjects[0][themes][0][learningOutcomes][0][assessmentAspects][0][tools][0][toolName]';
            inp.value = selectedToolName;
            form.appendChild(inp);
            console.log('✅ Created toolName input with value:', selectedToolName);
        }
    }
    
    // ★★★ FIX FOR ENGLISH: Add keepAspectIndex to tell server which aspect to keep ★★★
    if (subjName === 'english' && aspIdx !== undefined && aspIdx !== '') {
      let aspectToKeep = form.querySelector('input[name="keepAspectIndex"]');
      if (!aspectToKeep) {
        aspectToKeep = document.createElement('input');
        aspectToKeep.type = 'hidden';
        aspectToKeep.name = 'keepAspectIndex';
        form.appendChild(aspectToKeep);
      }
      aspectToKeep.value = aspIdx;
      console.log('✅ Auto-save: Added keepAspectIndex with value:', aspIdx);
    }
    
    const formData = new FormData(form);

    // Ensure all required fields are in formData
    formData.set('roll', roll);
    formData.set('name', name);
    formData.set('studentClass', document.getElementById('studentClassHidden').value);
    formData.set('section', document.getElementById('sectionHidden').value);
    formData.set('subject', document.getElementById('subjectHidden').value);
    formData.set('themeName', themeName);

    // Add indicator to backend this is auto-save
    formData.set('autosave', 'true');

    // Convert FormData to URL-encoded string so Express urlencoded parser handles nested fields
    const urlEncoded = new URLSearchParams();
    for (const pair of formData.entries()) {
      urlEncoded.append(pair[0], pair[1]);
    }

    console.log('Auto-save sending data with:', {
      roll: roll,
      name: name,
      studentClass: document.getElementById('studentClassHidden').value,
      section: document.getElementById('sectionHidden').value,
      subject: document.getElementById('subjectHidden').value,
      themeName: themeName
    });

    // Debug: log full URL-encoded payload being sent to the server
    try {
      console.log('Auto-save payload (urlencoded):', urlEncoded.toString());
    } catch (e) {
      console.warn('Unable to stringify auto-save payload', e);
    }

    const response = await fetch('/themeform', {
      method: 'POST',
      body: urlEncoded.toString(),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      }
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        showSaveStatus('Saved successfully', 'success');
        console.log('Auto-saved successfully:', result);
      } else {
        showSaveStatus('Error saving data', 'error');
        console.error('Auto-save error:', result);
      }
    } else {
      showSaveStatus('Save failed', 'error');
      console.error('Auto-save HTTP error:', response.status, response.statusText);
    }
  } catch (error) {
    showSaveStatus('Save failed', 'error');
    console.error('Auto-save exception:', error);
  } finally {
    // Re-enable any fields we disabled for autosave
    try {
      if (disabledFields && disabledFields.length) {
        disabledFields.forEach(field => field.disabled = false);
      }
    } catch (e) {
      console.warn('Error re-enabling fields after autosave', e);
    }

    isSaving = false;
  }
}
    // Schedule auto-save with debounce
    function scheduleAutoSave() {
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }
      autoSaveTimeout = setTimeout(() => {
        performAutoSave();
      }, 2000); // Save after 2 seconds of inactivity
    }

    // Attach auto-save event listeners
   function attachAutoSaveListeners() {
  // Add listeners to all mark inputs
  document.querySelectorAll('.marks-input').forEach(input => {
    input.addEventListener('change', scheduleAutoSave);
    input.addEventListener('input', scheduleAutoSave);
  });

  // Add listeners to all date pickers
  document.querySelectorAll('.nepali-datepicker').forEach(input => {
    input.addEventListener('change', scheduleAutoSave);
    input.addEventListener('input', scheduleAutoSave);
    input.addEventListener('blur', scheduleAutoSave);
  });

  // Add listeners to tools selects populated from tools collection (include quickTool)
  document.querySelectorAll('select.tools-dropdown, select#quickTool').forEach(select => {
    select.addEventListener('change', scheduleAutoSave);
  });

  // ★★★ ADD LISTENERS TO RADIO BUTTONS ★★★
  document.querySelectorAll('#quickIndicators input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', scheduleAutoSave);
    radio.addEventListener('click', scheduleAutoSave);
  });

  // ★★★ ADD LISTENERS TO CHECKBOXES (Hamro Serofero) ★★★
  document.querySelectorAll('.quick-indicator-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', scheduleAutoSave);
  });

  // Also add listeners to roll and name fields
  document.getElementById('roll').addEventListener('change', scheduleAutoSave);
  document.getElementById('name').addEventListener('change', scheduleAutoSave);
  
  // ★★★ ADD LISTENER TO QUICK LO DROPDOWN ★★★
  document.getElementById('quickLO').addEventListener('change', scheduleAutoSave);
  
  // ★★★ ADD LISTENER TO QUICK ASPECT DROPDOWN ★★★
  document.getElementById('quickAspect').addEventListener('change', scheduleAutoSave);
}
function watchDatePickerChanges() {
  document.querySelectorAll('.nepali-datepicker').forEach(dateInput => {
    // Skip if already watched
    if (dateInput._dateWatcher) return;
    dateInput._dateWatcher = true;
    
    // Watch for value attribute changes
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'value') {
          console.log('📅 Date changed via MutationObserver:', dateInput.value);
          scheduleAutoSave();
        }
      });
    });
    observer.observe(dateInput, { attributes: true, attributeFilter: ['value'] });
    
    // Also listen to all possible events
    dateInput.addEventListener('change', scheduleAutoSave);
    dateInput.addEventListener('input', scheduleAutoSave);
    dateInput.addEventListener('blur', scheduleAutoSave);
    dateInput.addEventListener('datepicker-change', scheduleAutoSave);
    dateInput.addEventListener('nepali-datepicker-change', scheduleAutoSave);
    dateInput.addEventListener('click', scheduleAutoSave);
  });
}
   
    document.addEventListener('DOMContentLoaded', function() {
  // Sync hidden fields with display values on load
  syncHiddenFields();
  
  // Attach listeners to keep hidden fields in sync
  attachFieldSyncListeners();
  
  // Wait a bit for all elements to be fully loaded
  setTimeout(() => {
    attachAutoSaveListeners();
    watchDatePickerChanges(); // ★★★ ADD THIS LINE ★★★
    console.log('Auto-save listeners attached');
  }, 500);
});
    
    function syncHiddenFields() {
      // Sync all hidden fields with their display values
      document.getElementById('rollHidden').value = document.getElementById('roll').value;
      document.getElementById('nameHidden').value = document.getElementById('name').value;
      document.getElementById('studentClassHidden').value = document.getElementById('studentClass').value;
      document.getElementById('sectionHidden').value = document.getElementById('section').value;
      document.getElementById('subjectHidden').value = document.getElementById('subject').value;
      // Also sync the subjects[0][name] hidden field expected by the server
      const subjectsNameInput = document.getElementById('subjects0nameHidden');
      if (subjectsNameInput) subjectsNameInput.value = document.getElementById('subject').value;
      document.getElementById('themeNameHidden').value = document.getElementById('themeName').value;
      
      console.log('Hidden fields synced:', {
        roll: document.getElementById('rollHidden').value,
        name: document.getElementById('nameHidden').value,
        studentClass: document.getElementById('studentClassHidden').value,
        section: document.getElementById('sectionHidden').value,
        subject: document.getElementById('subjectHidden').value,
        subjects0name: subjectsNameInput ? subjectsNameInput.value : undefined,
        themeName: document.getElementById('themeNameHidden').value
      });
    }
    
    // Add listeners to sync fields when changed
    function attachFieldSyncListeners() {
      const roll = document.getElementById('roll');
      const name = document.getElementById('name');
      const themeName = document.getElementById('themeName');
      
      if (roll) roll.addEventListener('input', () => { syncHiddenFields(); });
      if (name) name.addEventListener('input', () => { syncHiddenFields(); });
      if (themeName) themeName.addEventListener('change', () => { syncHiddenFields(); });
    }

    // Observe for dynamically added elements (like new date pickers)
  const autoSaveObserver = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    if (mutation.addedNodes.length) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) { // Element node
          if (node.classList) {
            // Marks inputs
            if (node.classList.contains('marks-input')) {
              node.addEventListener('change', scheduleAutoSave);
              node.addEventListener('input', scheduleAutoSave);
            }
            // Date pickers - ADD MORE EVENTS
            else if (node.classList.contains('nepali-datepicker')) {
              node.addEventListener('change', scheduleAutoSave);
              node.addEventListener('input', scheduleAutoSave);
              node.addEventListener('blur', scheduleAutoSave);
              // ★★★ ADD THIS - Some datepickers use custom events ★★★
              node.addEventListener('datepicker-change', scheduleAutoSave);
              node.addEventListener('nepali-datepicker-change', scheduleAutoSave);
              // ★★★ Also listen for DOM mutation on value change ★★★
              const observer = new MutationObserver(function() {
                scheduleAutoSave();
              });
              observer.observe(node, { attributes: true, attributeFilter: ['value'] });
            }
            // Radio buttons (when they are dynamically created)
            else if (node.type === 'radio') {
              node.addEventListener('change', scheduleAutoSave);
              node.addEventListener('click', scheduleAutoSave);
            }
            // Checkboxes (Hamro Serofero)
            else if (node.classList.contains('quick-indicator-checkbox')) {
              node.addEventListener('change', scheduleAutoSave);
            }
          }
          
          // Also check for radio buttons inside the node
          if (node.querySelectorAll) {
            node.querySelectorAll('input[type="radio"]').forEach(radio => {
              radio.addEventListener('change', scheduleAutoSave);
              radio.addEventListener('click', scheduleAutoSave);
            });
            node.querySelectorAll('.quick-indicator-checkbox').forEach(checkbox => {
              checkbox.addEventListener('change', scheduleAutoSave);
            });
            // ★★★ Also monitor date pickers inside the node ★★★
            node.querySelectorAll('.nepali-datepicker').forEach(dateInput => {
              dateInput.addEventListener('change', scheduleAutoSave);
              dateInput.addEventListener('input', scheduleAutoSave);
              dateInput.addEventListener('blur', scheduleAutoSave);
              dateInput.addEventListener('datepicker-change', scheduleAutoSave);
              dateInput.addEventListener('nepali-datepicker-change', scheduleAutoSave);
              // Monitor value changes
              const observer = new MutationObserver(function() {
                scheduleAutoSave();
              });
              observer.observe(dateInput, { attributes: true, attributeFilter: ['value'] });
            });
          }
        }
      });
    }
  });
});
