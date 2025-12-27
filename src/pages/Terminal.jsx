import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { clearSystemLogs, getSystemLogs, subscribeSystemLogs } from '@/lib/systemLog';
import { Copy, Trash2, AlertTriangle } from 'lucide-react';

const levelOptions = [
  { value: 'all', label: 'Alle' },
  { value: 'error', label: 'Fehler' },
  { value: 'warn', label: 'Warnung' },
  { value: 'info', label: 'Info' },
];

export default function Terminal() {
  const [logs, setLogs] = useState(() => getSystemLogs());
  const [levelFilter, setLevelFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeSystemLogs(setLogs);
    return unsubscribe;
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      if (levelFilter !== 'all' && entry.level !== levelFilter) {
        return false;
      }
      if (!searchTerm) {
        return true;
      }
      const haystack = `${entry.message} ${entry.details}`.toLowerCase();
      return haystack.includes(searchTerm.toLowerCase());
    });
  }, [logs, levelFilter, searchTerm]);

  const handleCopy = async () => {
    const payload = filteredLogs
      .map((entry) => `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message} ${entry.details || ''}`.trim())
      .join('\n');
    await navigator.clipboard?.writeText(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Terminal</h1>
          <p className="text-sm text-slate-300">
            Zeigt Frontend-Fehler, Warnungen und API-Probleme an. Backend-Logs findest du weiterhin in Vercel/Supabase.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="w-4 h-4 mr-2" />
            Logs kopieren
          </Button>
          <Button variant="outline" onClick={clearSystemLogs}>
            <Trash2 className="w-4 h-4 mr-2" />
            Logs löschen
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-lg">Systemmeldungen</CardTitle>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Suche nach Fehler..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="sm:w-64"
            />
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="sm:w-40">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                {levelOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <AlertTriangle className="w-10 h-10 mb-3" />
              <p>Keine Logs vorhanden.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLogs
                .slice()
                .reverse()
                .map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-100"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{new Date(entry.timestamp).toLocaleString()}</span>
                      <span className="uppercase">{entry.level}</span>
                    </div>
                    <p className="mt-2 font-medium">{entry.message}</p>
                    {entry.details && (
                      <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-400">{entry.details}</pre>
                    )}
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
