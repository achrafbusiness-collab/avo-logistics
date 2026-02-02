import React from "react";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("UI crashed", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleLogin = () => {
    window.location.href = createPageUrl("Login");
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
          <h1 className="text-lg font-semibold text-[#1e3a5f]">Seite konnte nicht geladen werden</h1>
          <p className="mt-2 text-sm text-slate-600">
            Bitte Seite neu laden. Wenn der Fehler bleibt, prüfen Sie die Supabase CORS-Einstellungen
            für avo-logistics.app.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="bg-[#1e3a5f] hover:bg-[#2d5a8a]" onClick={this.handleReload}>
              Neu laden
            </Button>
            <Button variant="outline" onClick={this.handleLogin}>
              Zum Login
            </Button>
          </div>
          {this.state.error ? (
            <p className="mt-4 text-xs text-slate-400">Fehler: {String(this.state.error?.message || this.state.error)}</p>
          ) : null}
        </div>
      </div>
    );
  }
}
