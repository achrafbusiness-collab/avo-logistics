const DRIVER_PAGES = new Set(["DriverOrders", "DriverChecklist", "DriverProtocol"]);

export const hasPageAccess = (user, pageName) => {
  if (!user) return false;
  if (user.role === "driver") {
    return DRIVER_PAGES.has(pageName);
  }
  if (pageName === "Terminal" || pageName === "Verlauf") {
    return user.role === "admin";
  }
  if (pageName === "SystemVermietung") {
    const ownerCompanyId = import.meta.env.VITE_PLATFORM_OWNER_COMPANY_ID;
    if (ownerCompanyId) {
      return user.role === "admin" && user.company_id === ownerCompanyId;
    }
    return user.role === "admin";
  }
  return true;
};
