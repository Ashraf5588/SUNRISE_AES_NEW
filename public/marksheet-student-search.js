(() => {
	const sheets = Array.from(document.querySelectorAll('.sheets-container > .sheet'));
	if (!sheets.length) return;

	const getFieldValue = (sheet, labelText) => {
		const label = Array.from(sheet.querySelectorAll('.info-label'))
			.find(item => item.textContent.trim().replace(/:$/, '').toLowerCase() === labelText.toLowerCase());
		return label?.nextElementSibling?.textContent.trim() || '';
	};
	const students = sheets.map(sheet => ({
		sheet,
		name: getFieldValue(sheet, 'Student Name') || sheet.querySelector('.student-info .info-value')?.textContent.trim() || 'Student',
		roll: getFieldValue(sheet, 'Roll No')
	}));

	const style = document.createElement('style');
	style.textContent = `
		.marksheet-student-search { position:relative; z-index:5; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; align-items:center; width:min(1100px,calc(100% - 32px)); margin:12px auto; padding:12px; border:1px solid #d8e2ee; border-radius:6px; background:#fff; font:14px 'DM Sans',sans-serif; }
		.marksheet-search-field { position:relative; min-width:0; }
		.marksheet-search-field label { display:block; margin-bottom:5px; color:#46566c; font-size:12px; font-weight:700; }
		.marksheet-search-field input { width:100%; min-height:40px; padding:8px 10px; border:1px solid #ccd8e6; border-radius:4px; font:inherit; }
		.marksheet-search-field input:focus { outline:2px solid rgba(36,71,123,.22); border-color:#24477b; }
		.marksheet-search-results { position:absolute; top:100%; right:0; left:0; z-index:10; max-height:240px; overflow:auto; margin:4px 0 0; padding:4px; border:1px solid #ccd8e6; border-radius:4px; background:#fff; box-shadow:0 5px 16px rgba(20,40,70,.14); list-style:none; }
		.marksheet-search-results[hidden] { display:none; }
		.marksheet-search-results button { width:100%; padding:8px 10px; border:0; border-radius:3px; background:#fff; color:#1b2940; text-align:left; font:inherit; cursor:pointer; }
		.marksheet-search-results button:hover,.marksheet-search-results button:focus-visible { outline:0; background:#eaf1fa; }
		.marksheet-search-reset { align-self:end; min-height:40px; padding:0 12px; border:1px solid #cbd8e6; border-radius:4px; background:#f5f8fc; color:#1b2940; font:inherit; font-weight:700; cursor:pointer; }
		.marksheet-search-status { grid-column:1/-1; margin:0; color:#66758a; font-size:12px; }
		.sheet.marksheet-search-hidden { display:none !important; }
		@media(max-width:520px) { .marksheet-student-search { grid-template-columns:minmax(0,1fr); } .marksheet-search-reset { width:100%; } }
		@media print { .marksheet-student-search,.sheet.marksheet-search-hidden { display:none !important; } body.marksheet-search-single .sheet:not(.marksheet-search-hidden) { page-break-after:auto !important; break-after:auto !important; } }
	`;
	document.head.appendChild(style);

	const panel = document.createElement('section');
	panel.className = 'marksheet-student-search no-print';
	panel.setAttribute('aria-label', 'Find a student marksheet');
	panel.innerHTML = `
		<div class="marksheet-search-field">
			<label for="marksheetStudentSearch">Find student in this class and terminal</label>
			<input id="marksheetStudentSearch" type="search" autocomplete="off" placeholder="Type a student name or roll number" aria-controls="marksheetStudentResults" aria-expanded="false">
			<ul class="marksheet-search-results" id="marksheetStudentResults" role="listbox" hidden></ul>
		</div>
		<button class="marksheet-search-reset" type="button">Show all</button>
		<p class="marksheet-search-status" aria-live="polite">${students.length} student marksheet${students.length === 1 ? '' : 's'} loaded.</p>
	`;
	const controls = document.querySelector('.control-panel');
	const container = document.querySelector('.sheets-container');
	if (controls?.parentNode) controls.parentNode.insertBefore(panel, controls);
	else container.parentNode.insertBefore(panel, container);

	const input = panel.querySelector('input');
	const results = panel.querySelector('.marksheet-search-results');
	const status = panel.querySelector('.marksheet-search-status');
	let selectedStudent = null;

	const hideResults = () => {
		results.hidden = true;
		input.setAttribute('aria-expanded', 'false');
	};
	const showAll = () => {
		selectedStudent = null;
		document.body.classList.remove('marksheet-search-single');
		input.value = '';
		students.forEach(student => student.sheet.classList.remove('marksheet-search-hidden'));
		status.textContent = `${students.length} student marksheet${students.length === 1 ? '' : 's'} loaded.`;
		hideResults();
		input.focus();
	};
	const selectStudent = student => {
		selectedStudent = student;
		document.body.classList.add('marksheet-search-single');
		input.value = student.name;
		students.forEach(item => item.sheet.classList.toggle('marksheet-search-hidden', item !== student));
		status.textContent = `Showing ${student.name}${student.roll ? `, roll ${student.roll}` : ''}. Print will include this marksheet only.`;
		hideResults();
	};

	input.addEventListener('input', () => {
		selectedStudent = null;
		document.body.classList.remove('marksheet-search-single');
		const query = input.value.trim().toLocaleLowerCase();
		if (!query) {
			students.forEach(student => student.sheet.classList.remove('marksheet-search-hidden'));
			status.textContent = `${students.length} student marksheet${students.length === 1 ? '' : 's'} loaded.`;
			hideResults();
			return;
		}

		const matches = students.filter(student => `${student.name} ${student.roll}`.toLocaleLowerCase().includes(query));
		students.forEach(student => student.sheet.classList.toggle('marksheet-search-hidden', !matches.includes(student)));
		results.replaceChildren();
		matches.slice(0, 30).forEach(student => {
			const option = document.createElement('li');
			option.setAttribute('role', 'option');
			const button = document.createElement('button');
			button.type = 'button';
			button.textContent = `${student.name}${student.roll ? ` - Roll ${student.roll}` : ''}`;
			button.addEventListener('click', () => selectStudent(student));
			option.appendChild(button);
			results.appendChild(option);
		});
		results.hidden = matches.length === 0;
		input.setAttribute('aria-expanded', String(matches.length > 0));
		status.textContent = matches.length
			? `${matches.length} matching student${matches.length === 1 ? '' : 's'}. Select a result to show only that marksheet.`
			: 'No student matches this search. Use Show all to reset.';
	});

	input.addEventListener('keydown', event => {
		if (event.key === 'Escape') hideResults();
		if (event.key === 'Enter' && !results.hidden) {
			event.preventDefault();
			results.querySelector('button')?.click();
		}
	});
	panel.querySelector('.marksheet-search-reset').addEventListener('click', showAll);
	document.addEventListener('click', event => {
		if (!panel.contains(event.target)) hideResults();
	});
})();
