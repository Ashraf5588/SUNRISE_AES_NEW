const assert = require('node:assert/strict');
const test = require('node:test');
const {
    COMMAND_TYPES,
    buildUserInfoDeleteCommand,
    buildUserInfoUpdateCommand,
    formatAdmsCommandResponse,
    isValidAdmsPin,
    parseDeviceCommandResult
} = require('../utils/employeeAdmsCommands');

test('builds a normal USERINFO update with no administrator privilege', () => {
    const command = buildUserInfoUpdateCommand({
        deviceCode: 'PIN-42',
        staffName: 'Asha Rai',
        isManager: false
    });

    assert.equal(command.commandType, COMMAND_TYPES.UPDATE_USER);
    assert.equal(command.privilege, 0);
    assert.match(command.commandPayload, /^DATA UPDATE USERINFO PIN=PIN-42\tName=Asha Rai\tPri=0/);
});

test('builds manager privilege only when the employee is explicitly a manager', () => {
    assert.equal(buildUserInfoUpdateCommand({
        deviceCode: 'PIN-43',
        staffName: 'Manager',
        isManager: true
    }).privilege, 14);
});

test('validates device PINs and creates the community ADMS wire response format', () => {
    assert.equal(isValidAdmsPin('0012-A'), true);
    assert.equal(isValidAdmsPin('pin/12'), false);
    assert.throws(() => buildUserInfoDeleteCommand('bad pin'));
    assert.equal(
        formatAdmsCommandResponse({ commandId: 17, commandPayload: 'DATA DELETE USERINFO PIN=0012' }),
        'C:17:DATA DELETE USERINFO PIN=0012\r\n'
    );
});

test('sanitizes line separators from employee names before building commands', () => {
    const command = buildUserInfoUpdateCommand({
        deviceCode: 'PIN-44',
        staffName: 'Asha\tRai\nDATA DELETE USERINFO PIN=all',
        isManager: false
    });

    assert.equal(command.commandPayload.includes('\n'), false);
    assert.equal(command.commandPayload.includes('DATA DELETE USERINFO PIN=all'), true);
    assert.match(command.commandPayload, /Name=Asha Rai DATA DELETE USERINFO PIN=all\tPri=0/);
});

test('parses device result bodies and rejects incomplete or invalid acknowledgements', () => {
    assert.deepEqual(parseDeviceCommandResult('ID=17&Return=0&CMD=DATA%20UPDATE%20USERINFO'), {
        commandId: 17,
        returnCode: 0,
        command: 'DATA UPDATE USERINFO',
        responsePayload: 'ID=17&Return=0&CMD=DATA%20UPDATE%20USERINFO'
    });
    assert.deepEqual(parseDeviceCommandResult({ SN: 'DEVICE-1', ID: '18', Return: '0', CMD: 'DATA UPDATE USERINFO' }), {
        commandId: 18,
        returnCode: 0,
        command: 'DATA UPDATE USERINFO',
        responsePayload: JSON.stringify({ SN: 'DEVICE-1', ID: '18', Return: '0', CMD: 'DATA UPDATE USERINFO' })
    });
    assert.equal(parseDeviceCommandResult('ID=17'), null);
    assert.equal(parseDeviceCommandResult('ID=nope&Return=0&CMD=USERINFO'), null);
    assert.equal(parseDeviceCommandResult({ id: 17, return: -1, cmd: 'USERINFO' }).returnCode, -1);
});
