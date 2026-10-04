import { DisconnectDialog } from "@/ui/DisconnectDialog";
import { Shell } from "@/ui/Shell";
import { useBrew } from "./useBrew";
import { useOfflineApp } from "./useOfflineApp";
export function App() {
  const brew = useBrew();
  const offline = useOfflineApp();
  return (
    <>
      <Shell brew={brew} offline={offline} />
      <DisconnectDialog
        open={brew.disconnectNotice}
        dismiss={brew.dismissDisconnectNotice}
      />
    </>
  );
}
