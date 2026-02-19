import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { subscribeCustomerProtocolNotifications } from "@/lib/customerProtocolSender";

const NOTICE_STYLES = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
};

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export default function CustomerProtocolNoticeHost() {
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeCustomerProtocolNotifications((next) => {
      setNotice(next);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!notice?.id) return;
    const timeout = window.setTimeout(() => {
      setNotice((prev) => (prev?.id === notice.id ? null : prev));
    }, 3500);
    return () => window.clearTimeout(timeout);
  }, [notice?.id]);

  if (!notice?.message) return null;

  const tone = NOTICE_STYLES[notice.type] || NOTICE_STYLES.info;
  const Icon = ICONS[notice.type] || ICONS.info;

  return (
    <div className="fixed right-4 top-4 z-[130]">
      <div className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-lg ${tone}`}>
        <Icon className="h-4 w-4" />
        <span>{notice.message}</span>
      </div>
    </div>
  );
}
