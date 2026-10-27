import { ProviderPage } from './pages/ProviderPage';
import { ProviderVerificationPage } from './pages/ProviderVerificationPage';
import { AdminPage } from './pages/AdminPage';
import { ReceiptsPage } from './pages/ReceiptsPage';
import { useReducer } from 'react';
import { SecurityPage } from './pages/SecurityPage';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { JourneyPage } from './pages/JourneyPage';
import { CustomerHome } from './pages/CustomerHome';
import './pages/ReferencePortal.css';
import { ReferenceWorkspacePage } from './pages/ReferenceWorkspacePage';
import { StatusPage } from './pages/StatusPage';
import { FundingPage } from './pages/FundingPage';
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
import { CustomerFundingPage } from './pages/CustomerFundingPage';
import { CustomerReceiveFundsPage } from './pages/CustomerReceiveFundsPage';
import { CustomerProvidersPage } from './pages/CustomerProvidersPage';
import { CustomerPayProviderPage } from './pages/CustomerPayProviderPage';
import { CustomerProfilePage } from './pages/CustomerProfilePage';
import { EmployerWorkspacePage } from './pages/EmployerWorkspacePage';
import { ProviderWorkspacePage } from './pages/ProviderWorkspacePage';
import { PartnerWorkspacePage } from './pages/PartnerWorkspacePage';
import { SponsorWorkspacePage } from './pages/SponsorWorkspacePage';
import { OperationsWorkspacePage } from './pages/OperationsWorkspacePage';
import { useAuth } from './features/auth-context';
import { hasAnyRole, hasInstitutionalRole } from './features/roles';
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
            <Route path="account" element={<AccountEntry />} />
            <Route path="account/security" element={<SecurityPage />} />
            <Route element={<RequireAuth />}>
              <Route path="dashboard" element={<CustomerHome />} />
              <Route path="customer/dashboard" element={<Navigate to="/dashboard" replace />} />
              <Route path="pay" element={<Navigate to="/customer/pay" replace />} />
              <Route path="customer/pay" element={<CustomerPayProviderPage />} />
              <Route path="save" element={<Navigate to="/dashboard" replace />} />
              <Route path="customer/save" element={<CustomerFundingPage />} />
              <Route path="support" element={<Navigate to="/dashboard" replace />} />
              <Route path="customer/receive" element={<CustomerReceiveFundsPage />} />
              <Route path="history" element={<Navigate to="/receipts" replace />} />
              <Route path="customer/transactions" element={<ReceiptsPage />} />
              <Route
                path="customer/insurance"
                element={<PartnerServicesPage section="insurance" />}
              />
              <Route path="customer/providers" element={<CustomerProvidersPage />} />
              <Route path="customer/ussd" element={<PartnerServicesPage section="ussd" />} />
              <Route path="customer/orange-money" element={<CustomerFundingPage orangeMoney />} />
              <Route path="customer/profile" element={<CustomerProfilePage />} />
              <Route
                path="contribute"
                element={<FundingPage key={`contribute-${location.hash}`} mode="contribute" />}
              />
              <Route
                element={
                  <RequireRoles roles={['provider_admin', 'provider_manager', 'provider_staff']} />
                }
              >
                <Route
                  path="institutional/provider"
                  element={<Navigate to="/provider/dashboard" replace />}
                />
                <Route path="provider/dashboard" element={<ProviderWorkspacePage />} />
                <Route
                  path="provider/verify-patient"
                  element={<ProviderPage screen="verify-patient" />}
                />
                <Route path="provider/payments" element={<ProviderPage screen="payments" />} />
                <Route path="provider/profile" element={<ProviderPage screen="profile" />} />
              </Route>
              <Route element={<RequireRoles roles={['employer_admin']} />}>
                <Route
                  path="institutional/employer"
                  element={<Navigate to="/employer/dashboard" replace />}
                />
                <Route
                  path="employer/dashboard"
                  element={<EmployerWorkspacePage screen="dashboard" />}
                />
                <Route
                  path="employer/employees"
                  element={<EmployerWorkspacePage screen="employees" />}
                />
                <Route
                  path="employer/contribute"
                  element={<EmployerWorkspacePage screen="contribute" />}
                />
                <Route
                  path="employer/transactions"
                  element={<EmployerWorkspacePage screen="transactions" />}
                />
              </Route>
              <Route element={<RequireRoles roles={['sponsor_admin']} />}>
                <Route
                  path="institutional/sponsor"
                  element={<Navigate to="/sponsor/dashboard" replace />}
                />
                <Route path="sponsor/dashboard" element={<SponsorWorkspacePage />} />
                <Route path="sponsor/programs" element={<SponsorPage screen="programs" />} />
                <Route
                  path="sponsor/beneficiaries"
                  element={<SponsorPage screen="beneficiaries" />}
                />
                <Route
                  path="sponsor/transactions"
                  element={<SponsorPage screen="transactions" />}
                />
              </Route>
              <Route element={<RequireRoles roles={['partner_officer']} />}>
                <Route
                  path="institutional/partner"
                  element={<Navigate to="/bank/dashboard" replace />}
                />
                <Route path="bank/dashboard" element={<PartnerWorkspacePage />} />
                <Route path="bank/funding" element={<BankPage screen="funding" />} />
                <Route path="bank/reconcile" element={<BankPage screen="reconcile" />} />
                <Route path="bank/transactions" element={<BankPage screen="transactions" />} />
              </Route>
              <Route element={<RequireRoles roles={['platform_admin']} />}>
                <Route
                  path="institutional/provider-verification"
                  element={<ProviderVerificationPage />}
                />
                <Route path="operations/providers" element={<ProviderVerificationPage />} />
                <Route path="operations/admin" element={<AdminPage />} />
                <Route path="admin" element={<Navigate to="/operations/dashboard" replace />} />
                <Route
                  path="admin/overview"
                  element={<Navigate to="/operations/dashboard" replace />}
                />
                <Route
                  path="institutional/metrics"
                  element={<InstitutionalMetricsPage key={location.pathname + state.active} />}
                />
              </Route>
              <Route element={<RequireRoles roles={['platform_admin', 'reviewer']} />}>
                <Route path="operations/dashboard" element={<OperationsWorkspacePage />} />
                <Route path="operations/reviews" element={<InstitutionalReviewsPage />} />
                <Route
                  path="admin/reviews"
                  element={<Navigate to="/operations/reviews" replace />}
                />
                <Route
                  path="institutional/reviews"
                  element={<Navigate to="/operations/reviews" replace />}
                />
              </Route>
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="receipts" element={<ReceiptsPage />} />
              <Route path="services/:section" element={<PartnerServicesPage />} />
              <Route element={<RequireInstitutionalRole />}>
                <Route path="institutional" element={<ReferenceWorkspacePage />} />
                <Route path="institutional/:role" element={<ReferenceWorkspacePage />} />
              </Route>
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

function AccountEntry() {
  const { signedIn, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={signedIn ? '/customer/profile' : '/login'} replace />;
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

function RequireRoles({ roles }: { roles: readonly string[] }) {
  const { profile, loading } = useAuth();
  if (loading) return null;
  return hasAnyRole(profile?.roles, roles) ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

function RequireInstitutionalRole() {
  const { profile, loading } = useAuth();
  if (loading) return null;
  return hasInstitutionalRole(profile?.roles) ? <Outlet /> : <Navigate to="/dashboard" replace />;
}
