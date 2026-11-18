const MAX_PACKET_BYTES = 131072;
const MAX_PACKET_COUNT = 256;
const MAX_QUERY_BYTES = 5242880;
const QUERY_TIMEOUT_MS = 15 * 60 * 1000;
const PACKET_SETTLE_MS = 5000;

const userFields = [
    'pin',
    'name',
    'privilege',
    'password',
    'cardNumber',
    'group',
    'timeZone',
    'userType',
    'verifyMode',
    'phone',
    'startDate',
    'endDate'
];

function splitUserInfoLine(line, delimiter) {
    const values = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') {
            if (quoted && line[index + 1] === '"') {
                value += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === delimiter && !quoted) {
            values.push(value.trim());
            value = '';
        } else {
            value += character;
        }
    }
    values.push(value.trim());
    return values;
}

function normalizeHeader(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseKeyValueUser(values) {
    const fields = {};
    values.forEach(value => {
        const separator = value.indexOf('=');
        if (separator <= 0) return;
        fields[normalizeHeader(value.slice(0, separator))] = value.slice(separator + 1).trim();
    });
    const pin = fields.pin || fields.userid || fields.userpin;
    const name = fields.name || fields.username;
    const hasName = Object.prototype.hasOwnProperty.call(fields, 'name')
        || Object.prototype.hasOwnProperty.call(fields, 'username');
    if (!pin || !hasName || pin.length > 64) return null;
    const user = {
        pin,
        name,
        privilege: fields.pri || fields.privilege || fields.privilegelevel || '',
        cardNumber: fields.cardno || fields.cardnumber || fields.card || '',
        other: {}
    };
    Object.entries(fields).forEach(([key, value]) => {
        if (!['pin', 'userid', 'userpin', 'name', 'username', 'pri', 'privilege', 'privilegelevel', 'cardno', 'cardnumber', 'card'].includes(key)) {
            user.other[key] = value;
        }
    });
    return user;
}

function parseAdmsUserInfo(payload) {
    const rows = [];
    let header = null;
    const lines = String(payload || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const delimiter = trimmed.includes('\t') ? '\t' : ',';
        const values = splitUserInfoLine(trimmed, delimiter);
        if (values.some(value => /^(?:PIN|UserID|Name|Pri|Privilege|CardNo)\s*=/i.test(value))) {
            const user = parseKeyValueUser(values);
            if (user) rows.push(user);
            return;
        }
        const normalized = values.map(normalizeHeader);
        if (normalized.some(value => ['pin', 'userid', 'userpin'].includes(value))
            && normalized.some(value => ['name', 'username'].includes(value))) {
            header = normalized;
            return;
        }

        const pinIndex = header
            ? header.findIndex(value => ['pin', 'userid', 'userpin'].includes(value))
            : 0;
        const nameIndex = header
            ? header.findIndex(value => ['name', 'username'].includes(value))
            : 1;
        const privilegeIndex = header
            ? header.findIndex(value => ['pri', 'privilege', 'privilegelevel'].includes(value))
            : 2;
        const cardIndex = header
            ? header.findIndex(value => ['cardno', 'cardnumber', 'card'].includes(value))
            : 4;
        const pin = values[pinIndex];
        if (!pin || pin.length > 64 || values.length < 2) return;

        const user = {
            pin,
            name: values[nameIndex] || '',
            privilege: values[privilegeIndex] || '',
            cardNumber: values[cardIndex] || '',
            other: {}
        };
        userFields.forEach((field, index) => {
            if (index < values.length && !['pin', 'name', 'privilege', 'cardNumber'].includes(field)) {
                user.other[field] = values[index];
            }
        });
        if (header) {
            header.forEach((key, index) => {
                if (key && index < values.length && !['pin', 'userid', 'userpin', 'name', 'username', 'pri', 'privilege', 'privilegelevel', 'cardno', 'cardnumber', 'card'].includes(key)) {
                    user.other[key] = values[index];
                }
            });
        }
        rows.push(user);
    });
    return rows;
}

function summarizeAdmsUserQuery(query) {
    const users = [];
    const seenPins = new Set();
    let totalUsersReceived = 0;
    let duplicateEntries = 0;
    const packets = Array.isArray(query?.packets) ? query.packets : [];
    packets.forEach(packet => {
        parseAdmsUserInfo(packet.parsePayload || packet.rawPayload).forEach(user => {
            totalUsersReceived += 1;
            if (seenPins.has(user.pin)) {
                duplicateEntries += 1;
                return;
            }
            seenPins.add(user.pin);
            users.push(user);
        });
    });
    return {
        users,
        totalUsersReceived,
        uniquePins: seenPins.size,
        duplicateEntries,
        packetCount: packets.length
    };
}

function getAdmsQueryCommand(protocol, commandId) {
    if (protocol === 'legacy') return `C:${commandId}:DATA QUERY USERINFO`;
    if (protocol === 'push') return `C:${commandId}:DATA QUERY tablename=user,fielddesc=*,filter=*`;
    throw new Error('Unsupported device-user query protocol.');
}

async function claimAdmsUserQueryForDelivery(queryModel, query, sentAt) {
    return queryModel.findOneAndUpdate(
        { _id: query._id, status: 'PENDING', commandId: query.commandId },
        { $set: { status: 'SENT', sentAt } },
        { new: true }
    ).lean();
}

function isCompletePacketSequence(packets) {
    const expected = packets.reduce((maximum, packet) => Math.max(maximum, Number(packet.packetCount) || 0), 0);
    if (!expected) return false;
    const received = new Set(packets
        .filter(packet => Number.isInteger(packet.packetIndex))
        .map(packet => packet.packetIndex));
    if (received.size !== expected) return false;
    const zeroBased = Array.from({ length: expected }, (_, index) => index).every(index => received.has(index));
    const oneBased = Array.from({ length: expected }, (_, index) => index + 1).every(index => received.has(index));
    return zeroBased || oneBased;
}

module.exports = {
    MAX_PACKET_BYTES,
    MAX_PACKET_COUNT,
    MAX_QUERY_BYTES,
    QUERY_TIMEOUT_MS,
    PACKET_SETTLE_MS,
    parseAdmsUserInfo,
    summarizeAdmsUserQuery,
    getAdmsQueryCommand,
    claimAdmsUserQueryForDelivery,
    isCompletePacketSequence
};
