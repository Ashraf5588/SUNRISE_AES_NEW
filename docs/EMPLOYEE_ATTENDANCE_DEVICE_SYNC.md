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

The UI lets an administrator select pending PINs and explicitly create staff records for those selections only. **Show All Device Users** includes both pending and imported staging records, with PIN, device name, and status; imported rows cannot be selected again. `GET /api/devices/:sn/pending-users?includeImported=true` returns both statuses while the default endpoint behavior remains pending-only. The import maps PIN to both `employeeCode` and `deviceCode` (the latter is used by attendance PIN matching) and maps the device name to `staffName`; remaining `staff` fields use schema defaults. Device rows matching an existing employee or device code are marked imported without changing the staff record. A device-code collision during import is reported and left pending. Unselected staging records stay pending. Imported staff records are not automatically created from ADMS traffic.

The displayed request **Source** is a User-Agent heuristic, not device registration or authentication: requests resembling common HTTP tools are marked `likely_simulated`; other User-Agents, including a real terminal's unknown firmware string, remain `unverified`. A registered device's organization/serial check is separate. `unverified` requests are not rejected or skipped for `OPERLOG`/`USERINFO` staging; only `likely_simulated` cdata requests are excluded from staging. The staging path accepts `USER ` lines from `OPERLOG` and `USERINFO` plus common tabular/key-value USERINFO rows and supported `querydata` user-table responses. For serial `MFP3244700592`, each non-ATTLOG `/iclock/cdata` and `/iclock/querydata` request logs its raw URL/query, table metadata, source, and first 500 body characters (plus a 500-character extracted-payload preview) to help identify the device's actual format. Inspect this preview if no staged rows appear.

The endpoints are `POST /api/devices/:sn/sync-users`, `GET /api/devices/:sn/pending-users`, and `POST /api/devices/:sn/import-users` with a JSON `{ "pins": ["..."] }` body. The query queue only sends once per outstanding command and waits for `/iclock/devicecmd` acknowledgement before another can be queued. Device/user staging remains organization-scoped using the registered device serial and the current application database organization.

To disable the staging/import workflow, remove those three `/api/devices/...` routes and their `/employeeattendance` UI controls, the `DeviceCommand`/`DeviceUser` models, their controller handlers, and `utils/deviceUserSync.js`. Preserve the existing ADMS polling, `USERINFO` diagnostic, and ATTLOG logic unless those features are separately being removed. After exporting any needed data, remove only `device_commands` and/or `device_users` if their data should also be deleted. Command IDs use the existing per-device counter but remain in their separate `device_commands` collection. The selective import intentionally creates records in `staff` only when an administrator submits selected PINs; attendance records are not modified by the import.

## Administrator-initiated employee user update

The employee list at `/employeedata` has a **Send to Device** action. It requires an authenticated administrator and the page's CSRF token, and queues one `DATA UPDATE USERINFO` command in `device_commands` for a registered device owned by the current organization. The selected employee's `deviceCode` (falling back to `employeeCode`) must be numeric, and the name is stripped of tabs/newlines and limited to 24 characters. The corresponding `device_users` row is marked `imported`; neither the `staff` nor attendance collections are written by this action. The employee/PIN/privilege change is sent to the physical terminal only when it polls `/iclock/getrequest`; fingerprint enrollment still has to be completed on the terminal.

The normal USERINFO update capability is available only when `EMPLOYEE_ADMS_USERINFO_PROTOCOL_VERIFIED=true` and the specific device has `supportsUserSyncCommands` enabled after an administrator confirms its exact model/firmware. Elevated values (`Pri=2`, `6`, or `14`) have a separate gate: set `EMPLOYEE_ADMS_MANAGER_PRIVILEGE_PROTOCOL_VERIFIED=true` only after verifying those privileges on that exact device/firmware, then enable **Elevated USERINFO privileges** for that device with the second confirmation. Both gates and the per-device capability must be enabled for an elevated command to be queued. `Pri=0` is the normal-user default; a manager defaults to `Pri=14`, but an administrator can override it in the modal. The endpoint rejects unverified device/privilege combinations.

After setting environment variables in the application's normal service configuration, restart with the repository's existing command:

```powershell
node app.js
```

Sign in as an administrator in the correct organization, open `/employeedata`, verify and enable the exact device's normal USERINFO update capability (and elevated capability only if separately verified), then click **Send to Device** on the employee row. Confirm the PIN, choose a verified device and privilege, acknowledge the warning, and submit. The UI reports that the command is queued for the device's next ADMS poll; it does not claim delivery until the terminal polls.

To inspect the queue and staging marker from a Windows terminal with `mongosh` and `MONGODB_URI` set, use the application's organization database:

```powershell
mongosh $env:MONGODB_URI --quiet --eval "printjson(db.device_commands.find({device_sn:'<DEVICE_SERIAL>',command:/^DATA UPDATE USERINFO/}).sort({created_at:-1}).limit(10).toArray())"
mongosh $env:MONGODB_URI --quiet --eval "printjson(db.device_users.find({device_sn:'<DEVICE_SERIAL>',status:'imported'}).sort({synced_at:-1}).limit(10).toArray())"
```

To disable the Send to Device feature, remove its `/api/devices/:sn/push-user` route, `pushStaffUserToDevice` handler, the employee-list button/modal and supporting client script, the `buildDeviceUserPushCommand` helper and its tests, and the manager-privilege capability controls/environment gate if elevated privileges are no longer used. This does not require deleting queue history; retain `device_commands` for audit or remove only the relevant records after review. The feature does not update employee or attendance records.

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
