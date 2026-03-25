import { useState, useEffect } from 'react';
import type { CommandInfo } from '@terminalmind/api';

export function useFuzzySearch(query: string): readonly CommandInfo[] {
  const [commands, setCommands] = useState<readonly CommandInfo[]>([]);
  const [filtered, setFiltered] = useState<readonly CommandInfo[]>([]);

  useEffect(() => {
    window.api.commands.list().then(setCommands);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setFiltered(commands);
      return;
    }

    const lower = query.toLowerCase();
    const matched = commands.filter(
      (c) =>
        c.title.toLowerCase().includes(lower) ||
        c.category.toLowerCase().includes(lower) ||
        c.id.toLowerCase().includes(lower),
    );
    setFiltered(matched);
  }, [query, commands]);

  return filtered;
}
