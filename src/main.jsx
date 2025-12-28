import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '@/App.jsx'
import '@/index.css'
import { initSystemLogger } from '@/lib/systemLog'
import { I18nProvider } from '@/i18n'

const queryClient = new QueryClient()

initSystemLogger()

ReactDOM.createRoot(document.getElementById('root')).render(
    <QueryClientProvider client={queryClient}>
        <I18nProvider>
            <App />
        </I18nProvider>
    </QueryClientProvider>
)

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
