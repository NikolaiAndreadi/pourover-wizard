import { useEffect, useRef, useState } from "react";
import {
  bookooUuids,
  type ConfirmedEncoding,
  createScaleLab,
  createScaleTransport,
  type LabSnapshot,
  parseRecording,
  replayBookoo,
  supportsScaleConnection,
  toSample,
  validateEncoding,
} from "@/app/scaleLab";

const initial: LabSnapshot = {
  state: "idle",
  frame: null,
  rejectedFrames: 0,
  error: "",
  latestHex: "",
  eventCount: 0,
  truncated: false,
};
export function ScaleLab() {
  const lab = useRef<ReturnType<typeof createScaleLab> | null>(null);
  const [snapshot, setSnapshot] = useState(initial);
  const [firmware, setFirmware] = useState("unknown");
  const [os, setOs] = useState("");
  const [codes, setCodes] = useState({
    gramsUnit: "",
    positiveSign: "",
    negativeSign: "",
  });
  const [confirmed, setConfirmed] = useState(false);
  const [annotation, setAnnotation] = useState("");
  const [message, setMessage] = useState("");
  const [selection, setSelection] = useState<{
    service: string;
    notify: string;
    command: string;
  }>({ ...bookooUuids });
  const [encoding, setEncoding] = useState<ConfirmedEncoding | null>(null);
  useEffect(
    () => () => {
      lab.current?.dispose();
    },
    [],
  );
  const busy =
    snapshot.state === "connected" || snapshot.state === "connecting";
  const sample =
    snapshot.frame && encoding ? toSample(snapshot.frame, 0, encoding) : null;
  function connect() {
    try {
      let mapping: ConfirmedEncoding | null = null;
      if (confirmed) {
        if (Object.values(codes).some((value) => value.trim() === ""))
          throw new Error("Enter all three confirmed byte codes.");
        mapping = {
          gramsUnit: Number(codes.gramsUnit),
          positiveSign: Number(codes.positiveSign),
          negativeSign: Number(codes.negativeSign),
        };
        validateEncoding(mapping);
      }
      lab.current?.dispose();
      setEncoding(mapping);
      setMessage("");
      lab.current = createScaleLab(
        createScaleTransport(selection),
        {
          model: "BOOKOO Themis Mini",
          firmware,
          browser: navigator.userAgent,
          os: os || "unknown",
          service: selection.service,
          notifyCharacteristic: selection.notify,
          commandCharacteristic: selection.command,
          encoding: mapping,
        },
        () => performance.now(),
        setSnapshot,
      );
      void lab.current.connect();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not connect.");
    }
  }
  function download() {
    if (!lab.current) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(lab.current.recording(), null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "bookoo-mini-recording.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return (
    <section aria-labelledby="scale-lab-title">
      <h1 id="scale-lab-title">BOOKOO scale lab</h1>
      <p>
        Hardware acceptance is pending. Connect only to your Themis Mini. Raw
        capture works before weight calibration; starting a capture replaces the
        previous capture, so download it first.
      </p>
      <p>
        Service {selection.service}. Notifications and commands require an
        explicit service grant in the device chooser.
      </p>
      <label>
        Firmware (if available){" "}
        <input
          value={firmware}
          disabled={busy}
          onChange={(event) => setFirmware(event.target.value.slice(0, 500))}
        />
      </label>{" "}
      <label>
        OS and version{" "}
        <input
          value={os}
          disabled={busy}
          onChange={(event) => setOs(event.target.value.slice(0, 500))}
        />
      </label>
      <details>
        <summary>Advanced service and confirmed encoding</summary>
        <p>
          The official protocol omits numeric unit and sign codes. Capture a
          known positive weight, tare, then remove it for a negative reading.
          Compare the raw unit and sign codes below before confirming.
        </p>
        {Object.entries(selection).map(([key, value]) => (
          <label key={key}>
            {key} UUID{" "}
            <input
              disabled={busy}
              value={value}
              onChange={(event) =>
                setSelection({ ...selection, [key]: event.target.value })
              }
            />
          </label>
        ))}
        {Object.entries(codes).map(([key, value]) => (
          <label key={key}>
            {key} byte (decimal or 0x hex){" "}
            <input
              disabled={busy}
              value={value}
              onChange={(event) =>
                setCodes({ ...codes, [key]: event.target.value })
              }
            />
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            disabled={busy}
            onChange={(event) => setConfirmed(event.target.checked)}
          />{" "}
          I verified these unit and sign codes against the scale display.
        </label>
      </details>
      {!supportsScaleConnection() && (
        <p>
          Web Bluetooth is unavailable in this browser. Use Chrome on the Mac
          for the hardware test.
        </p>
      )}
      <p role="status">
        Connection: {snapshot.state}.{" "}
        {sample
          ? `${sample.grams.toFixed(2)} g`
          : encoding && snapshot.frame
            ? "Frame has an unsupported unit or sign code; check the confirmed mapping."
            : "Weight decoding awaiting confirmed calibration."}
      </p>
      {snapshot.latestHex && (
        <p>
          Latest notification (hex): <code>{snapshot.latestHex}</code>
        </p>
      )}
      {snapshot.frame && (
        <p>
          Raw unit code: {snapshot.frame.unitCode}; sign code:{" "}
          {snapshot.frame.signCode}; unsigned magnitude:{" "}
          {snapshot.frame.magnitudeGrams.toFixed(2)}; scale timer:{" "}
          {snapshot.frame.scaleTimerMs} ms; battery:{" "}
          {snapshot.frame.batteryPercent}%.
        </p>
      )}
      <p>
        {snapshot.eventCount} recorded events. {snapshot.rejectedFrames}{" "}
        rejected checksum frames.{" "}
        {snapshot.truncated && "Capture reached the event limit; download now."}
      </p>
      <button
        type="button"
        disabled={busy || !supportsScaleConnection()}
        onClick={connect}
      >
        Connect and start capture
      </button>{" "}
      <button
        type="button"
        disabled={!busy}
        onClick={() => lab.current?.disconnect()}
      >
        Disconnect
      </button>{" "}
      <button type="button" disabled={!lab.current} onClick={download}>
        Download raw session
      </button>
      <p>
        {(["tare", "startTimer", "stopTimer", "resetTimer"] as const).map(
          (command) => (
            <button
              type="button"
              key={command}
              disabled={snapshot.state !== "connected"}
              onClick={() => {
                void lab.current?.command(command);
              }}
            >
              {
                {
                  tare: "Tare",
                  startTimer: "Start scale timer",
                  stopTimer: "Stop scale timer",
                  resetTimer: "Reset scale timer",
                }[command]
              }
            </button>
          ),
        )}
      </p>
      <label>
        Annotation{" "}
        <input
          value={annotation}
          maxLength={2000}
          onChange={(event) => setAnnotation(event.target.value)}
        />
      </label>{" "}
      <button
        type="button"
        disabled={!lab.current || !annotation.trim()}
        onClick={() => {
          lab.current?.annotate(annotation);
          setAnnotation("");
        }}
      >
        Mark event
      </button>
      <p>
        Mark pour onset, swirl or stir, and intentional disconnect. Commands are
        write attempts; verify the scale display to confirm execution. These
        controls do not arm or start a brew.
      </p>
      <label>
        Replay a downloaded session{" "}
        <input
          type="file"
          accept=".json,application/json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 16_000_000) {
              setMessage("Recording exceeds 16 MB.");
              return;
            }
            try {
              const recording = parseRecording(await file.text());
              const result = replayBookoo(recording);
              setMessage(
                `${recording.source} replay: ${result.frames.length} valid frames, ${result.samples.length} calibrated samples, ${result.rejectedFrames} checksum failures. ${recording.truncated ? "Capture was truncated." : ""}`,
              );
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "Invalid recording.",
              );
            }
          }}
        />
      </label>
      {(snapshot.error || message) && (
        <p role="alert">{snapshot.error || message}</p>
      )}
    </section>
  );
}
