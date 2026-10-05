(() => {
	const form = document.getElementById('homeModuleSearch');
	const input = document.getElementById('homeModuleSearchInput');
	const results = document.getElementById('homeModuleSearchResults');
	const sidebar = document.getElementById('desktopHomeSidebar');
	if (!form || !input || !results || !sidebar) return;

	const modules = Array.from(sidebar.querySelectorAll('a[href]'))
		.filter(link => link.getAttribute('href') && link.getAttribute('href') !== '#')
		.map(link => ({
			label: link.textContent.trim().replace(/\s+/g, ' '),
			href: link.href
		}))
		.filter((module, index, all) => all.findIndex(item => item.href === module.href && item.label === module.label) === index);

	const hideResults = () => {
		results.hidden = true;
		input.setAttribute('aria-expanded', 'false');
	};

	const renderResults = () => {
		const query = input.value.trim().toLocaleLowerCase();
		results.replaceChildren();
		if (!query) return hideResults();

		const matches = modules.filter(module => module.label.toLocaleLowerCase().includes(query)).slice(0, 8);
		if (!matches.length) {
			const empty = document.createElement('p');
			empty.className = 'home-module-search-empty';
			empty.textContent = 'No matching modules';
			results.appendChild(empty);
		} else {
			matches.forEach(module => {
				const link = document.createElement('a');
				link.className = 'home-module-search-result';
				link.href = module.href;
				link.setAttribute('role', 'option');
				link.textContent = module.label;
				results.appendChild(link);
			});
		}
		results.hidden = false;
		input.setAttribute('aria-expanded', 'true');
	};

	input.addEventListener('input', renderResults);
	input.addEventListener('keydown', event => {
		if (event.key === 'Escape') hideResults();
		if (event.key === 'Enter' && !results.hidden) {
			event.preventDefault();
			results.querySelector('a')?.click();
		}
	});
	form.addEventListener('submit', event => {
		event.preventDefault();
		results.querySelector('a')?.click();
	});
	document.addEventListener('click', event => {
		if (!form.contains(event.target)) hideResults();
	});
})();
