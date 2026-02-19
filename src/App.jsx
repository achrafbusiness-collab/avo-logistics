import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"
import ErrorBoundary from "@/components/ErrorBoundary"
import CustomerProtocolNoticeHost from "@/components/system/CustomerProtocolNoticeHost"

function App() {
  return (
    <>
      <ErrorBoundary>
        <Pages />
      </ErrorBoundary>
      <CustomerProtocolNoticeHost />
      <Toaster />
    </>
  )
}

export default App
