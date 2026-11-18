const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const test = require('node:test');
const {
    parseAdmsUserInfo,
    summarizeAdmsUserQuery,
    getAdmsQueryCommand,
    claimAdmsUserQueryForDelivery,
    isCompletePacketSequence
} = require('../utils/employeeAdmsUserQuery');

test('builds only the two read-only device-user query command forms', () => {
    assert.equal(getAdmsQueryCommand('legacy', 123), 'C:123:DATA QUERY USERINFO');
    assert.equal(getAdmsQueryCommand('push', 124), 'C:124:DATA QUERY tablename=user,fielddesc=*,filter=*');
    assert.throws(() => getAdmsQueryCommand('unsupported', 125));
});

test('claims a pending query once so repeated device polls cannot resend it', async () => {
    const query = { _id: 'aes:MFP3244700592', commandId: 123, status: 'PENDING' };
    let status = 'PENDING';
    const model = {
        findOneAndUpdate(filter, update) {
            assert.deepEqual(filter, { _id: query._id, status: 'PENDING', commandId: 123 });
            return {
                lean: async () => {
                    if (status !== 'PENDING') return null;
                    status = update.$set.status;
                    return { ...query, ...update.$set };
                }
            };
        }
    };

    const first = await claimAdmsUserQueryForDelivery(model, query, new Date());
    const second = await claimAdmsUserQueryForDelivery(model, query, new Date());

    assert.equal(first.status, 'SENT');
    assert.equal(second, null);
    assert.equal(status, 'SENT');
});

test('parses tabular USERINFO records, headers, privilege, card, and additional fields', () => {
    const users = parseAdmsUserInfo(
        'PIN\tName\tPri\tPasswd\tCardNo\tGrp\tTZ\r\n001\tA User\t0\tsecret\t9988\t1\t0'
    );

    assert.equal(users.length, 1);
    assert.equal(users[0].pin, '001');
    assert.equal(users[0].name, 'A User');
    assert.equal(users[0].privilege, '0');
    assert.equal(users[0].cardNumber, '9988');
    assert.equal(users[0].other.passwd, 'secret');
    assert.equal(users[0].other.grp, '1');
});

test('parses key-value USERINFO rows used by alternate ADMS payload variants', () => {
    const users = parseAdmsUserInfo('PIN=003\tName=Another User\tPrivilege=3\tCardNo=7788\tTZ=0');

    assert.equal(users.length, 1);
    assert.equal(users[0].pin, '003');
    assert.equal(users[0].name, 'Another User');
    assert.equal(users[0].privilege, '3');
    assert.equal(users[0].cardNumber, '7788');
    assert.equal(users[0].other.tz, '0');
});

test('assembles users across response packets and reports duplicate PIN entries', () => {
    const query = {
        packets: [
            { parsePayload: '001\tAlice\t0\t\t1001' },
            { parsePayload: '001\tAlice duplicate\t0\t\t1001\r\n002\tBob\t3\t\t1002' }
        ]
    };
    const summary = summarizeAdmsUserQuery(query);

    assert.equal(summary.totalUsersReceived, 3);
    assert.equal(summary.uniquePins, 2);
    assert.equal(summary.duplicateEntries, 1);
    assert.deepEqual(summary.users.map(user => user.pin), ['001', '002']);
});

test('detects complete packet sequences independent of zero- or one-based indexes', () => {
    assert.equal(isCompletePacketSequence([
        { packetIndex: 0, packetCount: 2 },
        { packetIndex: 1, packetCount: 2 }
    ]), true);
    assert.equal(isCompletePacketSequence([
        { packetIndex: 1, packetCount: 2 }
    ]), false);
    assert.equal(isCompletePacketSequence([
        { packetIndex: 1, packetCount: 2 },
        { packetIndex: 2, packetCount: 2 }
    ]), true);
    assert.equal(isCompletePacketSequence([
        { packetIndex: 0, packetCount: 2 },
        { packetIndex: 2, packetCount: 2 }
    ]), false);
});

test('preserves querydata text, URL-encoded, and raw request bodies', async t => {
    const app = express();
    app.use('/iclock/querydata', express.text({ type: () => true, limit: '128kb' }));
    app.post('/iclock/querydata', (req, res) => res.json({ body: req.body, isString: typeof req.body === 'string' }));
    const server = app.listen(0);
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });

    const send = (contentType, body) => new Promise((resolve, reject) => {
        const headers = contentType ? { 'Content-Type': contentType } : {};
        const request = http.request({
            hostname: '127.0.0.1',
            port: server.address().port,
            path: '/iclock/querydata?SN=MFP3244700592&type=tabledata&cmdid=21&tablename=user&packcnt=2&packidx=0',
            method: 'POST',
            headers
        }, resolve);
        request.on('error', reject);
        request.end(body);
    });
    const read = async response => {
        let body = '';
        for await (const chunk of response) body += chunk;
        return { statusCode: response.statusCode, payload: JSON.parse(body) };
    };
    const raw = '001\tAlice\t0\t\t1001';
    const plain = await read(await send('text/plain', raw));
    const encodedBody = 'data=' + encodeURIComponent(raw);
    const form = await read(await send('application/x-www-form-urlencoded', encodedBody));
    const binary = await read(await send('application/octet-stream', raw));
    const noContentType = await read(await send('', raw));

    assert.equal(plain.statusCode, 200);
    assert.deepEqual(plain.payload, { body: raw, isString: true });
    assert.deepEqual(form.payload, { body: encodedBody, isString: true });
    assert.deepEqual(binary.payload, { body: raw, isString: true });
    assert.deepEqual(noContentType.payload, { body: raw, isString: true });
});

test('accepts a legacy cdata body with no content-type header as raw text', async t => {
    const app = express();
    app.use('/iclock/cdata', (req, res, next) => {
        if (req.headers['content-type']) return next();
        return express.raw({ type: () => true, limit: '1mb' })(req, res, next);
    });
    app.use('/iclock/cdata', express.text({
        type: ['text/plain', 'application/octet-stream', 'application/x-www-form-urlencoded']
    }));
    app.post('/iclock/cdata', (req, res) => {
        const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
        res.json({ body });
    });
    const server = app.listen(0);
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });

    const content = '001\tAlice\t0\t\t1001';
    const response = await new Promise((resolve, reject) => {
        const request = http.request({
            hostname: '127.0.0.1',
            port: server.address().port,
            path: '/iclock/cdata?SN=MFP3244700592&table=USERINFO',
            method: 'POST'
        }, resolve);
        request.on('error', reject);
        request.end(content);
    });
    let responseBody = '';
    for await (const chunk of response) responseBody += chunk;

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(responseBody), { body: content });
});
