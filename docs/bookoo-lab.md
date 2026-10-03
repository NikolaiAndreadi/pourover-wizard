# BOOKOO Themis Mini lab

Open **Scale lab** from the guide navigation. This is an isolated diagnostic
screen; lab commands do not start or arm a brewing session. Use Mac Chrome on
localhost or HTTPS. Safari can import and decode a recording but has no supported
live connection path here. The iOS app selects native BLE; see the
[iOS guide](ios.md) for foreground limits and pending native file export validation. No actual scale, OS, browser, firmware, or native iOS
behavior has been accepted yet; all committed protocol fixtures are synthetic.

## Protocol evidence and limits

The vendor's [Mini protocol](https://github.com/BooKooCode/OpenSource/blob/6e3f48a81aa7b209871517cf7cda19399d8a16ba/bookoo_mini_scale/protocols.md)
(last updated August 12, 2026; reviewed October 3, 2026) defines service `0x0FFE`,
notifications `0xFF11`, and commands `0xFF12`. Notifications contain 20 bytes:
`03 0B`, a big-endian 24-bit timer in milliseconds, a unit code, a sign code,
a big-endian 24-bit weight magnitude in hundredths of grams, flow data, battery,
settings, reserved byte, and XOR checksum. Commands are six bytes with prefix
`03 0A`; tare uses command `01`, start timer `04`, stop `05`, reset `06`.

The vendor does not specify numeric sign or gram-unit codes. Raw decoding therefore
shows the code values and unsigned magnitude; signed gram readings are gated
behind explicitly confirmed mapping. No other units are converted. Unknown sign
or unit codes produce no signed sample. The scale timer is diagnostic data; app
sample timestamps use the monotonic recording clock, never the scale timer.

The chooser requests access to the known service, or the complete UUID entered
under Advanced. It cannot discover arbitrary ungranted services. Characteristic
UUIDs can also be supplied explicitly for investigation; the codec still only
recognizes Mini frames. Only tare and timer commands are exposed. No settings,
shutdown, or firmware commands are implemented. Successful writes do not prove
a command was executed: compare the scale display.

## First hardware self-test

1. Record Chrome and macOS versions in the OS field; firmware may remain
   `unknown` when unavailable. Close competing scale apps, power on the Mini,
   and choose **Connect and start capture**. Cancel the chooser once and retry.
   Record permission and connection errors if encountered.
2. With an empty scale, press **Tare** and confirm zero on its display. Place
   a known object on it. Compare the unsigned magnitude with the positive gram
   display, and note the raw unit/sign codes. Mark an annotation such as
   `known positive 100 g; display 100.0`.
3. Tare with that object in place, then remove it. Confirm a negative display
   and note the sign and unchanged unit code. Mark an annotation. Download this
   raw calibration session before starting another capture.
4. Disconnect. Under Advanced, enter the observed gram-unit, positive-sign,
   and negative-sign byte values (decimal or `0x` hex). Check the confirmation
   box. Connect for a fresh capture. Verify positive, zero, and negative gram
   readings against the scale display. A sign change alone must not affect the
   timer. Unsupported codes should clearly suppress the signed reading.
5. Exercise **Start scale timer**, **Stop scale timer**, and **Reset scale timer**;
   verify each on the physical display. Mark command outcomes, including failure.
   No automatic timer synchronization or tare occurs.
6. Download three labeled sessions: a normal 15 g / 250 g brew; one with deliberate
   swirl/stir disturbances; one with a deliberate Bluetooth loss. Mark observed
   pour onset and disturbances at the time they happen. For loss, switch the
   scale off while connected: status must change and the latest reading clear.
7. Repeat connect/disconnect, cancel a pending connection, leave the screen,
   return, and reconnect. Check for duplicate notifications or stale readings.
   A new capture replaces the old one, so download each first. Import each JSON
   via **Replay a downloaded session** and confirm it reports valid frames,
   signed samples when mapping is supplied, checksum errors, and truncation.

Send the downloaded files with display observations and exact versions for codec
review. Passing mocked checks does not complete this hardware acceptance. If the
observed codes cannot confidently identify signs and grams, retain raw capture
and ask BOOKOO for clarification rather than confirming a guessed mapping.

## Raw session format and replay

JSON uses `schemaVersion: 1` and explicit `source: hardware | synthetic`.
Metadata records model, manually supplied firmware/OS, browser user agent,
service and both characteristic UUIDs, and confirmed encoding or `null`.
No device ID or device name is collected. Avoid serial numbers in manual fields
or annotations. Unknown JSON fields are rejected, including device-ID fields.

Each event has relative monotonic `atMs`. Event kinds are `connected`,
`disconnected`, `notification`, `command`, `annotation`, or `error`.
Notification and command bytes remain arrays of byte numbers with their original
chunk boundaries. `command` means a write attempt; failure produces an `error`.
Scale execution still requires a display observation. Equal receipt times are
allowed; combined frames remain ordered and can share a timestamp. Consumers
may reject equal/stale timestamps independently. Decoder state resets at
connection boundaries, preventing fragments crossing a disconnect.

Captures stop accumulating at 20,000 events and set `truncated: true`;
notifications are limited to 512 bytes and annotations to 2,000 characters.
Export uses an independent snapshot; live display only reads inexpensive counts.
Imports reject malformed versions, byte ranges, chronology, metadata and event
shapes. The lab also limits uploads to 16 MB. Raw-only replay still reports
frames; signed samples require a confirmed encoding in that file. Replay runs
through the same streaming decoder used by live capture.
