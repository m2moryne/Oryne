import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { LiveLayout } from './live/LiveLayout'
import RealDebugger from './live/dev/Debugger'
import RealLogs from './live/dev/Logs'
import RealKeys from './live/dev/Keys'
import RealWebhooks from './live/dev/Webhooks'
import RealUsage from './live/dev/Usage'
import RealSettings from './live/dev/Settings'
import RealPlayground from './live/dev/Playground'
import RealTeam from './live/dev/Team'
import RealBilling from './live/dev/Billing'
import DevOverview from './live/dev/Overview'
import { Contracts as RealContracts, Merchant as RealMerchant, Sdks as RealSdks } from './live/dev/pages'
import LiveActivity from './live/pages/LiveActivity'
import LiveAgentDetail from './live/pages/LiveAgentDetail'
import LiveAgents from './live/pages/LiveAgents'
import LiveApprovals from './live/pages/LiveApprovals'
import LiveOverview from './live/pages/LiveOverview'
import LiveWallet from './live/pages/LiveWallet'
import LiveFunds from './live/pages/LiveFunds'
import { AddMoneyPage } from './live/pages/AddMoney'
import LiveServices from './live/pages/LiveServices'
import { Footer } from './components/Footer'
import { Navigation } from './components/Navigation'
import { ScrollManager } from './components/ScrollManager'
import { soonPages } from './lib/site'
import ComingSoon from './pages/ComingSoon'
import Contact from './pages/Contact'
import Home from './pages/Home'
import HowItWorks from './pages/HowItWorks'
import Docs from './pages/Docs'
import About from './pages/About'
import Pricing from './pages/Pricing'
import Privacy from './pages/Privacy'
import Security from './pages/Security'
import Status from './pages/Status'
import Terms from './pages/Terms'
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
    <>
      <ScrollManager />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/product" element={<Product />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/vision" element={<Vision />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/about" element={<About />} />
          <Route path="/status" element={<Status />} />
          <Route path="/security" element={<Security />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          {soonPages.map((page) => (
            <Route key={page.path} path={page.path} element={<ComingSoon name={page.name} />} />
          ))}
        </Route>

        {/* One sign-in, at /app. */}
        <Route path="/login" element={<Navigate to="/app" replace />} />

        {/* The real dashboard: Stellar testnet, signed with Freighter. */}
        <Route path="/app" element={<LiveLayout />}>
          <Route index element={<LiveOverview />} />
          <Route path="agents" element={<LiveAgents />} />
          <Route path="agents/:key" element={<LiveAgentDetail />} />
          <Route path="approvals" element={<LiveApprovals />} />
          <Route path="activity" element={<LiveActivity />} />
          <Route path="wallet" element={<LiveWallet />} />
          <Route path="funds" element={<LiveFunds />} />
          <Route path="add-money" element={<AddMoneyPage />} />
          <Route path="services" element={<LiveServices />} />
          <Route path="team" element={<RealTeam />} />
          <Route path="billing" element={<RealBilling />} />
          <Route path="settings" element={<RealSettings />} />
          {/* The developer console for real accounts: real pages where they exist, the rest in development. */}
          <Route path="developers">
            <Route index element={<DevOverview />} />
            <Route path="agents" element={<LiveAgents />} />
            <Route path="sdks" element={<RealSdks />} />
            <Route path="merchant" element={<RealMerchant />} />
            <Route path="contracts" element={<RealContracts />} />
            <Route path="debugger" element={<RealDebugger />} />
            <Route path="logs" element={<RealLogs />} />
            <Route path="keys" element={<RealKeys />} />
            <Route path="webhooks" element={<RealWebhooks />} />
            <Route path="usage" element={<RealUsage />} />
            <Route path="settings" element={<RealSettings />} />
            <Route path="playground" element={<RealPlayground />} />
            <Route path="team" element={<RealTeam />} />
            <Route path="funds" element={<LiveFunds />} />
            <Route path="add-money" element={<AddMoneyPage />} />
            <Route path="approvals" element={<LiveApprovals />} />
            <Route path="agents/:key" element={<LiveAgentDetail />} />
            <Route path="billing" element={<RealBilling />} />
          </Route>
        </Route>

        {/* Old preview paths, kept so links people saved still land somewhere real. */}
        <Route path="/demo/*" element={<Navigate to="/app" replace />} />
        <Route path="/dev/*" element={<Navigate to="/app/developers" replace />} />
        <Route path="/developers" element={<Navigate to="/app/developers" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
