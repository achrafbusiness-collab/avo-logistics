import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"
import ErrorBoundary from "@/components/ErrorBoundary"

function App() {
  return (
    <>
      <ErrorBoundary>
        <Pages />
      </ErrorBoundary>
      <Toaster />
    </>
  )
}

export default App
