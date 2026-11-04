const {
    COMMAND_TYPES,
    buildUserInfoUpdateCommand,
    isValidAdmsPin
} = require('./employeeAdmsCommands');

const MANUAL_SYNC_TEST_SERIAL_NUMBER = 'MFP3241900092';
const isManualAdmsSyncTestEnabled = (value = process.env.EMPLOYEE_ADMS_MANUAL_SYNC_TEST_ENABLED) => value === 'true';

function buildManualTestUserUpdateCommand(employee) {
    const statuses = [employee?.employmentStatus, employee?.jobStatus]
        .map(status => String(status || '').trim().toLowerCase())
        .filter(Boolean);
    const isActive = Boolean(String(employee?.staffName || '').trim())
        && employee?.isActive !== false
        && !statuses.some(status => ['resigned', 'terminated', 'inactive', 'disabled'].includes(status))
        && (!statuses.length || statuses.some(status => ['active', 'on leave', 'probation'].includes(status)));
    if (!isActive) throw new Error('Only active employees can be synchronized.');
    if (!isValidAdmsPin(employee?.deviceCode)) throw new Error('Set a valid Device Code / PIN before synchronization.');

    const command = buildUserInfoUpdateCommand({
        ...employee,
        isManager: false
    });
    if (command.commandType !== COMMAND_TYPES.UPDATE_USER || command.privilege !== 0) {
        throw new Error('Manual test sync only supports normal-user updates.');
    }
    return command;
}

function getManualTestPollFilter(serialNumber) {
    if (String(serialNumber || '').trim() !== MANUAL_SYNC_TEST_SERIAL_NUMBER) return null;
    return {
        manualTest: true,
        commandType: COMMAND_TYPES.UPDATE_USER
    };
}

function getCommandAcknowledgementStatus(returnCode) {
    return Number(returnCode) === 0 ? 'SUCCESS' : 'FAILED';
}

async function queueManualEmployeeSyncTest({
    employeeId,
    requestedBy = '',
    isEnabled,
    isValidEmployeeId,
    organizationId,
    loadEmployee,
    loadDevice,
    queueCommand
}) {
    if (!isEnabled) {
        return { queued: false, status: 403, message: 'Manual employee sync testing is disabled.' };
    }
    if (!isValidEmployeeId(employeeId)) {
        return { queued: false, status: 400, message: 'Invalid employee reference.' };
    }
    if (!organizationId) {
        return { queued: false, status: 500, message: 'Current organization database could not be identified.' };
    }
    const employee = await loadEmployee(employeeId);
    if (!employee) {
        return { queued: false, status: 404, message: 'Employee profile not found in this organization.' };
    }
    let command;
    try {
        command = buildManualTestUserUpdateCommand(employee);
    } catch (error) {
        return { queued: false, status: 400, message: error.message };
    }

    const device = await loadDevice(organizationId, MANUAL_SYNC_TEST_SERIAL_NUMBER);
    if (
        !device
        || device.serialNumber !== MANUAL_SYNC_TEST_SERIAL_NUMBER
        || device.organizationId !== organizationId
    ) {
        return { queued: false, status: 404, message: 'The configured MB2000 test device is not registered in this organization.' };
    }
    const queuedCommand = await queueCommand(device, employee, {
        ...command,
        deviceCode: String(employee.deviceCode || '').trim()
    }, requestedBy, { manualTest: true });
    console.info('Manual ADMS test command requested:', {
        organizationId,
        employeeReference: String(employee._id),
        deviceCode: String(employee.deviceCode || '').trim(),
        serialNumber: MANUAL_SYNC_TEST_SERIAL_NUMBER,
        commandId: queuedCommand.commandId,
        status: queuedCommand.status
    });
    return {
        queued: true,
        status: 202,
        commandId: queuedCommand.commandId,
        commandStatus: queuedCommand.status
    };
}

module.exports = {
    MANUAL_SYNC_TEST_SERIAL_NUMBER,
    buildManualTestUserUpdateCommand,
    getCommandAcknowledgementStatus,
    getManualTestPollFilter,
    isManualAdmsSyncTestEnabled,
    queueManualEmployeeSyncTest
};
