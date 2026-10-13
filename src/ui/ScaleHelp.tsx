import { type MouseEvent, type ReactNode, useId, useRef } from "react";
import { createPortal } from "react-dom";

const RELEASES = "https://github.com/NikolaiAndreadi/pourover-wizard/releases";
const BLUEFY = "https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055";
const SIDESTORE = "https://docs.sidestore.io/docs/intro";

function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
  const dialog = event.currentTarget;
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  const inside =
    event.clientX >= box.left &&
    event.clientX <= box.right &&
    event.clientY >= box.top &&
    event.clientY <= box.bottom;
  if (!inside) dialog.close();
}

export function ScaleHelp({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => dialog.current?.showModal()}
      >
        {children}
      </button>
      {createPortal(
        // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is the native keyboard close
        <dialog
          ref={dialog}
          className="scale-help"
          aria-labelledby={title}
          onClick={closeOnBackdrop}
        >
          <h2 id={title}>Connect a scale</h2>
          <p>
            This browser has no Web Bluetooth, so it can’t reach the scale, but
            the timer-only mode will work for you! To use a scale:
          </p>
          <ul>
            <li>
              <strong>Mac, Windows or Android.</strong> Open this page in Chrome
              or Edge.
            </li>
            <li>
              <strong>iPhone and iPad.</strong> Safari and every other iOS
              mobile browser lack Bluetooth. The easiest way is the{" "}
              <a href={BLUEFY} target="_blank" rel="noreferrer">
                Bluefy
              </a>{" "}
              browser: install it and open this page there.
            </li>
            <li>
              <strong>iOS app.</strong> Download the IPA from{" "}
              <a href={RELEASES} target="_blank" rel="noreferrer">
                GitHub Releases
              </a>{" "}
              and install it with{" "}
              <a href={SIDESTORE} target="_blank" rel="noreferrer">
                SideStore
              </a>
              . <strong>Not that easy to set up</strong>: the first install
              needs a computer and your Apple ID.
            </li>
          </ul>
          <form method="dialog">
            <button type="submit">Got it!</button>
          </form>
        </dialog>,
        document.body,
      )}
    </>
  );
}
