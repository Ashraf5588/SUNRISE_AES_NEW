
const employeeAttendance = require('../../model/employeeSchema/employeeattendanceSchema');

/**
 * Parse one attendance timestamp safely.
 */
function parsePunchTime(value) {
    if (!value) return null;

    const date = new Date(String(value).trim());

    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parse an attendance row.
 *
 * Standard tab format:
 * PIN    YYYY-MM-DD HH:mm:ss    STATUS    VERIFY_MODE
 *
 * Legacy CSV format:
 * PIN,NAME,YYYY-MM-DD HH:mm:ss,VERIFY_MODE,STATUS
 */
function parseAttendanceRow(line, serialNumber) {
    const trimmedLine = String(line || '').trim();

    if (!trimmedLine) return null;

    // Support tab-separated or comma-separated records.
    const delimiter = trimmedLine.includes('\t') ? '\t' : ',';
    const values = trimmedLine.split(delimiter).map(value => value.trim());

    if (values.length < 2 || !values[0]) {
        return null;
    }

    let pin;
    let name;
    let timestamp;
    let status;
    let verifyMode;

    // Standard ZKTeco tab-separated format.
    if (/^\d{4}-\d{2}-\d{2}[ T]/.test(values[1])) {
        pin = values[0];
        timestamp = values[1];
        status = values[2];
        verifyMode = values[3];
    }

    // Legacy CSV: PIN,NAME,TIMESTAMP,VERIFY_MODE,STATUS.
    else if (values.length >= 3 &&
             /^\d{4}-\d{2}-\d{2}[ T]/.test(values[2])) {
        pin = values[0];
        name = values[1];
        timestamp = values[2];
        verifyMode = values[3];
        status = values[4];
    }

    else {
        return null;
    }

    const punchTime = parsePunchTime(timestamp);

    if (!pin || !punchTime) {
        return null;
    }

    const document = {
        sn: serialNumber,
        pin,
        punchTime
    };

    if (name) document.name = name;

    if (status !== undefined && status !== '') {
        const parsedStatus = Number.parseInt(status, 10);

        if (Number.isInteger(parsedStatus)) {
            document.status = parsedStatus;
        }
    }

    if (verifyMode !== undefined && verifyMode !== '') {
        const parsedVerifyMode = Number.parseInt(verifyMode, 10);

        if (Number.isInteger(parsedVerifyMode)) {
            document.verifyMode = parsedVerifyMode;
        }
    }

    return document;
}

/**
 * Receive attendance data from a ZKTeco device or test client.
 *
 * Route example:
 * router.post('/iclock/cdata', controller.saveEmployeeAttendance);
 */
exports.saveEmployeeAttendance = async (req, res) => {
    try {
        const fields =
            req.body && typeof req.body === 'object'
                ? req.body
                : {};

        const serialNumber = String(
            req.query.SN ||
            fields.SN ||
            fields.sn ||
            ''
        ).trim();

        const table = String(
            req.query.table ||
            fields.table ||
            ''
        ).trim().toUpperCase();

        // Express text middleware normally makes req.body a string.
        let payload = '';

        if (typeof req.body === 'string') {
            payload = req.body;
        } else if (Buffer.isBuffer(req.body)) {
            payload = req.body.toString('utf8');
        } else {
            payload = String(
                fields.data ||
                fields.attlog ||
                fields.body ||
                ''
            );
        }

        // Device configuration and other protocol requests
        // should be handled by the appropriate route/controller.
        if (table !== 'ATTLOG') {
            return res.status(200).send('OK');
        }

        if (!serialNumber) {
            return res.status(400).send(
                'Missing device serial number'
            );
        }

        if (!payload.trim()) {
            return res.status(400).send(
                'Empty attendance payload'
            );
        }

        const lines = payload
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);

        const parsedRows = lines.map(line =>
            parseAttendanceRow(line, serialNumber)
        );

        const docs = parsedRows.filter(Boolean);

        if (!docs.length) {
            console.warn('No valid ATTLOG rows received', {
                serialNumber,
                table,
                contentType: req.headers['content-type'],
                bodyType: typeof req.body,
                bodyPreview: payload.slice(0, 300)
            });

            return res.status(400).send(
                'No valid ATTLOG rows received'
            );
        }

        // Insert records. ordered:false allows valid rows to be
        // inserted even if an individual row causes a DB error.
        let insertedCount = 0;

        try {
            const inserted = await employeeAttendance.insertMany(
                docs,
                { ordered: false }
            );

            insertedCount = inserted.length;
        } catch (dbError) {
            // MongoDB may partially insert records with ordered:false.
            if (Array.isArray(dbError.insertedDocs)) {
                insertedCount = dbError.insertedDocs.length;
            }

            console.error('Attendance database insertion error:', {
                message: dbError.message,
                insertedCount
            });

            // Do not report a successful full import if insertion failed.
            return res.status(500).json({
                message: 'Attendance database insertion failed',
                insertedCount,
                error: dbError.message
            });
        }

        console.log('Attendance received:', {
            serialNumber,
            receivedRows: lines.length,
            validRows: docs.length,
            insertedCount
        });

        return res.status(200).send('OK');

    } catch (error) {
        console.error('saveEmployeeAttendance error:', error);

        return res.status(500).json({
            message: error.message
        });
    }
};

/**
 * Display employee attendance with optional date filtering.
 */
exports.getEmployeeAttendance = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const query = {};

        if (startDate || endDate) {
            query.punchTime = {};

            if (startDate) {
                const start = new Date(startDate);

                if (Number.isNaN(start.getTime())) {
                    return res.status(400).send(
                        'Invalid startDate'
                    );
                }

                start.setHours(0, 0, 0, 0);
                query.punchTime.$gte = start;
            }

            if (endDate) {
                const end = new Date(endDate);

                if (Number.isNaN(end.getTime())) {
                    return res.status(400).send(
                        'Invalid endDate'
                    );
                }

                end.setHours(23, 59, 59, 999);
                query.punchTime.$lte = end;
            }
        }

        const attendances = await employeeAttendance
            .find(query)
            .sort({ punchTime: -1 })
            .lean();

        return res.render('employee/employeeattendance', {
            attendances,
            startDate: startDate || '',
            endDate: endDate || '',
            deviceSN: req.query.SN || ''
        });

    } catch (error) {
        console.error('getEmployeeAttendance error:', error);

        return res.status(500).json({
            message: error.message
        });
    }
};