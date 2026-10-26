import { CarePage } from './pages/CarePage';
import { ProviderPage } from './pages/ProviderPage';
import { ProviderVerificationPage } from './pages/ProviderVerificationPage';
import { AdminPage } from './pages/AdminPage';
import { ReceiptsPage } from './pages/ReceiptsPage';
import { useReducer } from 'react';
import { SecurityPage } from './pages/SecurityPage';
import { AccountPage } from './pages/AccountPage';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { JourneyPage } from './pages/JourneyPage';
import { CustomerHome } from './pages/CustomerHome';
import './pages/ReferencePortal.css';
import { ReferenceWorkspacePage } from './pages/ReferenceWorkspacePage';
import { StatusPage } from './pages/StatusPage';
import { HistoryPage } from './pages/HistoryPage';
import { FundingPage } from './pages/FundingPage';
import { FlowPage } from './pages/FlowPage';
import { InstitutionalMetricsPage } from './pages/InstitutionalMetricsPage';
import { DemoContext, demoReducer, initialDemo } from './features/demo';
import { AuthProvider } from './features/auth';
import { ChatPage } from './pages/ChatPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PartnerServicesPage } from './pages/PartnerServicesPage';
import { LoginPage } from './pages/LoginPage';
import { RoleLoginPage } from './pages/RoleLoginPage';
import { SponsorPage } from './pages/SponsorPage';
import { BankPage } from './pages/BankPage';
import { InstitutionalReviewsPage } from './pages/InstitutionalReviewsPage';
import { MfaLoginPage } from './pages/MfaLoginPage';
import { EmployerPage } from './pages/EmployerPage';
import { useAuth } from './features/auth-context';
import { isDemoDeployment } from './config';
import './styles/workspace.css';

export function App() {
  const [state, dispatch] = useReducer(demoReducer, initialDemo);
  const allowed = isDemoDeployment();
  const location = useLocation();
  return (
    <AuthProvider>
      <DemoContext.Provider
        value={{
          state: allowed ? state : initialDemo,
          dispatch: (action) => {
            if (allowed) dispatch(action);
          },
          allowed,
        }}
      >
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route path="login/mfa" element={<MfaLoginPage />} />
          <Route path="login/:role" element={<RoleLoginPage />} />
          <Route element={<AppShell />}>
            <Route index element={<EntryPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="account/security" element={<SecurityPage />} />
            <Route element={<RequireAuth />}>
              <Route path="dashboard" element={<CustomerHome />} />
              <Route path="customer/dashboard" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="pay"
                element={
                  state.active ? <FlowPage key={`pay-${state.active}`} flow="pay" /> : <CarePage />
                }
              />
              <Route path="customer/pay" element={<Navigate to="/pay" replace />} />
              <Route
                path="save"
                element={
                  state.active ? (
                    <FlowPage key={`save-${state.active}`} flow="save" />
                  ) : (
                    <FundingPage key="save" mode="save" />
                  )
                }
              />
              <Route path="customer/save" element={<Navigate to="/save" replace />} />
              <Route
                path="support"
                element={
                  state.active ? (
                    <FlowPage key={`support-${state.active}`} flow="support" />
                  ) : (
                    <FundingPage key="support" mode="support" />
                  )
                }
              />
              <Route path="customer/receive" element={<Navigate to="/support" replace />} />
              <Route
                path="history"
                element={
                  state.active ? <HistoryPage /> : <FundingPage key="history" mode="history" />
                }
              />
              <Route path="customer/transactions" element={<Navigate to="/history" replace />} />
              <Route path="customer/profile" element={<Navigate to="/account" replace />} />
              <Route
                path="contribute"
                element={<FundingPage key={`contribute-${location.hash}`} mode="contribute" />}
              />
              <Route path="institutional/provider" element={<ProviderPage />} />
              <Route
                path="provider/dashboard"
                element={<Navigate to="/institutional/provider" replace />}
              />
              <Route path="institutional/employer" element={<EmployerPage />} />
              <Route
                path="employer/dashboard"
                element={<Navigate to="/institutional/employer" replace />}
              />
              <Route
                path="employer/employees"
                element={<Navigate to="/institutional/employer?screen=employees" replace />}
              />
              <Route
                path="employer/contribute"
                element={<Navigate to="/institutional/employer?screen=contribute" replace />}
              />
              <Route
                path="employer/transactions"
                element={<Navigate to="/institutional/employer?screen=transactions" replace />}
              />
              <Route path="institutional/sponsor" element={<SponsorPage />} />
              <Route
                path="sponsor/dashboard"
                element={<Navigate to="/institutional/sponsor" replace />}
              />
              <Route
                path="sponsor/programs"
                element={<Navigate to="/institutional/sponsor?screen=programs" replace />}
              />
              <Route
                path="sponsor/beneficiaries"
                element={<Navigate to="/institutional/sponsor?screen=beneficiaries" replace />}
              />
              <Route
                path="sponsor/transactions"
                element={<Navigate to="/institutional/sponsor?screen=transactions" replace />}
              />
              <Route path="institutional/partner" element={<BankPage />} />
              <Route
                path="bank/dashboard"
                element={<Navigate to="/institutional/partner" replace />}
              />
              <Route
                path="bank/funding"
                element={<Navigate to="/institutional/partner?screen=funding" replace />}
              />
              <Route
                path="bank/reconcile"
                element={<Navigate to="/institutional/partner?screen=reconcile" replace />}
              />
              <Route
                path="bank/transactions"
                element={<Navigate to="/institutional/partner?screen=transactions" replace />}
              />
              <Route
                path="institutional/provider-verification"
                element={<ProviderVerificationPage />}
              />
              <Route path="admin" element={<AdminPage />} />
              <Route path="admin/overview" element={<Navigate to="/admin" replace />} />
              <Route
                path="admin/reviews"
                element={<Navigate to="/institutional/reviews" replace />}
              />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="receipts" element={<ReceiptsPage />} />
              <Route path="services/:section" element={<PartnerServicesPage />} />
              <Route path="institutional" element={<ReferenceWorkspacePage />} />
              <Route path="institutional/:role" element={<ReferenceWorkspacePage />} />
              <Route path="institutional/reviews" element={<InstitutionalReviewsPage />} />
              <Route
                path="institutional/metrics"
                element={<InstitutionalMetricsPage key={location.pathname + state.active} />}
              />
              <Route path="journey" element={<JourneyPage />} />
              <Route path="assistant" element={<ChatPage />} />
              <Route path="status" element={<StatusPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </DemoContext.Provider>
    </AuthProvider>
  );
}

function EntryPage() {
  const { signedIn, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={signedIn ? '/dashboard' : '/login'} replace />;
}

function RequireAuth() {
  const { signedIn, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!signedIn) {
    return (
      <Navigate to="/login" replace state={{ returnTo: location.pathname + location.search }} />
    );
  }
  return <Outlet />;
}
