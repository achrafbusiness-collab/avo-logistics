import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { createPageUrl } from '@/utils';
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
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hallo! Ich bin AVO AI, dein intelligenter Assistent für das Logistiksystem. Ich kann dir bei folgenden Aufgaben helfen:\n\n• Aufträge erstellen und verwalten\n• Fahrer zuweisen\n• Kunden anlegen\n• Statistiken anzeigen\n• Zu bestimmten Seiten navigieren\n\nWie kann ich dir helfen?' }
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
    queryFn: () => appClient.entities.Order.list('-created_date', 100),
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => appClient.entities.Driver.list(),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => appClient.entities.Customer.list(),
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => appClient.entities.Checklist.list('-created_date', 50),
  });

  const createOrderMutation = useMutation({
    mutationFn: (data) => appClient.entities.Order.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  const updateOrderMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.Order.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  const createDriverMutation = useMutation({
    mutationFn: (data) => appClient.entities.Driver.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['drivers'] }),
  });

  const createCustomerMutation = useMutation({
    mutationFn: (data) => appClient.entities.Customer.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const generateOrderNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 9000) + 1000;
    return `EU-OA-${year}${month}-${random}`;
  };

  const executeAction = async (action) => {
    try {
      switch (action.type) {
        case 'create_order':
          const orderData = {
            ...action.data,
            order_number: action.data.order_number || generateOrderNumber(),
            status: action.data.status || 'new'
          };
          if (!orderData.pickup_postal_code || !orderData.dropoff_postal_code) {
            return '❌ Bitte Abhol- und Ziel-PLZ angeben, damit der Auftrag korrekt gespeichert wird.';
          }
          await createOrderMutation.mutateAsync(orderData);
          return `✅ Auftrag ${orderData.order_number} wurde erfolgreich erstellt.`;

        case 'assign_driver':
          const order = orders.find(o => o.id === action.order_id || o.order_number === action.order_number);
          const driver = drivers.find(d => d.id === action.driver_id || 
            `${d.first_name} ${d.last_name}`.toLowerCase().includes(action.driver_name?.toLowerCase()));
          
          if (!order) return '❌ Auftrag nicht gefunden.';
          if (!driver) return '❌ Fahrer nicht gefunden.';

          await updateOrderMutation.mutateAsync({
            id: order.id,
            data: {
              ...order,
              assigned_driver_id: driver.id,
              assigned_driver_name: `${driver.first_name} ${driver.last_name}`,
              status: 'assigned'
            }
          });
          return `✅ Auftrag ${order.order_number} wurde ${driver.first_name} ${driver.last_name} zugewiesen.`;

        case 'create_customer':
          const customerData = {
            ...action.data,
            customer_number: action.data.customer_number || `KD-${Date.now().toString().slice(-6)}`,
            status: 'active'
          };
          await createCustomerMutation.mutateAsync(customerData);
          return `✅ Kunde ${customerData.customer_number} wurde erfolgreich angelegt.`;

        case 'create_driver':
          const driverData = {
            ...action.data,
            status: action.data.status || 'pending'
          };
          await createDriverMutation.mutateAsync(driverData);
          return `✅ Fahrer ${driverData.first_name} ${driverData.last_name} wurde erfolgreich angelegt.`;

        case 'navigate':
          window.location.href = createPageUrl(action.page);
          return `🔄 Navigation zu ${action.page}...`;

        default:
          return '❌ Unbekannte Aktion.';
      }
    } catch (error) {
      return `❌ Fehler bei der Ausführung: ${error.message}`;
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      // System-Kontext vorbereiten
      const systemContext = {
        orders: orders.map(o => ({
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          license_plate: o.license_plate,
          vehicle_brand: o.vehicle_brand,
          vehicle_model: o.vehicle_model,
          pickup_city: o.pickup_city,
          dropoff_city: o.dropoff_city,
          assigned_driver_name: o.assigned_driver_name,
          customer_name: o.customer_name,
          price: o.price
        })),
        drivers: drivers.map(d => ({
          id: d.id,
          name: `${d.first_name} ${d.last_name}`,
          email: d.email,
          phone: d.phone,
          status: d.status
        })),
        customers: customers.map(c => ({
          id: c.id,
          customer_number: c.customer_number,
          name: c.company_name || `${c.first_name} ${c.last_name}`,
          email: c.email,
          phone: c.phone,
          status: c.status
        })),
        statistics: {
          total_orders: orders.length,
          active_orders: orders.filter(o => ['assigned', 'in_transit'].includes(o.status)).length,
          completed_orders: orders.filter(o => o.status === 'completed').length,
          active_drivers: drivers.filter(d => d.status === 'active').length,
          total_customers: customers.length
        }
      };

      const conversationHistory = messages.slice(-5).map(m => 
        `${m.role === 'user' ? 'Nutzer' : 'AVO AI'}: ${m.content}`
      ).join('\n\n');

      const result = await appClient.integrations.Core.InvokeLLM({
        prompt: `Du bist AVO AI, der intelligente Assistent für das AVO Logistics Fahrzeugüberführungs-System.

Du bist eine normale Konversations-AI wie ChatGPT UND kannst gleichzeitig direkt im System Aktionen ausführen.

VERFÜGBARE SYSTEM-DATEN:
- Aufträge: ${orders.length} (${orders.filter(o => o.status === 'new').length} neu, ${orders.filter(o => ['assigned', 'in_transit'].includes(o.status)).length} aktiv, ${orders.filter(o => o.status === 'completed').length} abgeschlossen)
- Fahrer: ${drivers.length} (${drivers.filter(d => d.status === 'active').length} aktiv)
- Kunden: ${customers.length}

AKTUELLE AUFTRÄGE (letzte 5):
${orders.slice(0, 5).map(o => `- ${o.order_number}: ${o.vehicle_brand} ${o.vehicle_model} (${o.license_plate}), ${o.pickup_city} → ${o.dropoff_city}, Status: ${o.status}, Fahrer: ${o.assigned_driver_name || 'nicht zugewiesen'}`).join('\n')}

VERFÜGBARE AKTIONEN:
Du kannst folgende Aktionen durchführen. Wenn der Nutzer eine Aktion möchte, antworte MIT DER AKTION + ERKLÄRUNG:

1. Auftrag erstellen: Antworte mit JSON: {"action":"create_order","data":{"license_plate":"...","vehicle_brand":"...","vehicle_model":"...","pickup_address":"...","pickup_postal_code":"...","pickup_city":"...","dropoff_address":"...","dropoff_postal_code":"...","dropoff_city":"..."}}

2. Fahrer zuweisen: {"action":"assign_driver","order_number":"EU-OA-XXX","driver_name":"Max Mustermann"}

3. Kunde anlegen: {"action":"create_customer","data":{"first_name":"...","last_name":"...","email":"...","phone":"..."}}

4. Navigation: {"action":"navigate","page":"Dashboard"} (Dashboard, Orders, Drivers, Customers, Checklists, Search, AIImport, AVOAI, AppConnection)

GESPRÄCHSVERLAUF:
${conversationHistory}

NUTZER FRAGT: ${input}

ANTWORT-REGELN:
- Beantworte normale Fragen freundlich und informativ (wie ChatGPT)
- Nutze die System-Daten für präzise Antworten
- Wenn eine AKTION gewünscht wird: Gib das JSON zurück + eine kurze Erklärung
- Sei hilfsbereit, präzise und professionell
- Antworte immer auf Deutsch`,
      });

      let responseContent = result;

      // Prüfen ob JSON-Aktion enthalten ist
      const jsonMatch = result.match(/\{[\s\S]*"action"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const actionData = JSON.parse(jsonMatch[0]);
          if (actionData.action) {
            const actionResult = await executeAction(actionData);
            responseContent = result.replace(jsonMatch[0], '').trim() + '\n\n' + actionResult;
          }
        } catch (e) {
          // JSON parsing fehlgeschlagen, normale Antwort
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: responseContent }]);
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
      { role: 'assistant', content: 'Hallo! Ich bin AVO AI. Wie kann ich dir helfen?' }
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
          <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Dein intelligenter System-Assistent</p>
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
              placeholder="Frage AVO AI etwas... (z.B. 'Erstelle einen Auftrag für BMW X5 von Berlin nach München')"
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
            💡 Tipp: "Zeige mir alle aktiven Aufträge" • "Weise Auftrag EU-OA-123 Max Müller zu" • "Erstelle einen Kunden"
          </p>
        </div>
      </Card>
    </div>
  );
}
