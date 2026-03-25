import React, { useCallback } from 'react';
import type { PermissionPrompt } from '@terminalmind/api';
import { PERMISSION_DESCRIPTIONS, permissionIcon } from './permission-labels';

interface PermissionPromptModalProps {
  readonly prompt: PermissionPrompt | null;
  readonly onClose: () => void;
}

export function PermissionPromptModal(props: PermissionPromptModalProps): React.ReactElement | null {
  const { prompt, onClose } = props;

  const respond = useCallback(
    async (granted: boolean) => {
      if (!prompt) {
        return;
      }
      await window.api.extensions.respondToPermissionPrompt(prompt.extensionId, granted);
      onClose();
    },
    [prompt, onClose],
  );

  if (!prompt) {
    return null;
  }

  return (
    <div className="permission-prompt-overlay" role="presentation">
      <div
        className="permission-prompt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-prompt-title"
      >
        <div className="permission-prompt-header">
          <h2 id="permission-prompt-title" className="permission-prompt-title">
            Extension permissions
          </h2>
        </div>
        <div className="permission-prompt-body">
          <p className="permission-prompt-extension">
            <strong>{prompt.extensionName}</strong> is requesting the following permissions:
          </p>
          {prompt.reason ? <p className="permission-prompt-reason">{prompt.reason}</p> : null}
          <ul className="permission-prompt-list">
            {prompt.permissions.map((p) => (
              <li key={p} className="permission-prompt-item">
                <span className="permission-prompt-item-icon" aria-hidden>
                  {permissionIcon(p)}
                </span>
                <div>
                  <div className="permission-prompt-item-id">{p}</div>
                  <div className="permission-prompt-item-desc">{PERMISSION_DESCRIPTIONS[p]}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="permission-prompt-footer">
          <button type="button" className="permission-prompt-btn deny" onClick={() => void respond(false)}>
            Deny
          </button>
          <button type="button" className="permission-prompt-btn allow" onClick={() => void respond(true)}>
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
