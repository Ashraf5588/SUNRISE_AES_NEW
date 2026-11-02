# Employee attendance device sync

## What the manual action does

The employee attendance page lists ZKTeco serial numbers that have contacted `/iclock/cdata`. **Sync Device Attendance** starts a ten-minute monitoring window for the selected serial number. It does not send a command to the terminal. The status and counts come from ATTLOG requests actually received and processed during that window.

The page shows the most recently processed successful batch separately from historical synchronization completion. ADMS does not provide a completion signal in the implementation currently present in this project, so the page deliberately reports historical sync completion as unverified. A quiet device or an empty window is not proof that there are no pending records.

For historical recovery, use only the export or retransmission procedure documented for the exact terminal model and firmware. If the terminal can export attendance as CSV, upload that file through the existing attendance CSV import. Verify the resulting records before clearing or deleting anything on the terminal.

## Protocol and device limitations

The existing implementation responds to `GET /iclock/cdata?SN=...` with device options and accepts attendance through `POST /iclock/cdata?SN=...&table=ATTLOG`. It has no server command queue or historical-query endpoint. The connected device model and firmware, its vendor manual, and a packet capture are not present in the repository. Therefore this project cannot confirm whether that terminal supports historical replay, how it retries after network failure, or whether a particular ADMS command can request old punches.

`ATTLOGStamp=9999` is retained unchanged to avoid disrupting the currently working GET integration. Its meaning and suitability for this terminal have not been verified. Do not treat it as a historical replay request or change it to another value without vendor documentation and a test against the exact device and firmware.

The receiver returns a non-success HTTP response when a batch is invalid or could not be fully saved, and successful records are idempotent so retransmission is safe. Whether the terminal retains and retries such a batch is device/firmware-specific and must be tested on the physical terminal. Attendance records are never deleted by this feature.

## Device status and record handling

- A serial number is registered when the terminal communicates with the cdata endpoint; its display name defaults to `ZKTeco device <serial>`.
- "Recently communicating" means a cdata request was seen within the preceding five minutes; it is an observed server-side indicator, not a live network probe.
- A record identity uses the device serial, PIN, punch time, status, and verification mode. A sparse unique event-key index protects new records, and logical matching avoids duplicating older records that predate the key.
- Unknown PINs are retained as attendance records, preserving the existing employee-code mapping behavior. Dates are not restricted to the current day.
- Invalid rows and database write failures are counted and logged without logging employee PINs or names. A batch that is not fully processed is not acknowledged as successful.

## Physical-device verification still required

Use the device's reported model and firmware and its vendor documentation to determine whether it supports stored-punch retransmission, local export, or an ADMS historical-data feature. On a safe test device, verify normal punches, delayed/old punches, duplicate delivery, offline/reconnection behavior, and the device's response to a server error before relying on automatic retries. The application cannot assert that a manual sync recovered pending history until a supported device procedure is confirmed and the received records are reconciled.
