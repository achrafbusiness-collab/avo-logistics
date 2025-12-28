import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { appClient } from "@/api/appClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2, FolderOpen } from "lucide-react";
import { createPageUrl } from "@/utils";

export default function DriverDocuments() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      const currentUser = await appClient.auth.me();
      setUser(currentUser);
    };
    loadUser();
  }, []);

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers"],
    queryFn: () => appClient.entities.Driver.list(),
    enabled: !!user,
  });

  const currentDriver = drivers.find((driver) => driver.email === user?.email);

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["driver-doc-orders", currentDriver?.id],
    queryFn: () =>
      appClient.entities.Order.filter({ assigned_driver_id: currentDriver?.id }, "-created_date"),
    enabled: !!currentDriver,
  });

  const { data: driverDocs = [], isLoading: docsLoading } = useQuery({
    queryKey: ["driver-docs"],
    queryFn: () => appClient.entities.DriverDocument.list("-created_at"),
  });

  const orderDocs = useMemo(
    () =>
      orders
        .filter((order) => order.pdf_url)
        .map((order) => ({
          id: order.id,
          title: order.order_number,
          url: order.pdf_url,
          description: `${order.pickup_city || "Abholung"} → ${order.dropoff_city || "Abgabe"}`,
        })),
    [orders]
  );

  const emptyState = !ordersLoading && !docsLoading && !orderDocs.length && !driverDocs.length;

  return (
    <div className="p-4 pb-24 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dokumente</h1>
        <p className="text-sm text-slate-500">Alle wichtigen Unterlagen auf einen Blick.</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-slate-700">
          <FolderOpen className="h-5 w-5 text-[#1e3a5f]" />
          <h2 className="text-base font-semibold">Auftragsbezogene Dokumente</h2>
        </div>
        {ordersLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </CardContent>
          </Card>
        ) : orderDocs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-500">
              Keine Auftragsdokumente vorhanden.
            </CardContent>
          </Card>
        ) : (
          orderDocs.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-semibold text-slate-900">{doc.title}</p>
                  <p className="text-xs text-slate-500">{doc.description}</p>
                </div>
                <Button
                  size="sm"
                  className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  onClick={() => window.open(doc.url, "_blank")}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Öffnen
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-slate-700">
          <FileText className="h-5 w-5 text-[#1e3a5f]" />
          <h2 className="text-base font-semibold">Allgemeine Dokumente</h2>
        </div>
        {docsLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </CardContent>
          </Card>
        ) : driverDocs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-500">
              Keine allgemeinen Dokumente vorhanden.
            </CardContent>
          </Card>
        ) : (
          driverDocs.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-semibold text-slate-900">{doc.title || "Dokument"}</p>
                  <p className="text-xs text-slate-500">
                    {doc.category === "general" ? "Für alle Fahrer" : "Nur für dich"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(doc.file_url, "_blank")}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {emptyState && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            Keine Dokumente gefunden. Bitte warte auf neue Uploads.
          </CardContent>
        </Card>
      )}

      {!currentDriver && user && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-500">
            Dein Fahrerprofil wurde noch nicht zugeordnet. Bitte kontaktiere den Admin.
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={() => (window.location.href = createPageUrl("DriverOrders"))}>
                Zurück zu Aufträgen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
