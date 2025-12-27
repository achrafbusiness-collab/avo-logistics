export const hasPageAccess = (user, pageName) => {
  if (!user) return false;
  if (pageName === 'SystemVermietung') {
    const ownerCompanyId = import.meta.env.VITE_PLATFORM_OWNER_COMPANY_ID;
    if (ownerCompanyId) {
      return user.role === 'admin' && user.company_id === ownerCompanyId;
    }
    return user.role === 'admin';
  }
  return true;
};
