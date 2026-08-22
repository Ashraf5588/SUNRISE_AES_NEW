(function () {
    function loadSheetJs() {
        return new Promise(function (resolve, reject) {
            if (window.XLSX) {
                resolve();
                return;
            }

            var script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function exportTablesToExcel() {
        var tables = document.querySelectorAll('table');
        if (!tables.length) {
            window.alert('No table data available to export.');
            return;
        }

        function escapeHtml(value) {
            return String(value).replace(/[&<>'"]/g, function (character) {
                return {'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[character];
            });
        }

        var html = '<html><head><meta charset="UTF-8"></head><body>';
        var title = document.querySelector('h1');
        if (title) html += '<h2>' + escapeHtml(title.textContent.trim()) + '</h2>';

        tables.forEach(function (table) {
            var section = table.closest('.class-section');
            var classTitle = section && section.querySelector('.class-title');
            if (classTitle) html += '<h3>' + escapeHtml(classTitle.textContent.trim()) + '</h3>';
            var subjectSection = table.closest('.grade-section');
            var subjectTitle = subjectSection && subjectSection.querySelector('.subject-title');
            if (subjectTitle) html += '<h3>' + escapeHtml(subjectTitle.textContent.trim()) + '</h3>';
            html += '<table border="1" style="border-collapse:collapse;border:1px solid #000;">';
            Array.from(table.rows).forEach(function (row) {
                html += '<tr>';
                Array.from(row.cells).forEach(function (cell) {
                    var tag = cell.tagName.toLowerCase() === 'th' ? 'th' : 'td';
                    html += '<' + tag + ' style="border:1px solid #000;padding:5px;text-align:center;mso-number-format:\'@\';">' +
                        escapeHtml(cell.textContent.trim()) + '</' + tag + '>';
                });
                html += '</tr>';
            });
            html += '</table><br>';
        });

        html += '</body></html>';
        var blob = new Blob([html], {type: 'application/vnd.ms-excel'});
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'exam_report_' + new Date().toISOString().slice(0, 10) + '.xls';
        link.click();
        URL.revokeObjectURL(link.href);
    }

    window.exportExamTablesToExcel = exportTablesToExcel;

    function addExportButton() {
        if (document.querySelector('.exam-excel-button')) return;
        if (document.querySelector('.btn-excel, .export-btn')) return;

        var host = document.querySelector('.header-controls, .header-actions, .header, .dashboard-header');
        if (!host) return;

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'exam-excel-button no-print';
        button.textContent = 'Export to Excel';
        button.addEventListener('click', exportTablesToExcel);
        host.appendChild(button);
    }

    function addNavToggle() {
        var nav = document.querySelector('.exam-side-nav');
        if (!nav || document.querySelector('.exam-nav-toggle')) return;

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'exam-nav-toggle no-print';
        button.setAttribute('aria-label', 'Hide navigation');
        button.setAttribute('title', 'Hide or show navigation');
        button.textContent = '•••';
        button.addEventListener('click', function () {
            var collapsed = document.body.classList.toggle('exam-nav-collapsed');
            button.setAttribute('aria-label', collapsed ? 'Show navigation' : 'Hide navigation');
        });
        document.body.appendChild(button);
    }

    document.addEventListener('DOMContentLoaded', function () {
        addNavToggle();
        addExportButton();
    });
}());
