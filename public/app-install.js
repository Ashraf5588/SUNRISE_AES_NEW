(() => {
	let deferredInstallPrompt = null;
	let dialog;
	let instructions;
	const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
		|| (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	const isStandalone = window.matchMedia('(display-mode: standalone)').matches
		|| navigator.standalone === true;

	const ensureDialog = () => {
		if (dialog) return;

		dialog = document.createElement('dialog');
		dialog.className = 'app-install-dialog';
		dialog.setAttribute('aria-labelledby', 'appInstallTitle');
		dialog.innerHTML = '<h2 id="appInstallTitle">Install AES on your device</h2><div id="appInstallInstructions"></div><div class="app-install-dialog-close"><button type="button">Close</button></div>';
		document.body.append(dialog);
		instructions = dialog.querySelector('#appInstallInstructions');
		dialog.querySelector('.app-install-dialog-close button').addEventListener('click', () => dialog.close());
		dialog.addEventListener('click', event => {
			if (event.target === dialog) dialog.close();
		});
	};

	const showInstructions = () => {
		ensureDialog();
		if (isStandalone) {
			instructions.textContent = 'AES is already installed on this device.';
		} else if (isIos) {
			instructions.innerHTML = '<p>On iPhone or iPad, open this page in Safari, tap the <strong>Share</strong> button, choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</p><p>This installs the AES web app; Android APK files cannot be installed on iOS.</p>';
		} else {
			instructions.innerHTML = '<p>Install AES for quick access from your home screen.</p><ol><li>Open this page in Chrome or another supported browser.</li><li>Choose the browser’s <strong>Install app</strong> or <strong>Add to Home screen</strong> option.</li><li>Confirm the installation prompt.</li></ol><p>The same web app works on Android and iOS; no separate APK is required.</p>';
		}
		if (typeof dialog.showModal === 'function') dialog.showModal();
		else window.alert(instructions.textContent);
	};

	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.register('/app-service-worker.js', { scope: '/' })
			.catch(error => console.error('Unable to register the app install service worker:', error));
	}

	window.addEventListener('beforeinstallprompt', event => {
		event.preventDefault();
		deferredInstallPrompt = event;
	});

	window.addEventListener('appinstalled', () => {
		deferredInstallPrompt = null;
	});

	document.querySelectorAll('[data-install-app]').forEach(button => {
		button.addEventListener('click', async () => {
			if (!deferredInstallPrompt) {
				showInstructions();
				return;
			}

			try {
				deferredInstallPrompt.prompt();
				const choice = await deferredInstallPrompt.userChoice;
				deferredInstallPrompt = null;
				if (choice.outcome === 'accepted') {
					ensureDialog();
					instructions.textContent = 'AES is being installed on your device.';
					if (typeof dialog.showModal === 'function') dialog.showModal();
				}
			} catch (error) {
				deferredInstallPrompt = null;
				console.error('Unable to show the AES app install prompt:', error);
				showInstructions();
			}
		});
	});
})();
