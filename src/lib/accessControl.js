const DRIVER_PAGES = new Set([
  "DriverOrders",
  "DriverChecklist",
  "DriverProtocol",
  "DriverDocuments",
  "DriverProfile",
  "DriverSupport",
]);

const SYSTEM_ADMIN_PAGES = new Set([
  "AdminControlling",
  "AdminEmailSettings",
  "Verlauf",
  "Terminal",
  "SystemVermietung",
]);

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const isSystemAdmin = (user) => {
  if (!user) return false;
  const adminEmail = import.meta.env.VITE_SYSTEM_ADMIN_EMAIL;
  const adminUserId = import.meta.env.VITE_SYSTEM_ADMIN_USER_ID;
  if (adminUserId && user.id === adminUserId) return true;
  if (adminEmail && normalizeEmail(user.email) === normalizeEmail(adminEmail)) return true;
  return false;
};

export const hasPageAccess = (user, pageName) => {
  if (!user) return false;
  if (user.role === "driver") {
    return DRIVER_PAGES.has(pageName);
  }
  if (SYSTEM_ADMIN_PAGES.has(pageName)) {
    return isSystemAdmin(user);
  }
  return true;
};
