export const hasPageAccess = (user, pageName) => {
  if (!user) return false;
  return true;
};
