const STORAGE_KEY = 'avo-system-logs';
const MAX_LOGS = 500;
const listeners = new Set();
let logs = [];
let initialized = false;

const loadLogs = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    logs = stored ? JSON.parse(stored) : [];
  } catch {
    logs = [];
  }
};

const saveLogs = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-MAX_LOGS)));
  } catch {
    // Ignore storage errors.
  }
};

const notify = () => {
  listeners.forEach((handler) => handler([...logs]));
};

const formatArg = (arg) => {
  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
};

export const logSystemEvent = ({ level = 'info', message = '', details = '' }) => {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    level,
    message: message || 'Unbekannter Fehler',
    details,
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(-MAX_LOGS);
  }
  saveLogs();
  notify();
};

export const initSystemLogger = () => {
  if (initialized) return;
  initialized = true;
  loadLogs();
  notify();

  const originalError = console.error.bind(console);
  console.error = (...args) => {
    logSystemEvent({
      level: 'error',
      message: formatArg(args[0]),
      details: args.slice(1).map(formatArg).join(' | '),
    });
    originalError(...args);
  };

  const originalWarn = console.warn.bind(console);
  console.warn = (...args) => {
    logSystemEvent({
      level: 'warn',
      message: formatArg(args[0]),
      details: args.slice(1).map(formatArg).join(' | '),
    });
    originalWarn(...args);
  };

  window.addEventListener('error', (event) => {
    logSystemEvent({
      level: 'error',
      message: event.message || 'Uncaught error',
      details: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logSystemEvent({
      level: 'error',
      message: 'Unhandled promise rejection',
      details: formatArg(event.reason),
    });
  });
};

export const getSystemLogs = () => [...logs];

export const clearSystemLogs = () => {
  logs = [];
  saveLogs();
  notify();
};

export const subscribeSystemLogs = (handler) => {
  listeners.add(handler);
  return () => listeners.delete(handler);
};
