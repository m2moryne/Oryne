import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from './app/DashboardLayout'
import Activity from './app/pages/Activity'
import AgentDetail from './app/pages/AgentDetail'
import Approvals from './app/pages/Approvals'
import Agents from './app/pages/Agents'
import Funds from './app/pages/Funds'
import Services from './app/pages/Services'
import Wallet from './app/pages/Wallet'
import Overview from './app/pages/Overview'
import Settings from './app/pages/Settings'
import Billing from './app/dev/pages/Billing'
import Contracts from './app/dev/pages/Contracts'
import Merchant from './app/dev/pages/Merchant'
import Playground from './app/dev/pages/Playground'
import Debugger from './app/dev/pages/Debugger'
import { allDevPages } from './app/dev/devNav'
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
import { LiveLayout } from './live/LiveLayout'
import RealDebugger from './live/dev/Debugger'
import RealLogs from './live/dev/Logs'
import DevOverview from './live/dev/Overview'
import { Contracts as RealContracts, Merchant as RealMerchant, Sdks as RealSdks } from './live/dev/pages'
import { realPages } from './live/dev/shared'
import { UnderDevelopment } from './live/dev/UnderDevelopment'
import LiveActivity from './live/pages/LiveActivity'
import LiveAgentDetail from './live/pages/LiveAgentDetail'
import LiveAgents from './live/pages/LiveAgents'
import LiveApprovals from './live/pages/LiveApprovals'
import LiveOverview from './live/pages/LiveOverview'
import { Footer } from './components/Footer'
import { Navigation } from './components/Navigation'
import { ScrollManager } from './components/ScrollManager'
import { soonPages } from './lib/site'
import ComingSoon from './pages/ComingSoon'
import Contact from './pages/Contact'
import Home from './pages/Home'
import Product from './pages/Product'
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
          <Route path="/product" element={<Product />} />
          <Route path="/vision" element={<Vision />} />
          <Route path="/contact" element={<Contact />} />
          {soonPages.map((page) => (
            <Route key={page.path} path={page.path} element={<ComingSoon name={page.name} />} />
          ))}
        </Route>

        {/* One real sign-in, at /app. It also offers the preview account. */}
        <Route path="/login" element={<Navigate to="/app" replace />} />

        {/* The real dashboard: Stellar testnet, signed with Freighter. */}
        <Route path="/app" element={<LiveLayout />}>
          <Route index element={<LiveOverview />} />
          <Route path="agents" element={<LiveAgents />} />
          <Route path="agents/:key" element={<LiveAgentDetail />} />
          <Route path="approvals" element={<LiveApprovals />} />
          <Route path="activity" element={<LiveActivity />} />
          {/* The developer console for real accounts: real pages where they exist, the rest in development. */}
          <Route path="developers">
            <Route index element={<DevOverview />} />
            <Route path="agents" element={<LiveAgents />} />
            <Route path="sdks" element={<RealSdks />} />
            <Route path="merchant" element={<RealMerchant />} />
            <Route path="contracts" element={<RealContracts />} />
            <Route path="debugger" element={<RealDebugger />} />
            <Route path="logs" element={<RealLogs />} />
            {allDevPages
              .filter((page) => page.slug && !realPages.includes(page.slug))
              .map((page) => (
                <Route key={page.slug} path={page.slug} element={<UnderDevelopment slug={page.slug} />} />
              ))}
          </Route>
        </Route>

        {/* The preview account: the clickable demo on sample data, opened from the sign-in card. */}
        <Route path="/demo" element={<DashboardLayout area="agents" />}>
          <Route index element={<Overview />} />
          <Route path="agents" element={<Agents />} />
          <Route path="agents/:agentId" element={<AgentDetail />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="services" element={<Services />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="funds" element={<Funds />} />
          <Route path="activity" element={<Activity />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* The developer console: the same shell, a different set of pages. */}
        <Route path="/dev" element={<DashboardLayout area="developers" />}>
          <Route index element={<Quickstart />} />
          <Route path="playground" element={<Playground />} />
          <Route path="debugger" element={<Debugger />} />
          <Route path="merchant" element={<Merchant />} />
          <Route path="contracts" element={<Contracts />} />
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
        <Route path="/developers" element={<Navigate to="/app/developers" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </StoreProvider>
  )
}
