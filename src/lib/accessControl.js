const DRIVER_PAGES = new Set([
  "DriverOrders",
  "DriverChecklist",
  "DriverProtocol",
  "DriverDocuments",
  "DriverProfile",
  "DriverSupport",
]);

export const hasPageAccess = (user, pageName) => {
  if (!user) return false;
  if (user.role === "driver") {
    return DRIVER_PAGES.has(pageName);
  }
  return true;
};
