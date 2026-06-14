/**
 * Bootstrap Table Enhancement Script
 * This script enhances Bootstrap tables with additional functionality
 */

document.addEventListener('DOMContentLoaded', function() {
  // Find all bootstrap responsive table containers
  const tableContainers = document.querySelectorAll('.table-responsive');
  
  if (tableContainers.length === 0) return;
  
  tableContainers.forEach(container => {
    // Get the table directly 
    const table = container.querySelector('.table');
    if (!table) return;
    
    // Setup column widths - makes sure header and cell widths match
    setupBootstrapTableColumns(table);
    
    // Add resize event listener to adjust columns when window size changes
    window.addEventListener('resize', function() {
      setupBootstrapTableColumns(table);
    });
  });
  
  /**
   * Sets up the table columns to ensure proper alignment with Bootstrap
   * @param {HTMLElement} table - The table element to adjust
   */
  function setupBootstrapTableColumns(table) {
    const headerCells = table.querySelectorAll('thead th');
    const bodyRows = table.querySelectorAll('tbody tr');
    
    if (headerCells.length === 0) return;
    
    // Calculate column widths based on content
    let columnWidths = [];
    
    // First get header widths
    headerCells.forEach((th, index) => {
      columnWidths[index] = th.scrollWidth;
    });
    
    // Then check body rows to ensure we have width for all content
    const maxRowsToCheck = Math.min(10, bodyRows.length);
    for (let i = 0; i < maxRowsToCheck; i++) {
      const cells = bodyRows[i]?.querySelectorAll('td');
      cells.forEach((td, index) => {
        if (td.scrollWidth > columnWidths[index]) {
          columnWidths[index] = td.scrollWidth;
        }
      });
    }
    
    // Apply calculated widths to ensure consistency
    headerCells.forEach((th, index) => {
      const width = `${columnWidths[index] + 15}px`;
      th.style.minWidth = width;
    });
    
    // Make sure action column stays sticky on scroll
    const actionHeaders = table.querySelectorAll('th.action-column');
    actionHeaders.forEach(header => {
      header.style.position = 'sticky';
      header.style.right = '0';
      header.style.zIndex = '11';
    });
    
    const actionCells = table.querySelectorAll('td.action-column');
    actionCells.forEach(cell => {
      cell.style.position = 'sticky';
      cell.style.right = '0';
      cell.style.zIndex = '1';
    });
  }
});
