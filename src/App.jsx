import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
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
  const { user } = useAuth();
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

const RouteFallback = () => (
  <div className="flex items-center justify-center p-16 text-slate-500 text-sm">Loading…</div>
);

function AppRoutes() {
  return (
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
        <Route path="settings" element={<PermissionGuard module="settings"><Settings /></PermissionGuard>} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
    </Suspense>
  );
}

import { NotificationProvider } from './context/NotificationContext';

function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <NotificationProvider>
          <Router>
            <AppRoutes />
          </Router>
        </NotificationProvider>
      </DataProvider>
    </AuthProvider>
  );
}

export default App;
