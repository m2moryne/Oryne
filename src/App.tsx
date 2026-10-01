import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from './app/DashboardLayout'
import Activity from './app/pages/Activity'
import AgentDetail from './app/pages/AgentDetail'
import Approvals from './app/pages/Approvals'
import Agents from './app/pages/Agents'
import Funds from './app/pages/Funds'
import Overview from './app/pages/Overview'
import Settings from './app/pages/Settings'
import Billing from './app/dev/pages/Billing'
import DevAgents from './app/dev/pages/DevAgents'
import DevSettings from './app/dev/pages/DevSettings'
import Keys from './app/dev/pages/Keys'
import Logs from './app/dev/pages/Logs'
import Quickstart from './app/dev/pages/Quickstart'
import Sdks from './app/dev/pages/Sdks'
import Team from './app/dev/pages/Team'
import Usage from './app/dev/pages/Usage'
import Webhooks from './app/dev/pages/Webhooks'
import { StoreProvider } from './app/store'
import { Footer } from './components/Footer'
import { Navigation } from './components/Navigation'
import { ScrollManager } from './components/ScrollManager'
import { soonPages } from './lib/site'
import ComingSoon from './pages/ComingSoon'
import Contact from './pages/Contact'
import Home from './pages/Home'
import SignIn from './pages/SignIn'
import Vision from './pages/Vision'

/** The public website: navigation bar, page, footer. */
function SiteLayout() {
  return (
    <>
      <a
        href="#main"
        className="type-label sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-charcoal focus:px-5 focus:py-3 focus:text-cream"
      >
        Skip to content
      </a>
      <Navigation />
      <main id="main" tabIndex={-1} className="outline-none">
        <Outlet />
      </main>
      <Footer />
    </>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <ScrollManager />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/vision" element={<Vision />} />
          <Route path="/contact" element={<Contact />} />
          {soonPages.map((page) => (
            <Route key={page.path} path={page.path} element={<ComingSoon name={page.name} />} />
          ))}
        </Route>

        <Route path="/login" element={<SignIn />} />

        {/* The dashboard has its own chrome and requires sign-in. */}
        <Route path="/app" element={<DashboardLayout area="agents" />}>
          <Route index element={<Overview />} />
          <Route path="agents" element={<Agents />} />
          <Route path="agents/:agentId" element={<AgentDetail />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="funds" element={<Funds />} />
          <Route path="activity" element={<Activity />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* The developer console: the same shell, a different set of pages. */}
        <Route path="/dev" element={<DashboardLayout area="developers" />}>
          <Route index element={<Quickstart />} />
          <Route path="keys" element={<Keys />} />
          <Route path="webhooks" element={<Webhooks />} />
          <Route path="logs" element={<Logs />} />
          <Route path="usage" element={<Usage />} />
          <Route path="sdks" element={<Sdks />} />
          <Route path="agents" element={<DevAgents />} />
          <Route path="team" element={<Team />} />
          <Route path="billing" element={<Billing />} />
          <Route path="settings" element={<DevSettings />} />
        </Route>
        <Route path="/developers" element={<Navigate to="/dev" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </StoreProvider>
  )
}
