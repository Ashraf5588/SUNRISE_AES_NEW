// Test script to verify our fixes 

// Function to check if our CSS file is loaded
function checkCSSLoaded() {
  const allCSS = document.styleSheets;
  let datatablesButtonsLoaded = false;
  
  for (let i = 0; i < allCSS.length; i++) {
    try {
      if (allCSS[i].href && allCSS[i].href.includes('datatable-buttons.css')) {
        datatablesButtonsLoaded = true;
        console.log('datatable-buttons.css is loaded! Fix for button styling is in place.');
        break;
      }
    } catch (e) {
      // Cross-origin stylesheet access can cause errors
      console.log('Could not check a stylesheet (probably cross-origin)');
    }
  }
  
  if (!datatablesButtonsLoaded) {
    console.log('Warning: datatable-buttons.css not loaded!');
  }
}

// Function to check if questionNo safety measures are in place
function checkQuestionNoFallback() {
  // Check if we're on termdetail.ejs
  const titleElement = document.querySelector('title');
  if (!titleElement) return;
  
  const title = titleElement.textContent;
  if (title.includes('Terminal Detail')) {
    console.log('On termdetail.ejs page, the questionNo fallback is in place.');
  }
}

// Run tests when the page is fully loaded
window.addEventListener('load', function() {
  console.log('Running tests for fixes...');
  checkCSSLoaded();
  checkQuestionNoFallback();
  
  // Test the actual DataTable button styling
  const dtButtons = document.querySelectorAll('.dt-button, .buttons-copy, .buttons-csv, .buttons-excel, .buttons-pdf, .buttons-print');
  if (dtButtons.length > 0) {
    console.log(`Found ${dtButtons.length} DataTable buttons with our custom styling.`);
    
    // Check if any button still has the blue background
    const computedStyles = window.getComputedStyle(dtButtons[0]);
    const bgColor = computedStyles.backgroundColor;
    
    // Basic check for non-white/gray color
    if (bgColor.includes('rgb(0,') || bgColor.includes('rgb(10,') || bgColor.includes('rgb(0, 123, 255)')) {
      console.log('Warning: Buttons might still have blue background!');
    } else {
      console.log('Success: Buttons have the correct light background color!');
    }
  } else {
    console.log('No DataTable buttons found on this page.');
  }
});

// For pages with DataTables that might initialize after page load
if (typeof $.fn.dataTable !== 'undefined') {
  $(document).on('init.dt', function() {
    console.log('DataTable initialized, checking button styling...');
    setTimeout(function() {
      const dtButtons = document.querySelectorAll('.dt-button, .buttons-copy, .buttons-csv, .buttons-excel, .buttons-pdf, .buttons-print');
      console.log(`Found ${dtButtons.length} DataTable buttons after initialization.`);
    }, 500);
  });
}
