const {
    COMMAND_TYPES,
    buildUserInfoUpdateCommand,
    isValidAdmsPin
} = require('./employeeAdmsCommands');

const isManualAdmsSyncTestEnabled = (value = process.env.EMPLOYEE_ADMS_MANUAL_SYNC_TEST_ENABLED) => value === 'true';
const ACTIVE_MANUAL_SYNC_STATUSES = Object.freeze(['PENDING', 'SENT']);
const MANUAL_SYNC_ACK_TIMEOUT_MS = 24 * 60 * 60 * 1000;

function getActiveManualSyncCommandFilter(activeCommandKey) {
    return {
        activeCommandKey,
        status: { $in: ACTIVE_MANUAL_SYNC_STATUSES }
    };
}

function getTerminalManualSyncCommandFilter(activeCommandKey) {
    return {
        activeCommandKey,
        status: { $nin: ACTIVE_MANUAL_SYNC_STATUSES }
    };
}

function getExpiredManualSyncCommandFilter(activeCommandKey, sentAtCutoff) {
    return {
        activeCommandKey,
        status: 'SENT',
        sentAt: { $lte: sentAtCutoff }
    };
}

function isActiveManualSyncCommand(command) {
    return ACTIVE_MANUAL_SYNC_STATUSES.includes(command?.status);
}

function isManualSyncCommandExpired(sentAt, now = Date.now()) {
    if (sentAt == null) return false;
    const sentAtMs = new Date(sentAt).getTime();
    const nowMs = new Date(now).getTime();
    return Number.isFinite(sentAtMs)
        && Number.isFinite(nowMs)
        && sentAtMs <= nowMs
        && nowMs - sentAtMs >= MANUAL_SYNC_ACK_TIMEOUT_MS;
}

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
        throw new Error('Manual sync only supports normal-user updates.');
    }
    return command;
}

function getManualTestPollFilter(serialNumber, organizationId) {
    const normalizedSerialNumber = String(serialNumber || '').trim();
    const normalizedOrganizationId = String(organizationId || '').trim();
    if (!normalizedSerialNumber || !normalizedOrganizationId) return null;
    return {
        organizationId: normalizedOrganizationId,
        serialNumber: normalizedSerialNumber,
        manualTest: true,
        manualRequestVersion: 1,
        commandType: COMMAND_TYPES.UPDATE_USER
    };
}

function isManualTestCommandEligible(command, serialNumber, organizationId) {
    return Boolean(String(serialNumber || '').trim())
        && Boolean(String(organizationId || '').trim())
        && command?.organizationId === String(organizationId).trim()
        && command?.serialNumber === String(serialNumber).trim()
        && command?.manualTest === true
        && command?.manualRequestVersion === 1
        && command?.commandType === COMMAND_TYPES.UPDATE_USER;
}

function getCommandAcknowledgementStatus(returnCode) {
    return Number(returnCode) === 0 ? 'SUCCESS' : 'FAILED';
}

async function queueManualEmployeeSync({
    employeeId,
    serialNumber,
    requestedBy = '',
    isEnabled,
    isValidEmployeeId,
    organizationId,
    loadEmployee,
    loadDevice,
    queueCommand
}) {
    if (!isEnabled) {
        return { queued: false, status: 403, message: 'Manual employee synchronization is disabled.' };
    }
    if (!isValidEmployeeId(employeeId)) {
        return { queued: false, status: 400, message: 'Invalid employee reference.' };
    }
    const selectedSerialNumber = String(serialNumber || '').trim();
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(selectedSerialNumber)) {
        return { queued: false, status: 400, message: 'Select a valid attendance device.' };
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

    const device = await loadDevice(organizationId, selectedSerialNumber);
    if (
        !device
        || device.serialNumber !== selectedSerialNumber
        || device.organizationId !== organizationId
    ) {
        return { queued: false, status: 404, message: 'The selected attendance device is not registered in this organization.' };
    }
    if (device.supportsUserSyncCommands !== true) {
        return {
            queued: false,
            status: 409,
            message: 'User synchronization is blocked because this exact device and firmware have not been verified to support ADMS user commands.'
        };
    }

    const queuedCommand = await queueCommand(device, employee, {
        ...command,
        deviceCode: String(employee.deviceCode || '').trim()
    }, requestedBy, { manualTest: true });

    return {
        queued: true,
        status: 202,
        duplicate: queuedCommand.duplicate === true,
        commandId: queuedCommand.commandId,
        commandStatus: queuedCommand.status,
        outcome: queuedCommand.duplicate
            ? queuedCommand.status === 'PENDING' ? 'existing_pending' : 'existing_sent'
            : 'queued',
        serialNumber: selectedSerialNumber
    };
}

module.exports = {
    ACTIVE_MANUAL_SYNC_STATUSES,
    MANUAL_SYNC_ACK_TIMEOUT_MS,
    buildManualTestUserUpdateCommand,
    getActiveManualSyncCommandFilter,
    getCommandAcknowledgementStatus,
    getExpiredManualSyncCommandFilter,
    getTerminalManualSyncCommandFilter,
    isActiveManualSyncCommand,
    isManualSyncCommandExpired,
    isManualTestCommandEligible,
    getManualTestPollFilter,
    isManualAdmsSyncTestEnabled,
    queueManualEmployeeSync
};
