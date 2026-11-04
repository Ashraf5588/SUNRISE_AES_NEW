const assert = require('node:assert/strict');
const test = require('node:test');
const {
    MANUAL_SYNC_TEST_SERIAL_NUMBER,
    buildManualTestUserUpdateCommand,
    getCommandAcknowledgementStatus,
    getManualTestPollFilter,
    isManualAdmsSyncTestEnabled,
    queueManualEmployeeSyncTest
} = require('../utils/employeeAdmsManualSync');
const { COMMAND_TYPES } = require('../utils/employeeAdmsCommands');

const employee = {
    _id: '507f1f77bcf86cd799439011',
    staffName: 'Subina Subedi',
    deviceCode: '202',
    isActive: true,
    employmentStatus: 'Active',
    isManager: true
};
const organizationId = 'school-test';

function createQueueDependencies(overrides = {}) {
    const calls = { employee: 0, device: [], queued: [] };
    const dependencies = {
        employeeId: employee._id,
        requestedBy: 'test-admin',
        isEnabled: true,
        isValidEmployeeId: value => value === employee._id,
        organizationId,
        loadEmployee: async () => {
            calls.employee += 1;
            return employee;
        },
        loadDevice: async (currentOrganizationId, serialNumber) => {
            calls.device.push({ currentOrganizationId, serialNumber });
            return {
                organizationId: currentOrganizationId,
                serialNumber,
                supportsUserSyncCommands: false,
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

test('manual test switch defaults off and accepts only explicit true', () => {
    assert.equal(isManualAdmsSyncTestEnabled('false'), false);
    assert.equal(isManualAdmsSyncTestEnabled(''), false);
    assert.equal(isManualAdmsSyncTestEnabled('true'), true);
});

test('disabled manual test rejects before loading employee or device', async () => {
    const { dependencies, calls } = createQueueDependencies({ isEnabled: false });
    const result = await queueManualEmployeeSyncTest(dependencies);

    assert.equal(result.queued, false);
    assert.equal(result.status, 403);
    assert.match(result.message, /disabled/i);
    assert.equal(calls.employee, 0);
    assert.equal(calls.device.length, 0);
});

test('manual test queue remains isolated from the disabled global queue switch', async () => {
    const previousGlobal = process.env.EMPLOYEE_ADMS_COMMANDS_ENABLED;
    const previousManual = process.env.EMPLOYEE_ADMS_MANUAL_SYNC_TEST_ENABLED;
    process.env.EMPLOYEE_ADMS_COMMANDS_ENABLED = 'false';
    process.env.EMPLOYEE_ADMS_MANUAL_SYNC_TEST_ENABLED = 'true';
    try {
        const { dependencies, calls } = createQueueDependencies({
            isEnabled: isManualAdmsSyncTestEnabled()
        });
        const result = await queueManualEmployeeSyncTest(dependencies);
        assert.equal(result.queued, true);
        assert.equal(calls.queued.length, 1);
        assert.deepEqual(calls.queued[0][4], { manualTest: true });
    } finally {
        if (previousGlobal === undefined) delete process.env.EMPLOYEE_ADMS_COMMANDS_ENABLED;
        else process.env.EMPLOYEE_ADMS_COMMANDS_ENABLED = previousGlobal;
        if (previousManual === undefined) delete process.env.EMPLOYEE_ADMS_MANUAL_SYNC_TEST_ENABLED;
        else process.env.EMPLOYEE_ADMS_MANUAL_SYNC_TEST_ENABLED = previousManual;
    }
});

test('invalid employee references are rejected before database access', async () => {
    const { dependencies, calls } = createQueueDependencies({
        employeeId: 'invalid',
        isValidEmployeeId: () => false
    });
    const result = await queueManualEmployeeSyncTest(dependencies);

    assert.equal(result.queued, false);
    assert.equal(result.status, 400);
    assert.equal(calls.employee, 0);
    assert.equal(calls.device.length, 0);
});

test('manual queue only sends a privilege-zero update to the fixed device when global mode is disabled', async () => {
    const { dependencies, calls } = createQueueDependencies();
    const result = await queueManualEmployeeSyncTest(dependencies);

    assert.equal(result.queued, true);
    assert.equal(result.status, 202);
    assert.deepEqual(calls.device, [{
        currentOrganizationId: organizationId,
        serialNumber: MANUAL_SYNC_TEST_SERIAL_NUMBER
    }]);
    const [device, queuedEmployee, command, requestedBy, options] = calls.queued[0];
    assert.equal(device.serialNumber, MANUAL_SYNC_TEST_SERIAL_NUMBER);
    assert.equal(queuedEmployee._id, employee._id);
    assert.equal(command.commandType, COMMAND_TYPES.UPDATE_USER);
    assert.equal(command.deviceCode, '202');
    assert.equal(command.privilege, 0);
    assert.match(command.commandPayload, /PIN=202\tName=Subina Subedi\tPri=0/);
    assert.equal(requestedBy, 'test-admin');
    assert.deepEqual(options, { manualTest: true });
    assert.equal(Object.hasOwn(command, 'DELETE_USER'), false);
});

test('rejects invalid PINs and inactive employees before device lookup', async () => {
    for (const invalidEmployee of [
        { ...employee, deviceCode: '20 2' },
        { ...employee, isActive: false },
        { ...employee, employmentStatus: 'Terminated' }
    ]) {
        const { dependencies, calls } = createQueueDependencies({
            loadEmployee: async () => invalidEmployee
        });
        const result = await queueManualEmployeeSyncTest(dependencies);
        assert.equal(result.queued, false);
        assert.equal(result.status, 400);
        assert.equal(calls.device.length, 0);
        assert.equal(calls.queued.length, 0);
    }
});

test('rejects unknown devices and devices from another organization', async () => {
    for (const device of [
        null,
        { serialNumber: 'OTHER-DEVICE', organizationId },
        { serialNumber: MANUAL_SYNC_TEST_SERIAL_NUMBER, organizationId: 'other-school' }
    ]) {
        const { dependencies, calls } = createQueueDependencies({
            loadDevice: async () => device
        });
        const result = await queueManualEmployeeSyncTest(dependencies);
        assert.equal(result.queued, false);
        assert.equal(result.status, 404);
        assert.equal(calls.queued.length, 0);
    }
});

test('manual polling is limited to the configured serial and update commands marked for manual tests', () => {
    assert.deepEqual(getManualTestPollFilter(MANUAL_SYNC_TEST_SERIAL_NUMBER), {
        manualTest: true,
        commandType: COMMAND_TYPES.UPDATE_USER
    });
    assert.equal(getManualTestPollFilter('OTHER-DEVICE'), null);
});

test('manual update builder always uses privilege zero and never creates delete commands', () => {
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
