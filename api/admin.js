import createCompany from "../server/admin/create-company.js";
import createDriverUser from "../server/admin/create-driver-user.js";
import deleteCompany from "../server/admin/delete-company.js";
import deleteUser from "../server/admin/delete-user.js";
import emailImport from "../server/admin/email-import.js";
import fixIntransitWithoutDriver from "../server/admin/fix-intransit-without-driver.js";
import inviteUser from "../server/admin/invite-user.js";
import listCompanies from "../server/admin/list-companies.js";
import restoreChecklistExpenses from "../server/admin/restore-checklist-expenses.js";
import sendDriverAssignment from "../server/admin/send-driver-assignment.js";
import sendSystemEmail from "../server/admin/send-system-email.js";
import updateCompany from "../server/admin/update-company.js";
import updateProfile from "../server/admin/update-profile.js";

const handlers = {
  "create-company": createCompany,
  "create-driver-user": createDriverUser,
  "delete-company": deleteCompany,
  "delete-user": deleteUser,
  "email-import": emailImport,
  "fix-intransit-without-driver": fixIntransitWithoutDriver,
  "invite-user": inviteUser,
  "list-companies": listCompanies,
  "restore-checklist-expenses": restoreChecklistExpenses,
  "send-driver-assignment": sendDriverAssignment,
  "send-system-email": sendSystemEmail,
  "update-company": updateCompany,
  "update-profile": updateProfile,
};

export const config = {
  api: {
    bodyParser: false,
  },
};

const applyCors = (req, res) => {
  const origin = req?.headers?.origin;
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
};

const getActionFromRequest = (req) => {
  if (req?.query?.action) {
    if (Array.isArray(req.query.action)) {
      return req.query.action.join("/");
    }
    return String(req.query.action);
  }
  const rawUrl = req?.url || "";
  const path = rawUrl.split("?")[0] || "";
  const prefix = "/api/admin/";
  if (!path.startsWith(prefix)) return "";
  return path.slice(prefix.length);
};

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  const action = getActionFromRequest(req);
  const actionHandler = handlers[action];
  if (!actionHandler) {
    res.status(404).json({ ok: false, error: "Unknown admin action" });
    return;
  }
  return actionHandler(req, res);
}
