import { DisconnectDialog } from "@/ui/DisconnectDialog";
import { Shell } from "@/ui/Shell";
import { useBrew } from "./useBrew";
import { useOfflineApp } from "./useOfflineApp";
import { useSoundAssist } from "./useSoundAssist";
import { useTheme } from "./useTheme";
export function App() {
  const brew = useBrew();
  const offline = useOfflineApp();
  const theme = useTheme();
  const sound = useSoundAssist(
    brew.pace,
    brew.pourStep,
    brew.nextPour,
    brew.completed,
  );
  return (
    <>
      <Shell brew={brew} offline={offline} theme={theme} sound={sound} />
      <DisconnectDialog
        open={brew.disconnectNotice}
        dismiss={brew.dismissDisconnectNotice}
      />
    </>
  );
}
