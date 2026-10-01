import { Navigate, Route, Routes } from 'react-router-dom'
import { Footer } from './components/Footer'
import { Navigation } from './components/Navigation'
import { ScrollManager } from './components/ScrollManager'
import { soonPages } from './lib/site'
import ComingSoon from './pages/ComingSoon'
import Contact from './pages/Contact'
import Home from './pages/Home'
import Vision from './pages/Vision'

export default function App() {
  return (
    <>
      <ScrollManager />
      <a
        href="#main"
        className="type-label sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-charcoal focus:px-5 focus:py-3 focus:text-cream"
      >
        Skip to content
      </a>
      <Navigation />
      <main id="main" tabIndex={-1} className="outline-none">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/vision" element={<Vision />} />
          <Route path="/contact" element={<Contact />} />
          {soonPages.map((page) => (
            <Route key={page.path} path={page.path} element={<ComingSoon name={page.name} />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}
