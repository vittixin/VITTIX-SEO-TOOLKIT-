import { SettingsPanel } from '@/src/components/SettingsPanel';

export function SettingsView() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        These settings control the local audit history in this browser. The full options page (with
        privacy details) is available from Chrome’s extension settings.
      </p>
      <SettingsPanel />
    </div>
  );
}
