import { useEffect, useRef } from "react";

export function DisconnectDialog({
  open,
  dismiss,
}: {
  open: boolean;
  dismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="disconnect-dialog"
      aria-labelledby="disconnect-title"
      onCancel={dismiss}
    >
      <h2 id="disconnect-title">Scales disconnected!</h2>
      <p>Reconnect your scale before starting a new brew.</p>
      <button type="button" onClick={dismiss}>
        OK
      </button>
    </dialog>
  );
}
