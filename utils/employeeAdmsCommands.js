const COMMAND_TYPES = Object.freeze({
    UPDATE_USER: 'USERINFO_UPDATE',
    DELETE_USER: 'USERINFO_DELETE'
});

const normalizeAdmsPin = value => String(value || '').trim();
const isValidAdmsPin = value => /^[A-Za-z0-9._-]{1,40}$/.test(normalizeAdmsPin(value));
const cleanAdmsName = value => String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

function buildUserInfoUpdateCommand({ deviceCode, staffName, isManager }) {
    const pin = normalizeAdmsPin(deviceCode);
    const name = cleanAdmsName(staffName);
    if (!isValidAdmsPin(pin)) throw new Error('Device code must contain only letters, numbers, period, underscore, or hyphen.');
    if (!name) throw new Error('Employee name is required for device synchronization.');
    const privilege = isManager ? 14 : 0;
    return {
        commandType: COMMAND_TYPES.UPDATE_USER,
        privilege,
        commandPayload: `DATA UPDATE USERINFO PIN=${pin}\tName=${name}\tPri=${privilege}\tPasswd=\tCard=\tGrp=1\tTZ=0001000100000000\tVerify=0`
    };
}

function buildUserInfoDeleteCommand(deviceCode) {
    const pin = normalizeAdmsPin(deviceCode);
    if (!isValidAdmsPin(pin)) throw new Error('Device code must contain only letters, numbers, period, underscore, or hyphen.');
    return {
        commandType: COMMAND_TYPES.DELETE_USER,
        commandPayload: `DATA DELETE USERINFO PIN=${pin}`
    };
}

function parseDeviceCommandResult(value) {
    let fields = {};
    if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
        fields = Object.fromEntries(Object.entries(value).map(([key, item]) => [key.toLowerCase(), String(item ?? '')]));
    } else {
        const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value || '');
        text.split(/[&\r\n]+/).forEach(part => {
            const separator = part.indexOf('=');
            if (separator <= 0) return;
            const key = part.slice(0, separator).trim().toLowerCase();
            const rawValue = part.slice(separator + 1).trim();
            try {
                fields[key] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
            } catch (error) {
                fields[key] = rawValue;
            }
        });
    }

    const commandId = Number(fields.id ?? fields.commandid ?? fields.cmdid);
    const returnCode = Number(fields.return ?? fields.returncode ?? fields.code);
    if (!Number.isSafeInteger(commandId) || commandId < 1 || !Number.isInteger(returnCode)) return null;
    return {
        commandId,
        returnCode,
        command: String(fields.cmd ?? fields.command ?? '').slice(0, 500),
        responsePayload: (Buffer.isBuffer(value) ? value.toString('utf8') : typeof value === 'string' ? value : JSON.stringify(value || {})).slice(0, 8000)
    };
}

function formatAdmsCommandResponse(command) {
    if (!command || !Number.isSafeInteger(Number(command.commandId)) || Number(command.commandId) < 1) {
        throw new Error('A valid numeric ADMS command ID is required.');
    }
    const payload = String(command.commandPayload || '').replace(/[\r\n]/g, ' ').trim();
    if (!payload) throw new Error('ADMS command payload is empty.');
    return `C:${Number(command.commandId)}:${payload}\r\n`;
}

module.exports = {
    COMMAND_TYPES,
    buildUserInfoDeleteCommand,
    buildUserInfoUpdateCommand,
    cleanAdmsName,
    formatAdmsCommandResponse,
    isValidAdmsPin,
    normalizeAdmsPin,
    parseDeviceCommandResult
};
