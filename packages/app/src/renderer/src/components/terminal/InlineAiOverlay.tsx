import React from 'react';
import { useTranslation } from 'react-i18next';
import type { InlineAiMode } from '../../hooks/useInlineAi';

export interface InlineAiOverlayProps {
  readonly mode: InlineAiMode;
  readonly prompt: string;
  readonly generatedCommand: string;
  readonly error: string | null;
  readonly onCancel?: () => void;
}

export function InlineAiOverlay({
  mode,
  prompt,
  generatedCommand,
  error,
  onCancel,
}: InlineAiOverlayProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (mode === 'normal') return null;

  return (
    <div className="inline-ai-overlay" aria-live="polite">
      <div className="ai-inline">
        {mode === 'composing' && (
          <>
            <div className="ai-badge">
              <span className="material-symbols-rounded" style={{ fontSize: 14 }}>smart_toy</span>
              {t('terminal.inline.badgeCompose')}
              <button type="button" className="ai-cancel-btn" onClick={onCancel} title={t('terminal.inline.cancelTitle')}>
                <span className="material-symbols-rounded" style={{ fontSize: 14 }}>close</span>
              </button>
            </div>
            <div className="ai-cmd" style={{ opacity: 0.5 }}>
              ? {prompt || '\u00a0'}
            </div>
            {error && <div style={{ color: 'var(--red)', fontSize: 11 }}>{error}</div>}
            <div className="ai-hint">
              {t('terminal.inline.hintCompose')}
            </div>
          </>
        )}
        {mode === 'waiting' && (
          <>
            <div className="ai-badge">
              <span className="material-symbols-rounded" style={{ fontSize: 14 }}>smart_toy</span>
              {t('terminal.inline.badgeWait')}
              <button type="button" className="ai-cancel-btn" onClick={onCancel} title={t('terminal.inline.cancelTitle')}>
                <span className="material-symbols-rounded" style={{ fontSize: 14 }}>close</span>
              </button>
            </div>
            <div className="ai-cmd" style={{ opacity: 0.5 }}>{t('terminal.inline.generating')}</div>
            <div className="ai-hint">
              {t('terminal.inline.hintWait')}
            </div>
          </>
        )}
        {mode === 'preview' && (
          <>
            <div className="ai-badge">
              <span className="material-symbols-rounded" style={{ fontSize: 14 }}>smart_toy</span>
              {t('terminal.inline.badgePreview')}
              <button type="button" className="ai-cancel-btn" onClick={onCancel} title={t('terminal.inline.cancelTitle')}>
                <span className="material-symbols-rounded" style={{ fontSize: 14 }}>close</span>
              </button>
            </div>
            <div className="ai-cmd">{generatedCommand}</div>
            <div className="ai-hint">
              {t('terminal.inline.hintPreview')}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
