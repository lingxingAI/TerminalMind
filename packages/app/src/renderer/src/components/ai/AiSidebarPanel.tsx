import React, { useState } from 'react';
import { AiSettingsForm } from './AiSettingsForm';

export function AiSidebarPanel(): React.ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="ai-sidebar-panel">
      <p className="ai-sidebar-lead">
        Generate shell commands, browse conversations, and tune model defaults from here.
      </p>
      <button
        type="button"
        className="ai-sidebar-settings-trigger"
        onClick={() => setSettingsOpen(true)}
      >
        Open AI settings…
      </button>
      <AiSettingsForm open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
