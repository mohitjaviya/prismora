import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import DistributorSignup from './pages/DistributorSignup';
import DealerSignup from './pages/DealerSignup';
import RetailerSignup from './pages/RetailerSignup';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Orders from './pages/Orders';
import Geography from './pages/Geography';
import Settings from './pages/Settings';
import Customers from './pages/Customers';
import Profile from './pages/Profile';
import Accounting from './pages/Accounting';
import Inventory from './pages/Inventory';
import Purchases from './pages/Purchases';
import Distributors from './pages/Distributors';
import Dealers from './pages/Dealers';
import Retailers from './pages/Retailers';
import Complaints from './pages/Complaints';
import Schemes from './pages/Schemes';
import Reports from './pages/Reports';
import AIInsights from './pages/AIInsights';
import SFA from './pages/SFA';
import DistributorOrders from './pages/DistributorOrders';
import DealerOrders from './pages/DealerOrders';
import RetailerOrders from './pages/RetailerOrders';
import Ledger from './pages/Ledger';
import Claims from './pages/Claims';
import Incentives from './pages/Incentives';
import Stock from './pages/Stock';
import PriceList from './pages/PriceList';

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

function AppRoutes() {
  return (
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
        <Route path="geography" element={<PermissionGuard module="geography"><Geography /></PermissionGuard>} />
        <Route path="settings" element={<PermissionGuard module="settings"><Settings /></PermissionGuard>} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
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
