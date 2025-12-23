export const hasPageAccess = (user, pageName) => {
  if (!user) return false;
  if (user.role === "admin") return true;
  const permissions = user.permissions || {};
  return !!permissions[pageName];
};
