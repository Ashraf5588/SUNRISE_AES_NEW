# Employee attendance device sync

## What the manual action does

The employee attendance page lists ZKTeco serial numbers that have contacted `/iclock/cdata`. **Check Connection** refreshes the latest request recorded by the server for a device. It is not a direct network ping: a new request appears only after the terminal contacts the configured ADMS endpoint. **Monitor Incoming Device Records** starts a ten-minute monitoring window for the selected serial number. It does not send a command to the terminal. The status and counts come from ATTLOG requests actually received and processed during that window.

The page shows the most recently processed successful batch separately from historical synchronization completion. ADMS does not provide a completion signal in the implementation currently present in this project, so the page deliberately reports historical sync completion as unverified. A quiet device or an empty window is not proof that there are no pending records.

For historical recovery, use only the export or retransmission procedure documented for the exact terminal model and firmware. If the terminal can export attendance as CSV, upload that file through the existing attendance CSV import. Verify the resulting records before clearing or deleting anything on the terminal.

## Protocol and device limitations

The existing implementation responds to `GET /iclock/cdata?SN=...` with device options and accepts attendance through `POST /iclock/cdata?SN=...&table=ATTLOG`. A separate device-user query queue now supports `DATA QUERY USERINFO`; it is not an attendance-history or punch-replay endpoint. The connected device model and firmware, its vendor manual, and a packet capture are not present in the repository. Therefore this project cannot confirm whether that terminal supports historical replay, how it retries after network failure, or whether a particular ADMS command can request old punches.

## Temporary read-only device-user diagnostic

The admin-only page `/employeeattendance/device-users` is restricted to organization `aes` and serial `MFP3244700592`. It exposes one query attempt, after an administrator chooses and confirms the protocol supported by that exact device and firmware:

- Legacy: `DATA QUERY USERINFO`, captured from `POST /iclock/cdata?SN=...&table=USERINFO`.
- PUSH: `DATA QUERY tablename=user,fielddesc=*,filter=*`, captured from `POST /iclock/querydata?SN=...&type=tabledata&cmdid=...&tablename=user`.

The command is delivered once on a normal device `/iclock/getrequest` poll. It is not stored in the employee command queue; the poll atomically changes the diagnostic session from `PENDING` to `SENT`, and subsequent polls do not resend it. No query is sent until the protocol is selected and both read-only/compatibility confirmations are checked. Do not select a protocol based on guesswork. The selected protocol is used to accept only its matching response endpoint.

Responses and packet metadata are stored only in the temporary `employeeAdmsUserQueries` collection. The query times out after 15 minutes; the diagnostic record expires after 30 days. A response without packet-count metadata is considered complete after five quiet seconds. If packet-count metadata is present but packet indexes do not complete the sequence, the session is marked failed. Each packet is limited to 128 KiB, the response to 256 packets and 5 MiB total. There is no automatic command retry; an uncertain attempt remains recorded and the one-time diagnostic will not issue another query.

The page displays parsed PIN, name, privilege, card number, other fields, duplicate PIN entries, packet count, status, and escaped raw payloads. CSV export is available from the page. These results are not imported, reconciled, or compared with employee or attendance records.

Start the application using the repository's existing listeners:

```powershell
node app.js
```

Sign in as an administrator in the `aes` organization, open `http://<application-host>/employeeattendance/device-users`, verify the protocol for this exact MB2000 firmware, select it, acknowledge both confirmation boxes, and click **Retrieve Device Users**. The device must be online and polling the configured ADMS endpoint. To inspect the raw session from a Windows terminal with `mongosh` and `MONGODB_URI` set:

```powershell
mongosh $env:MONGODB_URI --quiet --eval "printjson(db.employeeAdmsUserQueries.findOne({_id:'aes:MFP3244700592'}))"
```

The temporary diagnostic page only displays its session data and never imports it. A separate administrator-only staging workflow is available on `/employeeattendance`: **Fetch Users from Device** queues `DATA QUERY USERINFO`, while `GET /api/devices/:sn/pending-users` reports staged users parsed from `USER ` rows received through `/iclock/cdata?table=OPERLOG` or `table=USERINFO`. Device commands are kept in `device_commands`; staging rows are kept in `device_users` with a unique device/PIN pair. API requests require an authenticated administrator, organization-owned registered device, and a CSRF token from the attendance page.

The UI lets an administrator select pending PINs and explicitly create staff records for those selections only. The import maps PIN to both `employeeCode` and `deviceCode` (the latter is used by attendance PIN matching) and maps the device name to `staffName`; remaining `staff` fields use schema defaults. A matching existing employee code is marked imported without changing the existing staff record. A device-code collision with another employee is reported and left pending. Unselected staging records stay pending. Imported staff records are not automatically created from ADMS traffic.

The endpoints are `POST /api/devices/:sn/sync-users`, `GET /api/devices/:sn/pending-users`, and `POST /api/devices/:sn/import-users` with a JSON `{ "pins": ["..."] }` body. The query queue only sends once per outstanding command and waits for `/iclock/devicecmd` acknowledgement before another can be queued. Device/user staging remains organization-scoped using the registered device serial and the current application database organization.

To disable the staging/import workflow, remove those three `/api/devices/...` routes and their `/employeeattendance` UI controls, the `DeviceCommand`/`DeviceUser` models, their controller handlers, and `utils/deviceUserSync.js`. Preserve the existing ADMS polling, `USERINFO` diagnostic, and ATTLOG logic unless those features are separately being removed. After exporting any needed data, remove only `device_commands` and/or `device_users` if their data should also be deleted. Command IDs use the existing per-device counter but remain in their separate `device_commands` collection. The selective import intentionally creates records in `staff` only when an administrator submits selected PINs; attendance records are not modified by the import.

`ATTLOGStamp=9999` is retained unchanged to avoid disrupting the currently working GET integration. Its meaning and suitability for this terminal have not been verified. Do not treat it as a historical replay request or change it to another value without vendor documentation and a test against the exact device and firmware.

The receiver returns a non-success HTTP response when a batch is invalid or could not be fully saved, and successful records are idempotent so retransmission is safe. Whether the terminal retains and retries such a batch is device/firmware-specific and must be tested on the physical terminal. Attendance records are never deleted by this feature.

## Device status and record handling

- A serial number from the `SN` query parameter is upserted when GET or POST cdata requests arrive; its display name defaults to `ZKTeco device <serial>`.
- Online/offline is calculated from `lastActivity` and `EMPLOYEE_DEVICE_ONLINE_TIMEOUT_MS` (five minutes by default). This is only recent HTTP activity, not a live probe or proof that the physical terminal originated the request. Existing saved attendance is retained if the device later appears offline; historic records alone do not prove a current connection.
- Requests whose User-Agent resembles curl, Postman, PowerShell, Python requests, or common Node clients are marked `likely_simulated`; other requests are `unverified`. User-Agent cannot prove a request came from the physical terminal.
- Device metadata records last activity, attendance receipt time, total non-empty records received, records inserted, request type, request result, source classification, User-Agent, and remote address. Empty ATTLOG requests update activity and receipt metadata but add zero to record totals.
- A record identity uses the device serial, PIN, punch time, status, and verification mode. A sparse unique event-key index protects new records, and logical matching avoids duplicating older records that predate the key.
- Unknown PINs are retained as attendance records, preserving the existing employee-code mapping behavior. Dates are not restricted to the current day.
- Invalid rows and database write failures are counted and logged without logging employee PINs or names. A batch that is not fully processed is not acknowledged as successful.

## Physical-device verification still required

Use the device's reported model and firmware and its vendor documentation to determine whether it supports stored-punch retransmission, local export, or an ADMS historical-data feature. On a safe test device, verify normal punches, delayed/old punches, duplicate delivery, offline/reconnection behavior, and the device's response to a server error before relying on automatic retries. The application cannot assert that a manual sync recovered pending history until a supported device procedure is confirmed and the received records are reconciled.
