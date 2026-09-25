import { Component, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { dataSessionKey } from './utils/dataSession';
import Layout from './components/Layout';
import Login from './pages/Login';
const DistributorSignup = lazy(() => import('./pages/DistributorSignup'));
const DealerSignup = lazy(() => import('./pages/DealerSignup'));
const RetailerSignup = lazy(() => import('./pages/RetailerSignup'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Leads = lazy(() => import('./pages/Leads'));
const Orders = lazy(() => import('./pages/Orders'));
const Geography = lazy(() => import('./pages/Geography'));
const Settings = lazy(() => import('./pages/Settings'));
const Masters = lazy(() => import('./pages/Masters'));
const TeamMembers = lazy(() => import('./pages/masters/TeamMembers'));
const ProductCatalog = lazy(() => import('./pages/masters/ProductCatalog'));
const Roles = lazy(() => import('./pages/masters/Roles'));
const Customers = lazy(() => import('./pages/Customers'));
const Profile = lazy(() => import('./pages/Profile'));
const Accounting = lazy(() => import('./pages/Accounting'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Purchases = lazy(() => import('./pages/Purchases'));
const Distributors = lazy(() => import('./pages/Distributors'));
const Dealers = lazy(() => import('./pages/Dealers'));
const Retailers = lazy(() => import('./pages/Retailers'));
const Complaints = lazy(() => import('./pages/Complaints'));
const Schemes = lazy(() => import('./pages/Schemes'));
const Reports = lazy(() => import('./pages/Reports'));
const AIInsights = lazy(() => import('./pages/AIInsights'));
const MLLab = lazy(() => import('./pages/MLLab'));
const SFA = lazy(() => import('./pages/SFA'));
const DistributorOrders = lazy(() => import('./pages/DistributorOrders'));
const DealerOrders = lazy(() => import('./pages/DealerOrders'));
const RetailerOrders = lazy(() => import('./pages/RetailerOrders'));
const Ledger = lazy(() => import('./pages/Ledger'));
const Claims = lazy(() => import('./pages/Claims'));
const Incentives = lazy(() => import('./pages/Incentives'));
const Stock = lazy(() => import('./pages/Stock'));
const PriceList = lazy(() => import('./pages/PriceList'));

const ProtectedRoute = ({ children }) => {
  const { user, authReady } = useAuth();
  // "No user yet" and "no user" are different answers. Reading the Supabase
  // session takes a moment, and redirecting during that moment sent a signed-in
  // person to the login page on every refresh — the slower the connection, the
  // more reliably it happened.
  if (!user && !authReady) return <RouteFallback />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const OrdersRoute = () => {
  const { user } = useAuth();
  if (user?.role === 'Distributor') return <DistributorOrders />;
  if (user?.role === 'Dealer') return <DealerOrders />;
  if (user?.role === 'Retailer') return <RetailerOrders />;
  return <Orders />;
};

// Redirects to dashboard with access-denied message if user lacks module permission
const PermissionGuard = ({ module, children }) => {
  const { canAccess } = useAuth();
  if (!canAccess(module)) return <Navigate to="/?denied=1" replace />;
  return children;
};

/**
 * Keeps one broken screen from taking the whole application down.
 *
 * Without this, an error thrown while rendering any page propagates to the
 * root, React unmounts everything, and the user is left on a blank white page
 * with no way back — including no way to navigate away from the route that
 * caused it, because reloading lands on it again.
 */
class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Prismora] A screen failed to render:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-10 max-w-xl mx-auto text-center">
        <h1 className="text-xl font-bold text-white mb-2">This screen could not be opened</h1>
        <p className="text-sm text-slate-400 leading-relaxed mb-5">
          Something went wrong while loading this page. The rest of the app is unaffected — go back to the
          dashboard and try again. If it keeps happening, the details are in the browser console.
        </p>
        <p className="text-[11px] text-slate-600 font-mono break-words mb-5">{String(this.state.error?.message || this.state.error)}</p>
        <button
          onClick={() => { this.setState({ error: null }); window.location.assign('/'); }}
          className="px-5 py-2 bg-brand-accent text-white font-bold rounded-lg hover:bg-brand-accent-light transition-colors"
        >
          Back to dashboard
        </button>
      </div>
    );
  }
}

const RouteFallback = () => (
  <div className="flex items-center justify-center p-16 text-slate-500 text-sm">Loading…</div>
);

function AppRoutes() {
  return (
    <RouteErrorBoundary>
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register-distributor" element={<DistributorSignup />} />
      <Route path="/register-dealer" element={<DealerSignup />} />
      <Route path="/register-retailer" element={<RetailerSignup />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="leads" element={<PermissionGuard module="leads"><Leads /></PermissionGuard>} />
        <Route path="sfa" element={<PermissionGuard module="sfa"><SFA /></PermissionGuard>} />
        <Route path="orders" element={<PermissionGuard module="orders"><OrdersRoute /></PermissionGuard>} />
        <Route path="ledger" element={<PermissionGuard module="ledger"><Ledger /></PermissionGuard>} />
        <Route path="claims" element={<PermissionGuard module="claims"><Claims /></PermissionGuard>} />
        <Route path="incentives" element={<PermissionGuard module="incentives"><Incentives /></PermissionGuard>} />
        <Route path="stock" element={<PermissionGuard module="stock"><Stock /></PermissionGuard>} />
        <Route path="price-list" element={<PermissionGuard module="priceList"><PriceList /></PermissionGuard>} />
        <Route path="customers" element={<PermissionGuard module="customers"><Customers /></PermissionGuard>} />
        <Route path="accounting" element={<PermissionGuard module="accounting"><Accounting /></PermissionGuard>} />
        <Route path="inventory" element={<PermissionGuard module="inventory"><Inventory /></PermissionGuard>} />
        <Route path="purchases" element={<PermissionGuard module="purchases"><Purchases /></PermissionGuard>} />
        <Route path="distributors" element={<PermissionGuard module="distributors"><Distributors /></PermissionGuard>} />
        <Route path="dealers" element={<PermissionGuard module="dealers"><Dealers /></PermissionGuard>} />
        <Route path="retailers" element={<PermissionGuard module="retailers"><Retailers /></PermissionGuard>} />
        <Route path="complaints" element={<PermissionGuard module="complaints"><Complaints /></PermissionGuard>} />
        <Route path="schemes" element={<PermissionGuard module="schemes"><Schemes /></PermissionGuard>} />
        <Route path="reports" element={<PermissionGuard module="reports"><Reports /></PermissionGuard>} />
        <Route path="ai-insights" element={<PermissionGuard module="reports"><AIInsights /></PermissionGuard>} />
        <Route path="ml-lab" element={<PermissionGuard module="reports"><MLLab /></PermissionGuard>} />
        <Route path="geography" element={<PermissionGuard module="geography"><Geography /></PermissionGuard>} />
        {/* Settings checks access itself: its Audit Log tab is for Super Admin,
            Admin and Director, and Director has no Settings permission. */}
        <Route path="settings" element={<Settings />} />
        {/* Master data, as its own section. /masters lands on the option
            lists, which is what most visits are for. */}
        <Route path="masters" element={<Navigate to="/masters/lists" replace />} />
        <Route path="masters/lists" element={<PermissionGuard module="settings"><Masters /></PermissionGuard>} />
        <Route path="masters/team" element={<PermissionGuard module="settings"><TeamMembers /></PermissionGuard>} />
        <Route path="masters/products" element={<PermissionGuard module="settings"><ProductCatalog /></PermissionGuard>} />
        <Route path="masters/roles" element={<PermissionGuard module="settings"><Roles /></PermissionGuard>} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
    </Suspense>
    </RouteErrorBoundary>
  );
}

import { NotificationProvider } from './context/NotificationContext';
import { DialogProvider } from './context/DialogContext';

// The data layer is rebuilt for each signed-in user. It used to be mounted once
// on the login page, fetch as nobody, and keep that empty result after sign-in
// — blank screens on a new device until a hard refresh. The router sits above
// it so a sign-in does not lose the page it is navigating to.
function DataForSession({ children }) {
  const { user, authReady } = useAuth();
  return <DataProvider key={dataSessionKey({ authReady, user })}>{children}</DataProvider>;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <DataForSession>
          <NotificationProvider>
            <DialogProvider>
              <AppRoutes />
            </DialogProvider>
          </NotificationProvider>
        </DataForSession>
      </Router>
    </AuthProvider>
  );
}

export default App;
