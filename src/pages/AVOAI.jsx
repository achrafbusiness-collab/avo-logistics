import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, isWithinInterval, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Sparkles, 
  Send, 
  Loader2,
  User,
  Bot,
  Trash2,
  Moon,
  Sun
} from 'lucide-react';

export default function AVOAI() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hallo! Ich bin AVO AI, dein Analyse‑Assistent für AVO Logistics. Ich kann alle Aufträge, Fahrer, Kunden und Protokolle auswerten und dir Antworten liefern.\n\n✅ Nur Lesen/Analysieren – ich führe keine Aktionen aus.\n\nFrag mich z. B.:\n• Welche Aufträge haben Auslagen?\n• Wer ist der häufigste Fahrer letzte Woche?\n• Welche Stadt hatte die meisten Lieferungen?\n• Liste alle Kennzeichen heute\n\nWie kann ich dir helfen?' }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('avoai-dark-mode');
    return saved ? JSON.parse(saved) : false;
  });
  const messagesEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('avoai-dark-mode', JSON.stringify(darkMode));
  }, [darkMode]);

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => appClient.entities.Order.list('-created_date', 500),
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => appClient.entities.Driver.list('-created_date', 500),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => appClient.entities.Customer.list('-created_date', 500),
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => appClient.entities.Checklist.list('-created_date', 1000),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const expensesByOrder = useMemo(() => {
    const map = {};
    checklists.forEach((checklist) => {
      if (!checklist?.order_id) return;
      const expenses = Array.isArray(checklist.expenses) ? checklist.expenses : [];
      const hasExpenses = expenses.some((expense) =>
        Boolean(expense?.amount || expense?.file_url || expense?.note)
      );
      if (!hasExpenses) return;
      const total = expenses.reduce((sum, expense) => sum + (Number(expense?.amount) || 0), 0);
      map[checklist.order_id] = { count: expenses.length, total };
    });
    return map;
  }, [checklists]);

  const allCities = useMemo(() => {
    const set = new Set();
    orders.forEach((order) => {
      if (order?.pickup_city) set.add(order.pickup_city);
      if (order?.dropoff_city) set.add(order.dropoff_city);
    });
    return Array.from(set);
  }, [orders]);

  const normalize = (value) => (value || '').toString().toLowerCase().trim();

  const getOrderDate = (order) => {
    const raw = order?.dropoff_date || order?.pickup_date || order?.created_date;
    if (!raw) return null;
    const value = typeof raw === 'string' && raw.length <= 10 ? `${raw}T00:00:00` : raw;
    const parsed = typeof value === 'string' ? parseISO(value) : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  };

  const formatDateShort = (value) => {
    if (!value) return '—';
    const date = typeof value === 'string' ? parseISO(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return format(date, 'dd.MM.yyyy', { locale: de });
  };

  const parseDateRange = (question) => {
    const q = normalize(question);
    const today = new Date();
    if (q.includes('vorgestern')) {
      const day = subDays(today, 2);
      return { label: 'Vorgestern', start: startOfDay(day), end: endOfDay(day) };
    }
    if (q.includes('gestern')) {
      const day = subDays(today, 1);
      return { label: 'Gestern', start: startOfDay(day), end: endOfDay(day) };
    }
    if (q.includes('heute')) {
      return { label: 'Heute', start: startOfDay(today), end: endOfDay(today) };
    }
    if (q.includes('letzte 7') || q.includes('letzten 7')) {
      return { label: 'Letzte 7 Tage', start: startOfDay(subDays(today, 6)), end: endOfDay(today) };
    }
    if (q.includes('diese woche') || q.includes('dieser woche')) {
      return { label: 'Diese Woche', start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
    }
    return null;
  };

  const buildLocalAnswer = (question) => {
    const q = normalize(question);
    if (!q) return null;

    const range = parseDateRange(q);
    const rangeLabel = range ? ` (${range.label})` : '';
    const matchesRange = (order) => {
      if (!range) return true;
      const date = getOrderDate(order);
      if (!date) return false;
      return isWithinInterval(date, { start: range.start, end: range.end });
    };

    const filteredOrders = orders.filter(matchesRange);
    const listLines = (items, formatLine, limit = 12) => {
      const sliced = items.slice(0, limit);
      const tail = items.length - sliced.length;
      const lines = sliced.map(formatLine).join('\n');
      return tail > 0 ? `${lines}\n… +${tail} weitere` : lines;
    };

    const formatOrderLine = (order) => {
      const expenseInfo = expensesByOrder[order.id]
        ? ` • Auslagen: ${expensesByOrder[order.id].count}`
        : '';
      const driverInfo = order.assigned_driver_name ? ` • Fahrer: ${order.assigned_driver_name}` : '';
      return `- ${order.order_number || '—'} • ${order.license_plate || '—'} • ${order.pickup_city || '—'} → ${order.dropoff_city || '—'} • ${order.status || '—'}${driverInfo}${expenseInfo}`;
    };

    if (q.includes('auslagen')) {
      const withExpenses = filteredOrders.filter((order) => expensesByOrder[order.id]);
      const withoutExpenses = filteredOrders.filter((order) => !expensesByOrder[order.id]);
      if (q.includes('ohne') || q.includes('keine')) {
        return `Aufträge ohne Auslagen${rangeLabel} (${withoutExpenses.length}):\n${listLines(withoutExpenses, formatOrderLine) || '—'}`;
      }
      if (q.includes('mit')) {
        return `Aufträge mit Auslagen${rangeLabel} (${withExpenses.length}):\n${listLines(withExpenses, formatOrderLine) || '—'}`;
      }
      return `Auslagen-Übersicht${rangeLabel}:\n• Mit Auslagen: ${withExpenses.length}\n• Ohne Auslagen: ${withoutExpenses.length}\n\nMit Auslagen:\n${listLines(withExpenses, formatOrderLine) || '—'}`;
    }

    if (q.includes('häufigster fahrer') || q.includes('top fahrer') || q.includes('meist gefahren')) {
      const counts = {};
      filteredOrders.forEach((order) => {
        const name = order.assigned_driver_name || 'Nicht zugewiesen';
        counts[name] = (counts[name] || 0) + 1;
      });
      const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (!ranked.length) return `Keine Fahrerdaten${rangeLabel} gefunden.`;
      const lines = ranked.slice(0, 5).map(([name, count]) => `- ${name}: ${count} Auftrag${count === 1 ? '' : 'e'}`).join('\n');
      return `Häufigste Fahrer${rangeLabel}:\n${lines}`;
    }

    if (q.includes('bester kunde') || q.includes('top kunde') || q.includes('häufigster kunde')) {
      const counts = {};
      filteredOrders.forEach((order) => {
        const name = order.customer_name || 'Unbekannt';
        counts[name] = (counts[name] || 0) + 1;
      });
      const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (!ranked.length) return `Keine Kundendaten${rangeLabel} gefunden.`;
      const lines = ranked.slice(0, 5).map(([name, count]) => `- ${name}: ${count} Auftrag${count === 1 ? '' : 'e'}`).join('\n');
      return `Top-Kunden${rangeLabel}:\n${lines}`;
    }

    if ((q.includes('stadt') && q.includes('meist')) || q.includes('meiste lieferungen') || q.includes('meist gelieferte')) {
      const counts = {};
      filteredOrders.forEach((order) => {
        if (!order.dropoff_city) return;
        counts[order.dropoff_city] = (counts[order.dropoff_city] || 0) + 1;
      });
      const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (!ranked.length) return `Keine Zielstädte${rangeLabel} gefunden.`;
      const lines = ranked.slice(0, 5).map(([city, count]) => `- ${city}: ${count} Auftrag${count === 1 ? '' : 'e'}`).join('\n');
      return `Städte mit den meisten Lieferungen${rangeLabel}:\n${lines}`;
    }

    if (q.includes('kennzeichen') && (q.includes('alle') || q.includes('liste') || q.includes('zeige'))) {
      const plates = filteredOrders.map((order) => order.license_plate).filter(Boolean);
      if (!plates.length) return `Keine Kennzeichen${rangeLabel} gefunden.`;
      return `Kennzeichen${rangeLabel}:\n${plates.slice(0, 30).map((plate) => `- ${plate}`).join('\n')}${plates.length > 30 ? '\n… +weitere' : ''}`;
    }

    if ((q.includes('fin') || q.includes('vin')) && (q.includes('alle') || q.includes('liste') || q.includes('zeige'))) {
      const vins = filteredOrders.map((order) => order.vin || order.fin).filter(Boolean);
      if (!vins.length) return `Keine FIN/VIN${rangeLabel} gefunden.`;
      return `FIN/VIN${rangeLabel}:\n${vins.slice(0, 30).map((vin) => `- ${vin}`).join('\n')}${vins.length > 30 ? '\n… +weitere' : ''}`;
    }

    if (q.includes('abgeschlossen') || q.includes('beendet')) {
      const completed = filteredOrders.filter((order) => order.status === 'completed');
      return `Abgeschlossene Aufträge${rangeLabel} (${completed.length}):\n${listLines(completed, formatOrderLine) || '—'}`;
    }

    if (q.includes('offen') || q.includes('aktiv')) {
      const active = filteredOrders.filter((order) => !['completed', 'cancelled'].includes(order.status));
      return `Offene/Aktive Aufträge${rangeLabel} (${active.length}):\n${listLines(active, formatOrderLine) || '—'}`;
    }

    if (q.includes('protokoll') || q.includes('checklist')) {
      const recent = checklists.slice(0, 8).map((checklist) => {
        const order = orders.find((item) => item.id === checklist.order_id);
        const title = order?.order_number || checklist.order_id || '—';
        return `- ${title} • ${formatDateShort(checklist.created_date)}`;
      });
      return `Protokolle gesamt: ${checklists.length}\nLetzte Protokolle:\n${recent.join('\n') || '—'}`;
    }

    const cityMatches = allCities.filter((city) => q.includes(normalize(city)));
    if (cityMatches.length) {
      const cityOrders = filteredOrders.filter((order) =>
        cityMatches.some((city) => normalize(order.pickup_city).includes(normalize(city)) || normalize(order.dropoff_city).includes(normalize(city)))
      );
      if (cityOrders.length) {
        return `Aufträge mit Stadtbezug (${cityMatches.join(', ')})${rangeLabel}:\n${listLines(cityOrders, formatOrderLine)}`;
      }
    }

    const postalMatch = q.match(/\b\d{4,5}\b/);
    if (postalMatch) {
      const postalOrders = filteredOrders.filter((order) => {
        const pickup = normalize(order.pickup_postal_code);
        const dropoff = normalize(order.dropoff_postal_code);
        return pickup.includes(postalMatch[0]) || dropoff.includes(postalMatch[0]);
      });
      if (postalOrders.length) {
        return `Aufträge mit PLZ ${postalMatch[0]}${rangeLabel}:\n${listLines(postalOrders, formatOrderLine)}`;
      }
    }

    return null;
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      const localAnswer = buildLocalAnswer(input);
      if (localAnswer) {
        setMessages(prev => [...prev, { role: 'assistant', content: localAnswer }]);
        return;
      }

      const conversationHistory = messages.slice(-6).map((m) =>
        `${m.role === 'user' ? 'Nutzer' : 'AVO AI'}: ${m.content}`
      ).join('\n\n');

      const orderSnapshot = orders.slice(0, 200).map((order) => ({
        order_number: order.order_number,
        status: order.status,
        license_plate: order.license_plate,
        vin: order.vin || order.fin,
        pickup_city: order.pickup_city,
        pickup_postal_code: order.pickup_postal_code,
        dropoff_city: order.dropoff_city,
        dropoff_postal_code: order.dropoff_postal_code,
        assigned_driver_name: order.assigned_driver_name,
        customer_name: order.customer_name,
        created_date: order.created_date
      }));

      const checklistSnapshot = checklists.slice(0, 200).map((checklist) => ({
        order_id: checklist.order_id,
        created_date: checklist.created_date,
        expenses: Array.isArray(checklist.expenses) ? checklist.expenses : []
      }));

      const result = await appClient.integrations.Core.InvokeLLM({
        prompt: `Du bist AVO AI, der Analyse‑Assistent für das AVO Logistics System. Du darfst KEINE Aktionen ausführen (nur lesen/analysieren).

Verfügbare Daten (Auszug):
Aufträge: ${orders.length}
Fahrer: ${drivers.length}
Kunden: ${customers.length}
Protokolle: ${checklists.length}

Aufträge (max 200):
${JSON.stringify(orderSnapshot)}

Protokolle/Auslagen (max 200):
${JSON.stringify(checklistSnapshot)}

Gesprächsverlauf:
${conversationHistory}

Nutzerfrage: ${input}

Antwort-Regeln:
- Nur Analyse/Antworten, keine Aktionen.
- Antworte präzise, strukturiert und auf Deutsch.
- Wenn Daten fehlen, erkläre kurz welche Daten fehlen.`,
      });

      setMessages(prev => [...prev, { role: 'assistant', content: result }]);
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `❌ ${error?.message || 'Entschuldigung, es gab einen Fehler. Bitte versuche es erneut.'}` 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([
      { role: 'assistant', content: 'Hallo! Ich bin AVO AI (Analyse‑Modus). Wie kann ich dir helfen?' }
    ]);
  };

  return (
    <div className={`h-[calc(100vh-8rem)] flex flex-col transition-colors duration-300 ${darkMode ? 'dark' : ''}`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            <Sparkles className="w-6 h-6 text-purple-600" />
            AVO AI
          </h1>
          <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Analyse‑Assistent (nur Lesen)</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setDarkMode(!darkMode)}
            className={darkMode ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700' : ''}
          >
            {darkMode ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
            {darkMode ? 'Hell' : 'Dunkel'}
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={clearChat}
            className={darkMode ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700' : ''}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Chat leeren
          </Button>
        </div>
      </div>

      <Card className={`flex-1 flex flex-col overflow-hidden ${darkMode ? 'bg-gray-900 border-gray-800' : ''}`}>
        <CardContent className={`flex-1 overflow-y-auto p-6 space-y-4 ${darkMode ? 'bg-gray-900' : ''}`}>
          {messages.map((msg, idx) => (
            <div 
              key={idx}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  darkMode ? 'bg-purple-700' : 'bg-purple-600'
                }`}>
                  <Bot className="w-5 h-5 text-white" />
                </div>
              )}
              <div 
                className={`max-w-[75%] rounded-lg p-4 ${
                  msg.role === 'user' 
                    ? darkMode
                      ? 'bg-blue-900 text-white'
                      : 'bg-[#1e3a5f] text-white'
                    : darkMode
                      ? 'bg-gray-800 text-gray-100 border border-gray-700'
                      : 'bg-gray-100 text-gray-900'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
              </div>
              {msg.role === 'user' && (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  darkMode ? 'bg-gray-700' : 'bg-gray-600'
                }`}>
                  <User className="w-5 h-5 text-white" />
                </div>
              )}
            </div>
          ))}
          {isProcessing && (
            <div className="flex gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                darkMode ? 'bg-purple-700' : 'bg-purple-600'
              }`}>
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-100'}`}>
                <Loader2 className={`w-5 h-5 animate-spin ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        <div className={`border-t p-4 ${darkMode ? 'border-gray-800 bg-gray-900' : ''}`}>
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Frage AVO AI etwas... (z.B. 'Welche Aufträge haben Auslagen?' oder 'Top Kunde letzte Woche')"
              className={`min-h-[60px] resize-none ${
                darkMode ? 'bg-gray-800 border-gray-700 text-white placeholder:text-gray-500' : ''
              }`}
              disabled={isProcessing}
            />
            <Button 
              onClick={handleSend}
              disabled={!input.trim() || isProcessing}
              className={darkMode 
                ? 'bg-purple-700 hover:bg-purple-600 self-end' 
                : 'bg-purple-600 hover:bg-purple-700 self-end'
              }
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
          <p className={`text-xs mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            💡 Tipp: "Aufträge mit Auslagen" • "Häufigster Fahrer heute" • "Meiste Lieferungen letzte 7 Tage"
          </p>
        </div>
      </Card>
    </div>
  );
}
