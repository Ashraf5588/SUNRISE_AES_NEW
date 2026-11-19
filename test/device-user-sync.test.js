const assert = require('node:assert/strict');
const test = require('node:test');
const DeviceCommand = require('../model/employeeSchema/deviceCommandSchema').DeviceCommand;
const DeviceUser = require('../model/employeeSchema/deviceUserSchema');
const {
    DEVICE_USER_QUERY_COMMAND,
    parseDeviceUserLines,
    normalizeSelectedPins,
    pinMatchesExactCaseInsensitive
} = require('../utils/deviceUserSync');

test('parses only USER records from OPERLOG/USERINFO payloads', () => {
    const users = parseDeviceUserLines([
        'OPLOG USER PIN=999\tName=Ignored',
        'FP PIN=500\tName=Ignored',
        'USER PIN=105\tName=John Doe\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000',
        'USER PIN=108\tName=Jane Doe\tPri=0',
        'USER PIN=105\tName=Updated Name\tPri=0'
    ].join('\r\n'));

    assert.deepEqual(users, [
        { pin: '105', name: 'Updated Name' },
        { pin: '108', name: 'Jane Doe' }
    ]);
});

test('validates and de-duplicates selected PINs without changing their values', () => {
    assert.deepEqual(normalizeSelectedPins(['105', ' 108 ', '105']), ['105', '108']);
    assert.equal(normalizeSelectedPins([]), null);
    assert.equal(normalizeSelectedPins(['']), null);
    assert.equal(normalizeSelectedPins(['bad/pin']), null);
    assert.equal(normalizeSelectedPins('105'), null);
    assert.equal(pinMatchesExactCaseInsensitive('Ab.1').test('ab.1'), true);
    assert.equal(DEVICE_USER_QUERY_COMMAND, 'DATA QUERY USERINFO');
});

test('uses separate staging and command collections with unique device/PIN keys', () => {
    assert.equal(DeviceCommand.collection.collectionName, 'device_commands');
    assert.equal(DeviceUser.collection.collectionName, 'device_users');
    assert.ok(DeviceUser.schema.indexes().some(([keys, options]) =>
        keys.device_sn === 1 && keys.pin === 1 && options.unique === true
    ));
    assert.ok(DeviceCommand.schema.indexes().some(([keys, options]) =>
        keys.active_key === 1 && options.unique === true
    ));
});
