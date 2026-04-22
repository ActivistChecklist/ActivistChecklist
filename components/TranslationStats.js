'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

function ProgressBar({ value, tooltip }) {
  const bar = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <div className="h-2 min-w-12 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-full text-left sm:w-10 sm:text-right tabular-nums text-sm leading-none sm:leading-normal">{value}%</span>
    </div>
  );

  if (!tooltip) return bar;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>{bar}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function TranslationStats() {
  const [state, setState] = useState('loading'); // 'loading' | 'done' | 'error'
  const [languages, setLanguages] = useState([]);

  useEffect(() => {
    fetch('/api-server/crowdin-stats')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setLanguages(data.languages ?? []);
        setState('done');
      })
      .catch(() => setState('error'));
  }, []);

  if (state === 'loading') {
    return (
      <div className="mt-6 flex items-center gap-2 text-muted-foreground text-sm py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading translation stats...
      </div>
    );
  }

  if (state === 'error' || languages.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">Translation stats unavailable.</p>
    );
  }

  return (
    <TooltipProvider delayDuration={0}>
    <div className="not-prose mt-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="bg-muted/50 text-muted-foreground font-medium normal-case text-sm">Language</TableHead>
            <TableHead className="bg-muted/50 text-muted-foreground font-medium normal-case text-sm w-[38%]">Automatically translated</TableHead>
            <TableHead className="bg-muted/50 text-muted-foreground font-medium normal-case text-sm w-[38%]">Human reviewed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {languages.map((lang) => (
            <TableRow key={lang.id}>
              <TableCell className="font-medium">{lang.name}</TableCell>
              <TableCell className=""><ProgressBar value={lang.translated} /></TableCell>
              <TableCell className="">
                <ProgressBar
                  value={lang.approved}
                  tooltip={lang.approved < 100 ? 'This translation needs human review. Join our Crowdin project to help.' : null}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
    </TooltipProvider>
  );
}

export default TranslationStats;
