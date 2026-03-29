import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

type MatchPart = { text: string; highlight?: boolean };

type DemoSessionGroup = {
  id: string;
  sessionName: string;
  icon: 'terminal' | 'laptop';
  iconClass: 'search-session-icon-terminal' | 'search-session-icon-accent';
  matchCount: number;
  lines: MatchPart[][];
};

const DEMO_GROUPS: readonly DemoSessionGroup[] = [
  {
    id: 'web-server-01',
    sessionName: 'web-server-01',
    icon: 'terminal',
    iconClass: 'search-session-icon-terminal',
    matchCount: 4,
    lines: [
      [{ text: 'nginx', highlight: true }, { text: '-proxy  Up 12 days  0.0.0.0:80->80/tcp' }],
      [
        { text: 'app-backend  Up 12 days  0.0.0.0:' },
        { text: '3000', highlight: true },
        { text: '->3000/tcp' },
      ],
      [{ text: 'redis', highlight: true }, { text: '-cache  Up 12 days  6379/tcp' }],
      [{ text: 'postgres', highlight: true }, { text: '-db  Up 12 days  5432/tcp' }],
    ],
  },
  {
    id: 'powershell',
    sessionName: 'PowerShell',
    icon: 'laptop',
    iconClass: 'search-session-icon-accent',
    matchCount: 2,
    lines: [
      [{ text: '✓ 1247 modules ' }, { text: 'transform', highlight: true }, { text: 'ed.' }],
      [
        { text: 'dist/assets/index-BcRq9gSl.js  ' },
        { text: '156.32', highlight: true },
        { text: ' kB' },
      ],
    ],
  },
];

function MatchLineContent({ parts }: { parts: MatchPart[] }): React.ReactElement {
  return (
    <>
      {parts.map((part, i) =>
        part.highlight ? (
          <span key={i} className="highlight">
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

export function SearchSidebar(): React.ReactElement {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(true);

  return (
    <>
      <div className="sidebar-header">
        <h2>{t('search.title')}</h2>
      </div>
      <div className="search-input-wrap">
        <input
          type="text"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('search.placeholder')}
        />
        <div className="search-filters">
          <button
            type="button"
            className={`search-filter-btn${regex ? ' active' : ''}`}
            title={t('search.regex')}
            aria-pressed={regex}
            onClick={() => setRegex((v) => !v)}
          >
            .*
          </button>
          <button
            type="button"
            className={`search-filter-btn${caseSensitive ? ' active' : ''}`}
            title={t('search.caseSensitive')}
            aria-pressed={caseSensitive}
            onClick={() => setCaseSensitive((v) => !v)}
          >
            Aa
          </button>
          <button
            type="button"
            className={`search-filter-btn${wholeWord ? ' active' : ''}`}
            title={t('search.wholeWord')}
            aria-pressed={wholeWord}
            onClick={() => setWholeWord((v) => !v)}
          >
            W
          </button>
        </div>
      </div>
      <div className="search-results">
        {DEMO_GROUPS.map((group) => (
          <div key={group.id} className="search-file-group">
            <div className="search-file-name">
              <span className={`material-symbols-rounded ${group.iconClass}`}>{group.icon}</span>
              {group.sessionName}
              <span className="search-match-count">{t('search.matches', { count: group.matchCount })}</span>
            </div>
            {group.lines.map((parts, lineIdx) => (
              <div key={lineIdx} className="search-match-line">
                <MatchLineContent parts={parts} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
