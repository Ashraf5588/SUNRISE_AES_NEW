const shell = document.querySelector('.hm-shell');
const menuToggle = document.querySelector('.hm-menu-toggle');
const sidenav = document.getElementById('hmSidebar');
const sidenavClose = document.querySelector('.hm-sidenav-close');
const backdrop = document.getElementById('hmBackdrop');
const groupingPanel = document.getElementById('bmiGroupingPanel');
const printSummaryBtn = document.getElementById('printDiagnosisSummaryBtn');
const printBmiReportBtn = document.getElementById('printBmiReportBtn');
const exportBmiExcelBtn = document.getElementById('exportBmiExcelBtn');
const diagnosisSummaryPanel = document.getElementById('diagnosisSummaryPanel');

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

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeNav();
  }
});

if (printSummaryBtn && diagnosisSummaryPanel) {
  printSummaryBtn.addEventListener('click', () => {
    diagnosisSummaryPanel.removeAttribute('hidden');
    diagnosisSummaryPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => window.print(), 250);
  });
}

if (printBmiReportBtn && groupingPanel) {
  let bmiGroupingWasHidden = false;

  printBmiReportBtn.addEventListener('click', () => {
    bmiGroupingWasHidden = groupingPanel.hasAttribute('hidden');
    groupingPanel.removeAttribute('hidden');
    document.body.classList.add('is-printing-bmi');
    window.setTimeout(() => window.print(), 100);
  });

  window.addEventListener('afterprint', () => {
    document.body.classList.remove('is-printing-bmi');
    if (bmiGroupingWasHidden) {
      groupingPanel.setAttribute('hidden', '');
    }
    bmiGroupingWasHidden = false;
  });
}

if (exportBmiExcelBtn && groupingPanel) {
  exportBmiExcelBtn.addEventListener('click', () => {
    const rows = [['BMI Category', 'Class', 'Section', 'Roll', 'Student', 'Contact', 'BMI']];
    const csvValue = (value) => {
      const text = String(value || '').trim();
      const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };

    groupingPanel.querySelectorAll('.hm-bmi-group-card').forEach((categoryCard) => {
      const category = categoryCard.querySelector('.hm-bmi-group-header h2')?.textContent.trim() || '';
      categoryCard.querySelectorAll('.hm-bmi-class-group').forEach((classGroup) => {
        const studentClass = classGroup.dataset.class || '';
        const section = classGroup.dataset.section || '';
        classGroup.querySelectorAll('.hm-bmi-table tbody tr').forEach((studentRow) => {
          const values = Array.from(studentRow.cells, (cell) => cell.textContent.trim());
          rows.push([category, studentClass, section, ...values]);
        });
      });
    });

    const csv = `\uFEFF${rows.map((row) => row.map(csvValue).join(',')).join('\r\n')}`;
    const downloadUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = `BMI_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  });
}