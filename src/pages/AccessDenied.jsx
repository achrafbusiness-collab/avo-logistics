import React from "react";
import { Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function AccessDenied() {
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="py-12 text-center text-slate-600">
        <Shield className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="font-semibold text-slate-900">Kein Zugriff</p>
        <p className="text-sm text-slate-500">
          Du hast keine Berechtigung, diese Seite zu sehen.
        </p>
      </CardContent>
    </Card>
  );
}
