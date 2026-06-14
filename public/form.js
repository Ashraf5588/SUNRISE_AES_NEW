document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded');
    // Make the entire ansradio label clickable
    const ansradioLabels = document.querySelectorAll('.ansradio');
    console.log('Found ' + ansradioLabels.length + ' radio labels');
    
    ansradioLabels.forEach(label => {
        label.addEventListener('click', function(e) {
            console.log('Label clicked');
            // Find the radio input inside this label
            const radioInput = this.querySelector('input[type="radio"]');
            
            // Check the radio input (only if we didn't click directly on the input)
            if (radioInput && !e.target.isSameNode(radioInput)) {
                console.log('Setting radio checked: ' + radioInput.id);
                radioInput.checked = true;
                
                // Simulate the change event on the radio input to trigger its handler
                const changeEvent = new Event('change', { bubbles: true });
                radioInput.dispatchEvent(changeEvent);
            }
        });
    });

    // Handle radio button changes
    const radioInputs = document.querySelectorAll('input[type="radio"]');
      radioInputs.forEach(radio => {
        radio.addEventListener('change', function() {
            // Find the parent ansradio label
            const ansradio = this.closest('.ansradio');
            
            // Remove active class from all siblings in the same question group
            const optionsContainer = ansradio.closest('.optionsinfo');
            if (optionsContainer) {
                optionsContainer.querySelectorAll('.ansradio').forEach(option => {
                    option.classList.remove('active');
                });
            } else {
                // If optionsinfo container is not found, try finding siblings by name
                const name = radio.getAttribute('name');
                if (name) {
                    document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
                        const label = input.closest('.ansradio');
                        if (label) {
                            label.classList.remove('active');
                        }
                    });
                }
            }
            
            // Add active class to selected option
            if(this.checked && ansradio) {
                ansradio.classList.add('active');
            }
        });
    });
});
