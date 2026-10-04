import { DisconnectDialog } from "@/ui/DisconnectDialog";
import { Shell } from "@/ui/Shell";
import { useBrew } from "./useBrew";
import { useOfflineApp } from "./useOfflineApp";
import { useTheme } from "./useTheme";
export function App() {
  const brew = useBrew();
  const offline = useOfflineApp();
  const theme = useTheme();
  return (
    <>
      <Shell brew={brew} offline={offline} theme={theme} />
      <DisconnectDialog
        open={brew.disconnectNotice}
        dismiss={brew.dismissDisconnectNotice}
      />
    </>
  );
}
