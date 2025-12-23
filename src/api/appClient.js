const storagePrefix = 'avo:';
const memoryStore = new Map();

const getStorage = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch (error) {
    return null;
  }
  return null;
};

const storage = getStorage();

const readCollection = (name) => {
  const key = `${storagePrefix}${name}`;
  if (!storage) {
    return memoryStore.get(key) || [];
  }
  const raw = storage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
};

const writeCollection = (name, items) => {
  const key = `${storagePrefix}${name}`;
  if (!storage) {
    memoryStore.set(key, items);
    return;
  }
  storage.setItem(key, JSON.stringify(items));
};

const randomId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const parseOrder = (order) => {
  if (!order || typeof order !== 'string') return null;
  const desc = order.startsWith('-');
  return { key: order.replace(/^-/, ''), desc };
};

const sortItems = (items, order) => {
  const sort = parseOrder(order);
  if (!sort) return items;
  const { key, desc } = sort;
  return [...items].sort((a, b) => {
    const aVal = a?.[key];
    const bVal = b?.[key];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (aVal === bVal) return 0;
    if (aVal > bVal) return desc ? -1 : 1;
    return desc ? 1 : -1;
  });
};

const applyLimit = (items, limit) => {
  if (!limit || typeof limit !== 'number') return items;
  return items.slice(0, limit);
};

const matchesCriteria = (item, criteria) => {
  if (!criteria || typeof criteria !== 'object') return true;
  return Object.entries(criteria).every(([key, value]) => item?.[key] === value);
};

const createEntityClient = (name) => ({
  list: async (order, limit) => {
    const items = readCollection(name);
    return applyLimit(sortItems(items, order), limit);
  },
  filter: async (criteria, order, limit) => {
    const items = readCollection(name).filter((item) => matchesCriteria(item, criteria));
    return applyLimit(sortItems(items, order), limit);
  },
  create: async (data) => {
    const items = readCollection(name);
    const now = new Date().toISOString();
    const item = {
      ...data,
      id: data?.id || randomId(),
      created_date: data?.created_date || now,
      updated_date: now,
    };
    items.unshift(item);
    writeCollection(name, items);
    return item;
  },
  update: async (id, data) => {
    const items = readCollection(name);
    const now = new Date().toISOString();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      const item = {
        ...data,
        id: id || randomId(),
        created_date: data?.created_date || now,
        updated_date: now,
      };
      items.unshift(item);
      writeCollection(name, items);
      return item;
    }
    const updated = {
      ...items[index],
      ...data,
      id,
      updated_date: now,
    };
    items[index] = updated;
    writeCollection(name, items);
    return updated;
  },
  delete: async (id) => {
    const items = readCollection(name).filter((item) => item.id !== id);
    writeCollection(name, items);
    return { id };
  },
});

const buildSchemaDefaults = (schema) => {
  if (!schema || schema.type !== 'object' || !schema.properties) return {};
  return Object.entries(schema.properties).reduce((acc, [key, config]) => {
    if (config?.type === 'number') {
      acc[key] = null;
    } else {
      acc[key] = '';
    }
    return acc;
  }, {});
};

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const Core = {
  InvokeLLM: async ({ prompt, response_json_schema }) => {
    if (!prompt) {
      throw new Error('Es fehlt ein Prompt fuer die AI-Anfrage.');
    }
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, response_json_schema }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || 'AI-Anfrage fehlgeschlagen.');
    }
    return payload.data;
  },
  UploadFile: async ({ file }) => {
    if (!file) {
      throw new Error('Keine Datei angegeben');
    }
    const file_url = await fileToDataUrl(file);
    return { file_url };
  },
  SendEmail: async () => ({ ok: false, message: 'E-Mail ist im lokalen Modus deaktiviert.' }),
  GenerateImage: async () => ({ ok: false, message: 'Bildgenerierung ist im lokalen Modus deaktiviert.' }),
  ExtractDataFromUploadedFile: async () => ({ ok: false, message: 'Dateianalyse ist im lokalen Modus deaktiviert.' }),
  CreateFileSignedUrl: async () => ({ ok: false, message: 'Signierte URLs sind im lokalen Modus deaktiviert.' }),
  UploadPrivateFile: async () => ({ ok: false, message: 'Private Uploads sind im lokalen Modus deaktiviert.' }),
};

const demoUsers = [
  {
    id: 'admin_avo',
    email: 'admin@avo-logistics.app',
    password: 'admin123',
    full_name: 'Admin',
    role: 'admin',
  },
  {
    id: 'staff_avo',
    email: 'mitarbeiter@avo-logistics.app',
    password: 'mitarbeiter123',
    full_name: 'Mitarbeiter',
    role: 'staff',
  },
];

const authKey = `${storagePrefix}user`;
const readValue = (key) => {
  if (!storage) {
    return memoryStore.get(key) || null;
  }
  return storage.getItem(key);
};
const writeValue = (key, value) => {
  if (!storage) {
    memoryStore.set(key, value);
    return;
  }
  storage.setItem(key, value);
};
const removeValue = (key) => {
  if (!storage) {
    memoryStore.delete(key);
    return;
  }
  storage.removeItem(key);
};
const getStoredUser = () => {
  const raw = readValue(authKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

const auth = {
  getCurrentUser: () => getStoredUser(),
  me: async () => getStoredUser(),
  login: async ({ email, password }) => {
    const identifier = String(email || '').trim().toLowerCase();
    const secret = String(password || '');
    const user = demoUsers.find((candidate) => candidate.email.toLowerCase() === identifier);
    if (!user || user.password !== secret) {
      throw new Error('Ungültige E-Mail oder Passwort.');
    }
    const { password: _password, ...safeUser } = user;
    writeValue(authKey, JSON.stringify(safeUser));
    return safeUser;
  },
  logout: () => {
    removeValue(authKey);
  },
  setUser: (user) => {
    if (!user) return;
    writeValue(authKey, JSON.stringify(user));
  },
};

export const appClient = {
  auth,
  entities: {
    Driver: createEntityClient('Driver'),
    Order: createEntityClient('Order'),
    Checklist: createEntityClient('Checklist'),
    Customer: createEntityClient('Customer'),
    AppSettings: createEntityClient('AppSettings'),
  },
  integrations: {
    Core,
  },
};
