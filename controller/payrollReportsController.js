const payrollReportsService = require('../services/payrollReportsService');
const School = require('../model/billingschema/School');

const report = async (req, res) => {
  try {
    const reportKey = String(req.params.reportKey || req.query.report || 'monthly-register');
    const data = await payrollReportsService.getPayrollReport(reportKey, req.query);
    return res.render('billingfirst/payrollReports', {
      ...data,
      title: data.report.title,
      printMode: req.path.endsWith('/print'),
      error: null,
    });
  } catch (error) {
    console.error('Unable to build payroll report:', error);
    const status = error.message.startsWith('Choose') || error.message.includes('date') || error.message.includes('month')
      ? 400
      : 500;
    return res.status(status).render('billingfirst/payrollReports', {
      report: { key: req.params.reportKey || 'monthly-register', title: 'Payroll reports' },
      title: 'Payroll reports',
      reportKeys: payrollReportsService.REPORTS
        ? Object.entries(payrollReportsService.REPORTS).map(([key, value]) => ({ key, title: value.title }))
        : [],
      rows: [],
      columns: [],
      exportRows: [],
      summary: {},
      filters: req.query || {},
      pagination: { page: 1, pageCount: 1, totalRows: 0, pageSize: 50 },
      periodLabel: '',
      printMode: false,
      error: error.message || 'Unable to load payroll report.',
    });
  }
};

const exportReport = async (req, res) => {
  try {
    const format = String(req.params.format || '').toLowerCase();
    const school = await School.findOne().select('name').lean();
    const result = await payrollReportsService.exportPayrollReport(
      req.params.reportKey,
      req.query,
      format,
      school?.name || 'School'
    );
    const extension = format === 'xls' ? 'xls' : 'pdf';
    const filename = `${req.params.reportKey}-${new Date().toISOString().slice(0, 10)}.${extension}`;
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(result.body);
  } catch (error) {
    console.error('Unable to export payroll report:', error);
    const status = error.message.startsWith('Choose') || error.message.includes('Narrow the')
      ? 400
      : 500;
    return res.status(status).send(error.message || 'Unable to export payroll report.');
  }
};

module.exports = {
  exportReport,
  report,
};
