const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    buildManualTestUserUpdateCommand,
    getCommandAcknowledgementStatus,
    isManualTestCommandEligible,
    getManualTestPollFilter,
    isManualAdmsSyncTestEnabled,
    queueManualEmployeeSync
} = require('../utils/employeeAdmsManualSync');
const { COMMAND_TYPES } = require('../utils/employeeAdmsCommands');
const { EmployeeAttendanceDeviceCommand } = require('../model/employeeSchema/employeeAttendanceDeviceCommandSchema');

const employee = {
    _id: '507f1f77bcf86cd799439011',
    staffName: 'Subina Subedi',
    deviceCode: '202',
    isActive: true,
    employmentStatus: 'Active',
    isManager: true
};
const organizationId = 'school-test';
const serialNumber = 'MB2000-TEST';

function createQueueDependencies(overrides = {}) {
    const calls = { employee: 0, device: [], queued: [] };
    const dependencies = {
        employeeId: employee._id,
        serialNumber,
        requestedBy: 'test-admin',
        isEnabled: true,
        isValidEmployeeId: value => value === employee._id,
        organizationId,
        loadEmployee: async () => {
            calls.employee += 1;
            return employee;
        },
        loadDevice: async (currentOrganizationId, selectedSerialNumber) => {
            calls.device.push({ currentOrganizationId, selectedSerialNumber });
            return {
                organizationId: currentOrganizationId,
                serialNumber: selectedSerialNumber,
                supportsUserSyncCommands: true,
                supportsUserDeletion: false,
                supportsManagerPrivilege: false
            };
        },
        queueCommand: async (...args) => {
            calls.queued.push(args);
            return { commandId: 31, status: 'PENDING' };
        },
        ...overrides
    };
    return { dependencies, calls };
}

test('manual sync switch defaults off and accepts only explicit true', () => {
    assert.equal(isManualAdmsSyncTestEnabled('false'), false);
    assert.equal(isManualAdmsSyncTestEnabled(''), false);
    assert.equal(isManualAdmsSyncTestEnabled('true'), true);
});

test('disabled manual sync rejects before loading employee or device', async () => {
    const { dependencies, calls } = createQueueDependencies({ isEnabled: false });
    const result = await queueManualEmployeeSync(dependencies);

    assert.equal(result.queued, false);
    assert.equal(result.status, 403);
    assert.match(result.message, /disabled/i);
    assert.equal(calls.employee, 0);
    assert.equal(calls.device.length, 0);
});

test('manual sync is independent of the disabled global queue and only targets the selected device', async () => {
    const previousGlobal = process.env.EMPLOYEE_ADMS_COMMANDS_ENABLED;
    process.env.EMPLOYEE_ADMS_COMMANDS_ENABLED = 'false';
    try {
        const { dependencies, calls } = createQueueDependencies({
            isEnabled: isManualAdmsSyncTestEnabled('true')
        });
        const result = await queueManualEmployeeSync(dependencies);

        assert.equal(result.queued, true);
        assert.equal(result.serialNumber, serialNumber);
        assert.deepEqual(calls.device, [{ currentOrganizationId: organizationId, selectedSerialNumber: serialNumber }]);
        assert.equal(calls.queued.length, 1);
        const [device, queuedEmployee, command, requestedBy, options] = calls.queued[0];
        assert.equal(device.serialNumber, serialNumber);
        assert.equal(queuedEmployee._id, employee._id);
        assert.equal(command.commandType, COMMAND_TYPES.UPDATE_USER);
        assert.equal(command.deviceCode, '202');
        assert.equal(command.privilege, 0);
        assert.match(command.commandPayload, /PIN=202\tName=Subina Subedi\tPri=0/);
        assert.equal(requestedBy, 'test-admin');
        assert.deepEqual(options, { manualTest: true });
    } finally {
        if (previousGlobal === undefined) delete process.env.EMPLOYEE_ADMS_COMMANDS_ENABLED;
        else process.env.EMPLOYEE_ADMS_COMMANDS_ENABLED = previousGlobal;
    }
});

test('invalid employee references and device serials are rejected before database access', async () => {
    const invalidReference = createQueueDependencies({
        employeeId: 'invalid',
        isValidEmployeeId: () => false
    });
    const invalidReferenceResult = await queueManualEmployeeSync(invalidReference.dependencies);
    assert.equal(invalidReferenceResult.status, 400);
    assert.equal(invalidReference.calls.employee, 0);

    const invalidSerial = createQueueDependencies({ serialNumber: '../other-device' });
    const invalidSerialResult = await queueManualEmployeeSync(invalidSerial.dependencies);
    assert.equal(invalidSerialResult.status, 400);
    assert.equal(invalidSerial.calls.employee, 0);
});

test('invalid PINs, invalid names, and inactive employees are rejected before device lookup', async () => {
    for (const invalidEmployee of [
        { ...employee, deviceCode: '20 2' },
        { ...employee, staffName: '  ' },
        { ...employee, isActive: false },
        { ...employee, employmentStatus: 'Terminated' }
    ]) {
        const { dependencies, calls } = createQueueDependencies({
            loadEmployee: async () => invalidEmployee
        });
        const result = await queueManualEmployeeSync(dependencies);
        assert.equal(result.queued, false);
        assert.equal(result.status, 400);
        assert.equal(calls.device.length, 0);
        assert.equal(calls.queued.length, 0);
    }
});

test('blocks unverified device capabilities and devices from another organization', async () => {
    for (const device of [
        { serialNumber, organizationId, supportsUserSyncCommands: false },
        { serialNumber: 'OTHER-DEVICE', organizationId, supportsUserSyncCommands: true },
        { serialNumber, organizationId: 'other-school', supportsUserSyncCommands: true },
        null
    ]) {
        const { dependencies, calls } = createQueueDependencies({
            loadDevice: async () => device
        });
        const result = await queueManualEmployeeSync(dependencies);
        assert.equal(result.queued, false);
        assert.ok([404, 409].includes(result.status));
        assert.equal(calls.queued.length, 0);
    }
});

test('poll filter and eligibility are scoped to one device, organization, and new explicit-request marker', () => {
    assert.deepEqual(getManualTestPollFilter(serialNumber, organizationId), {
        organizationId,
        serialNumber,
        manualTest: true,
        manualRequestVersion: 1,
        commandType: COMMAND_TYPES.UPDATE_USER
    });
    assert.equal(getManualTestPollFilter('', organizationId), null);
    assert.equal(getManualTestPollFilter(serialNumber, ''), null);

    const validCommand = {
        organizationId,
        serialNumber,
        manualTest: true,
        manualRequestVersion: 1,
        commandType: COMMAND_TYPES.UPDATE_USER
    };
    assert.equal(isManualTestCommandEligible(validCommand, serialNumber, organizationId), true);
    assert.equal(isManualTestCommandEligible({ ...validCommand, manualRequestVersion: 0 }, serialNumber, organizationId), false);
    assert.equal(isManualTestCommandEligible({ ...validCommand, serialNumber: 'OTHER' }, serialNumber, organizationId), false);
    assert.equal(isManualTestCommandEligible({ ...validCommand, organizationId: 'other' }, serialNumber, organizationId), false);
    assert.equal(isManualTestCommandEligible({ ...validCommand, commandType: COMMAND_TYPES.DELETE_USER }, serialNumber, organizationId), false);
});

test('manual command builder never grants manager privilege or generates deletion commands', () => {
    const command = buildManualTestUserUpdateCommand(employee);
    assert.equal(command.commandType, COMMAND_TYPES.UPDATE_USER);
    assert.equal(command.privilege, 0);
    assert.match(command.commandPayload, /\tPri=0\t/);
    assert.doesNotMatch(command.commandPayload, /DELETE/);
});

test('device return code maps to acknowledged success or failure', () => {
    assert.equal(getCommandAcknowledgementStatus(0), 'SUCCESS');
    assert.equal(getCommandAcknowledgementStatus(-1), 'FAILED');
    assert.equal(getCommandAcknowledgementStatus(1), 'FAILED');
});

test('legacy commands default to non-deliverable marker and new commands can store active deduplication keys', () => {
    const base = {
        organizationId,
        serialNumber,
        commandId: 31,
        commandType: COMMAND_TYPES.UPDATE_USER,
        commandPayload: 'DATA UPDATE USERINFO PIN=202\tName=Subina Subedi\tPri=0',
        employeeReference: employee._id,
        deviceCode: '202'
    };
    assert.equal(new EmployeeAttendanceDeviceCommand(base).manualRequestVersion, 0);
    const manual = new EmployeeAttendanceDeviceCommand({
        ...base,
        manualTest: true,
        manualRequestVersion: 1,
        activeCommandKey: 'key'
    }).toObject();
    assert.equal(manual.manualRequestVersion, 1);
    assert.equal(manual.activeCommandKey, 'key');
});

test('employee create, update, import, and deactivate contain no automatic device sync trigger', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'controller', 'employeeController', 'employeeController.js'), 'utf8');
    assert.doesNotMatch(source, /safelyQueueEmployeeSync|queueEmployeeForConfiguredDevices/);
    assert.match(source, /serialNumber: req\.body\?\.serialNumber/);
    assert.match(source, /supportsUserSyncCommands !== true/);
});
