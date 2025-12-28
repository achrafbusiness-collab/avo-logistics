import { supabase } from "@/lib/supabaseClient";

const tableMap = {
  Order: "orders",
  OrderNote: "order_notes",
  DriverDocument: "driver_documents",
  Driver: "drivers",
  Customer: "customers",
  Checklist: "checklists",
  AppSettings: "app_settings",
};

const parseOrder = (order) => {
  if (!order || typeof order !== 'string') return null;
  const desc = order.startsWith('-');
  return { key: order.replace(/^-/, ''), desc };
};

const buildQuery = (table, criteria, order, limit) => {
  let query = supabase.from(table).select("*");
  if (criteria && typeof criteria === "object" && Object.keys(criteria).length > 0) {
    query = query.match(criteria);
  }
  const sort = parseOrder(order);
  if (sort) {
    query = query.order(sort.key, { ascending: !sort.desc });
  }
  if (limit && typeof limit === "number") {
    query = query.limit(limit);
  }
  return query;
};

const createEntityClient = (name) => {
  const table = tableMap[name] || name.toLowerCase();
  return {
    list: async (order, limit) => {
      const { data, error } = await buildQuery(table, null, order, limit);
      if (error) {
        console.error(`Supabase list error (${table}):`, error.message);
        return [];
      }
      return data || [];
    },
    filter: async (criteria, order, limit) => {
      const { data, error } = await buildQuery(table, criteria, order, limit);
      if (error) {
        console.error(`Supabase filter error (${table}):`, error.message);
        return [];
      }
      return data || [];
    },
    create: async (data) => {
      const now = new Date().toISOString();
      const payload = {
        ...data,
        created_date: data?.created_date || now,
        updated_date: now,
      };
      const { data: created, error } = await supabase
        .from(table)
        .insert(payload)
        .select("*")
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return created;
    },
    update: async (id, data) => {
      const now = new Date().toISOString();
      const payload = {
        ...data,
        updated_date: now,
      };
      const { data: updated, error } = await supabase
        .from(table)
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return updated;
    },
    delete: async (id) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) {
        throw new Error(error.message);
      }
      return { id };
    },
  };
};

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

const getCompanyIdForCurrentUser = async () => {
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return null;
  const profile = await getProfile(data.user.id);
  if (profile?.company_id) return profile.company_id;
  if (data.user.email) {
    const { data: driverRecord } = await supabase
      .from('drivers')
      .select('company_id')
      .eq('email', data.user.email)
      .maybeSingle();
    if (driverRecord?.company_id) {
      return driverRecord.company_id;
    }
  }
  return null;
};

const uploadFileToStorage = async ({ file, bucket = "documents", pathPrefix = "uploads" }) => {
  if (!file) {
    throw new Error("Keine Datei angegeben");
  }
  const { data } = await supabase.auth.getSession();
  const userId = data?.session?.user?.id || "public";
  const companyId = await getCompanyIdForCurrentUser();
  if (!companyId) {
    throw new Error("Unternehmen nicht gefunden. Bitte erneut anmelden.");
  }
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_");
  const filePath = `${pathPrefix}/${companyId}/${userId}/${Date.now()}_${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      upsert: true,
      contentType: file.type,
      metadata: {
        company_id: companyId,
      },
    });
  if (uploadError) {
    throw new Error(uploadError.message);
  }
  const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return { file_url: publicUrl.publicUrl };
};

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
    return uploadFileToStorage({ file });
  },
  SendEmail: async () => ({ ok: false, message: 'E-Mail ist im lokalen Modus deaktiviert.' }),
  GenerateImage: async () => ({ ok: false, message: 'Bildgenerierung ist im lokalen Modus deaktiviert.' }),
  ExtractDataFromUploadedFile: async () => ({ ok: false, message: 'Dateianalyse ist im lokalen Modus deaktiviert.' }),
  CreateFileSignedUrl: async () => ({ ok: false, message: 'Signierte URLs sind im lokalen Modus deaktiviert.' }),
  UploadPrivateFile: async () => ({ ok: false, message: 'Private Uploads sind im lokalen Modus deaktiviert.' }),
};

const profileDefaults = {
  role: 'minijobber',
  permissions: {},
};

const ensureActiveProfile = async (profile) => {
  if (profile && profile.is_active === false) {
    await supabase.auth.signOut();
    return false;
  }
  return true;
};

const getProfile = async (userId) => {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    return null;
  }
  return data;
};

const buildUser = (authUser, profile) => {
  if (!authUser) return null;
  const safeProfile = profile || {};
  return {
    id: authUser.id,
    email: authUser.email,
    full_name: safeProfile.full_name || authUser.user_metadata?.full_name || '',
    role: safeProfile.role || profileDefaults.role,
    permissions: safeProfile.permissions || profileDefaults.permissions,
    ...safeProfile,
  };
};

const resolveEffectiveRole = async (authUser, profile) => {
  const baseRole = profile?.role || profileDefaults.role;
  if (!authUser?.email) return baseRole;
  if (baseRole === 'admin') return baseRole;
  try {
    const { data: driverRecord } = await supabase
      .from('drivers')
      .select('id')
      .eq('email', authUser.email)
      .maybeSingle();
    if (driverRecord?.id) {
      return 'driver';
    }
  } catch (error) {
    console.warn('Driver role lookup failed', error);
  }
  return baseRole;
};

const auth = {
  getCurrentUser: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return null;
    const profile = await getProfile(data.user.id);
    const active = await ensureActiveProfile(profile);
    if (!active) return null;
    const role = await resolveEffectiveRole(data.user, profile);
    return buildUser(data.user, { ...profile, role });
  },
  me: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return null;
    const profile = await getProfile(data.user.id);
    const active = await ensureActiveProfile(profile);
    if (!active) return null;
    const role = await resolveEffectiveRole(data.user, profile);
    return buildUser(data.user, { ...profile, role });
  },
  login: async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw new Error(error.message);
    }
    const profile = await getProfile(data.user.id);
    const active = await ensureActiveProfile(profile);
    if (!active) {
      throw new Error('Konto wartet auf Freigabe durch einen Admin.');
    }
    const effectiveRole = await resolveEffectiveRole(data.user, profile);
    if (effectiveRole === 'driver' && data.user?.email) {
      await supabase
        .from('drivers')
        .update({ status: 'active', updated_date: new Date().toISOString() })
        .eq('email', data.user.email)
        .eq('status', 'pending');
    }
    return buildUser(data.user, { ...profile, role: effectiveRole });
  },
  logout: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout failed, clearing local session.', error.message);
      await supabase.auth.signOut({ scope: 'local' });
    }
  },
  resetPassword: async ({ email, redirectTo }) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      throw new Error(error.message);
    }
    return true;
  },
  updatePassword: async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      throw new Error(error.message);
    }
    return true;
  },
};

export const appClient = {
  auth,
  entities: {
    Driver: createEntityClient('Driver'),
    Order: createEntityClient('Order'),
    OrderNote: createEntityClient('OrderNote'),
    DriverDocument: createEntityClient('DriverDocument'),
    Checklist: createEntityClient('Checklist'),
    Customer: createEntityClient('Customer'),
    AppSettings: createEntityClient('AppSettings'),
  },
  integrations: {
    Core,
  },
};
