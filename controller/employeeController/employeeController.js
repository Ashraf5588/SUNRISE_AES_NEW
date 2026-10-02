const employeeAttendance = require('../../model/employeeSchema/employeeattendanceSchema');
exports.saveEmployeeAttendance = async (req, res) => {
    try {
        const {SN,table} = req.body;
        const body = req.body || '';

  if (table === 'ATTLOG') {
    const lines = body.split('\n').filter(Boolean);
    const docs = lines.map(line => {
      const [pin, name, time, mode, state] = line.split(',');
      return {
        sn: SN,
        pin: pin.trim(),
        name: name?.trim(),
        punchTime: new Date(time.trim()),
        verifyMode: mode?.trim(),
        state: parseInt(state) || 0
      };
    });

    if (docs.length) {
      await employeeAttendance.insertMany(docs, { ordered: false });
    }
  }

  res.status(200).send('OK');

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}
exports.getEmployeeAttendance = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const query = {};

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    query.punchTime = { $gte: start, $lte: end };
  }
  const attendances = await employeeAttendance.find(query).sort({ punchTime: 1 }).lean();
  return res.render('employee/employeeAttendance', { attendances, startDate, endDate });
}catch (error) {
  res.status(500).json({ message: error.message });
}
}