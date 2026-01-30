import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';

// Layouts
import MainLayout from './components/layout/MainLayout';
import AuthLayout from './components/layout/AuthLayout';

// Auth pages
import Login from './pages/auth/Login';

// Main pages
import Dashboard from './pages/Dashboard';
import LeadList from './pages/leads/LeadList';
import LeadDetail from './pages/leads/LeadDetail';
import LeadCreate from './pages/leads/LeadCreate';
import CampaignList from './pages/campaigns/CampaignList';
import ConversationList from './pages/conversations/ConversationList';
import ConversationDetail from './pages/conversations/ConversationDetail';
import TemplateList from './pages/templates/TemplateList';
import DataSourceList from './pages/data-sources/DataSourceList';
import ChannelList from './pages/channels/ChannelList';
import Analytics from './pages/analytics/Analytics';
import UserList from './pages/settings/UserList';
import Settings from './pages/settings/Settings';
import ProspectGroupList from './pages/prospects/ProspectGroupList';
import ProspectGroupDetail from './pages/prospects/ProspectGroupDetail';

// Loading component
import LoadingSpinner from './components/common/LoadingSpinner';

// Protected route component
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// Public route component (redirect if authenticated)
function PublicRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <LoadingSpinner fullScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  const initAuth = useAuthStore((state) => state.initAuth);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <AuthLayout>
              <Login />
            </AuthLayout>
          </PublicRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />

        {/* Leads */}
        <Route path="leads" element={<LeadList />} />
        <Route path="leads/new" element={<LeadCreate />} />
        <Route path="leads/:id" element={<LeadDetail />} />

        {/* Campaigns */}
        <Route path="campaigns" element={<CampaignList />} />

        {/* Conversations */}
        <Route path="conversations" element={<ConversationList />} />
        <Route path="conversations/:id" element={<ConversationDetail />} />

        {/* Templates */}
        <Route path="templates" element={<TemplateList />} />

        {/* Data Sources */}
        <Route path="data-sources" element={<DataSourceList />} />

        {/* Channels */}
        <Route path="channels" element={<ChannelList />} />

        {/* Prospects */}
        <Route path="prospects" element={<ProspectGroupList />} />
        <Route path="prospects/:type/:groupId" element={<ProspectGroupDetail />} />

        {/* Analytics */}
        <Route path="analytics" element={<Analytics />} />

        {/* Settings */}
        <Route path="settings" element={<Settings />} />
        <Route path="settings/users" element={<UserList />} />
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
