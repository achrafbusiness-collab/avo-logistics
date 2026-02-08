import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const readJsonBody = async (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
};

const getBearerToken = (req) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
};

const supabaseAdmin = createClient(supabaseUrl || "", serviceRoleKey || "");

const getProfileForUser = async (userId) => {
  if (!userId) return null;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role, company_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data || null;
};

const normalizeImapConfig = (raw) => {
  const host = String(raw?.host || "").trim();
  const user = String(raw?.user || "").trim();
  const pass = String(raw?.pass || "").trim();
  const mailbox = String(raw?.mailbox || "INBOX").trim() || "INBOX";
  const portValue = raw?.port === "" || raw?.port === null ? undefined : raw?.port;
  const port = Number(portValue || 993);
  const secure = raw?.secure === undefined ? true : Boolean(raw?.secure);
  return { host, user, pass, port, secure, mailbox };
};

const formatAddress = (addressList) => {
  if (!Array.isArray(addressList) || addressList.length === 0) return "";
  return addressList
    .map((item) => {
      const name = item?.name ? String(item.name).trim() : "";
      const email = item?.address ? String(item.address).trim() : "";
      if (name && email) return `${name} <${email}>`;
      return name || email;
    })
    .filter(Boolean)
    .join(", ");
};

const stripHtml = (value) =>
  String(value || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildListPayload = (message) => {
  const envelope = message.envelope || {};
  return {
    uid: message.uid,
    subject: envelope.subject || "",
    from: formatAddress(envelope.from),
    date: envelope.date ? new Date(envelope.date).toISOString() : null,
    seen: Array.isArray(message.flags) ? message.flags.includes("\\Seen") : false,
  };
};

const connectImap = async (config) => {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    logger: false,
  });
  await client.connect();
  return client;
};

const formatImapError = (error) => {
  if (!error) return "IMAP Fehler.";
  const responseText = error?.response?.text || error?.serverResponse?.text;
  return responseText || error?.message || "IMAP Fehler.";
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ ok: false, error: "Supabase admin env vars missing" });
    return;
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ ok: false, error: "Missing auth token" });
      return;
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      res.status(401).json({ ok: false, error: "Invalid auth token" });
      return;
    }

    const requesterProfile = await getProfileForUser(authData.user.id);
    if (!requesterProfile?.company_id) {
      res.status(403).json({ ok: false, error: "Kein Unternehmen gefunden." });
      return;
    }
    if (requesterProfile.role === "driver") {
      res.status(403).json({ ok: false, error: "Keine Berechtigung." });
      return;
    }

    const body = await readJsonBody(req);
    const action = String(body?.action || "");
    const imap = normalizeImapConfig(body?.imap || {});
    const limit = Math.min(Math.max(Number(body?.limit || 30), 1), 100);
    const searchTerm = String(body?.search || "").trim();

    if (!imap.host || !imap.user || !imap.pass) {
      res.status(400).json({ ok: false, error: "IMAP Zugangsdaten fehlen." });
      return;
    }

    const client = await connectImap(imap);
    try {
      try {
        await client.mailboxOpen(imap.mailbox);
      } catch (err) {
        res.status(400).json({ ok: false, error: `Postfach konnte nicht geöffnet werden: ${formatImapError(err)}` });
        return;
      }
      const lock = await client.getMailboxLock(imap.mailbox);
      try {
        if (action === "list") {
          let searchQuery = { all: true };
          if (searchTerm) {
            searchQuery = {
              or: [
                { subject: searchTerm },
                { from: searchTerm },
                { body: searchTerm },
                { text: searchTerm },
              ],
            };
          }
          let uids = [];
          let searchFallback = false;
          try {
            uids = await client.search(searchQuery, { uid: true });
          } catch (err) {
            if (!searchTerm) {
              throw new Error(`IMAP Suche fehlgeschlagen: ${formatImapError(err)}`);
            }
            searchFallback = true;
            try {
              uids = await client.search({ all: true }, { uid: true });
            } catch (fallbackError) {
              throw new Error(`IMAP Suche fehlgeschlagen: ${formatImapError(fallbackError)}`);
            }
          }
          const recentUids = uids.slice(-limit);
          let messages = [];
          if (recentUids.length) {
            try {
              for await (const message of client.fetch(recentUids, {
                uid: true,
                envelope: true,
                internalDate: true,
                flags: true,
              }, { uid: true })) {
                messages.push(buildListPayload(message));
              }
            } catch (err) {
              throw new Error(`IMAP Abruf fehlgeschlagen: ${formatImapError(err)}`);
            }
          }
          if (searchTerm) {
            const needle = searchTerm.toLowerCase();
            const filtered = messages.filter((msg) => {
              const subject = String(msg.subject || "").toLowerCase();
              const from = String(msg.from || "").toLowerCase();
              return subject.includes(needle) || from.includes(needle);
            });
            if (searchFallback || filtered.length) {
              messages = filtered;
            }
          }
          messages.sort((a, b) => {
            const timeA = a.date ? new Date(a.date).getTime() : 0;
            const timeB = b.date ? new Date(b.date).getTime() : 0;
            return timeB - timeA;
          });
          res.status(200).json({ ok: true, data: { messages } });
          return;
        }

        if (action === "preview") {
          const uid = Number(body?.uid);
          if (!Number.isFinite(uid)) {
            res.status(400).json({ ok: false, error: "E-Mail fehlt." });
            return;
          }
          try {
            for await (const message of client.fetch([uid], {
              uid: true,
              envelope: true,
              source: true,
              internalDate: true,
            }, { uid: true })) {
              const parsed = await simpleParser(message.source);
              const subject = parsed.subject || message.envelope?.subject || "";
              const from = formatAddress(message.envelope?.from);
              const date = message.envelope?.date
                ? new Date(message.envelope.date).toISOString()
                : null;
              const bodyText =
                parsed.text?.trim() ||
                stripHtml(parsed.html) ||
                stripHtml(parsed.textAsHtml) ||
                "";
              res.status(200).json({
                ok: true,
                data: {
                  uid: message.uid,
                  subject,
                  from,
                  date,
                  body: bodyText,
                },
              });
              return;
            }
          } catch (err) {
            res.status(400).json({ ok: false, error: `IMAP Abruf fehlgeschlagen: ${formatImapError(err)}` });
            return;
          }
          res.status(404).json({ ok: false, error: "E-Mail nicht gefunden." });
          return;
        }

        if (action === "fetch") {
          const uids = Array.isArray(body?.uids) ? body.uids.map((uid) => Number(uid)) : [];
          const safeUids = uids.filter((uid) => Number.isFinite(uid));
          if (!safeUids.length) {
            res.status(400).json({ ok: false, error: "Keine E-Mails ausgewählt." });
            return;
          }
          const limitedUids = safeUids.slice(0, 20);
          const chunks = [];
          const MAX_CHARS = 120000;
          for await (const message of client.fetch(limitedUids, {
            uid: true,
            envelope: true,
            source: true,
            internalDate: true,
          }, { uid: true })) {
            const parsed = await simpleParser(message.source);
            const bodyText =
              parsed.text?.trim() ||
              stripHtml(parsed.html) ||
              stripHtml(parsed.textAsHtml) ||
              "";
            const subject = parsed.subject || message.envelope?.subject || "";
            const from = formatAddress(message.envelope?.from);
            const date = message.envelope?.date
              ? new Date(message.envelope.date).toISOString()
              : "";
            const header = [
              subject ? `Betreff: ${subject}` : "",
              from ? `Von: ${from}` : "",
              date ? `Datum: ${date}` : "",
            ]
              .filter(Boolean)
              .join("\n");
            const block = `${header}\n\n${bodyText}`.trim();
            if (block) {
              const next = `${block}\n\n---\n\n`;
              if (chunks.join("").length + next.length > MAX_CHARS) {
                break;
              }
              chunks.push(next);
            }
          }
          res.status(200).json({ ok: true, data: { combinedText: chunks.join("").trim() } });
          return;
        }

        res.status(400).json({ ok: false, error: "Unbekannte Aktion." });
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => null);
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
}
