import { ProviderPage } from './pages/ProviderPage';
import { ProviderVerificationPage } from './pages/ProviderVerificationPage';
import { CarePage } from './pages/CarePage';
import { useReducer } from 'react';
import { SecurityPage } from './pages/SecurityPage';
import { AccountPage } from './pages/AccountPage';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { JourneyPage } from './pages/JourneyPage';
import { CustomerHome } from './pages/CustomerHome';
import { StatusPage } from './pages/StatusPage';
import { HistoryPage } from './pages/HistoryPage';
import { FundingPage } from './pages/FundingPage';
import { FlowPage } from './pages/FlowPage';
import { InstitutionalPage } from './pages/InstitutionalPage';
import { InstitutionalReviewsPage } from './pages/InstitutionalReviewsPage';
import { InstitutionalMetricsPage } from './pages/InstitutionalMetricsPage';
import { DemoContext, demoReducer, initialDemo } from './features/demo';
import { AuthProvider } from './features/auth';
import { ChatPage } from './pages/ChatPage';
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
          <Route element={<AppShell />}>
            <Route index element={<CustomerHome />} />
            <Route
              path="pay"
              element={
                state.active ? <FlowPage key={`pay-${state.active}`} flow="pay" /> : <CarePage />
              }
            />
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
            <Route
              path="history"
              element={
                state.active ? <HistoryPage /> : <FundingPage key="history" mode="history" />
              }
            />
            <Route
              path="contribute"
              element={<FundingPage key={`contribute-${location.hash}`} mode="contribute" />}
            />
            <Route
              path="institutional/provider"
              element={state.active ? <InstitutionalPage /> : <ProviderPage />}
            />
            <Route
              path="institutional/provider-verification"
              element={<ProviderVerificationPage />}
            />
            <Route path="institutional" element={<InstitutionalPage key="access" />} />
            <Route
              path="institutional/:role"
              element={<InstitutionalPage key={location.pathname + state.active} />}
            />
            <Route
              path="institutional/reviews"
              element={<InstitutionalReviewsPage key={location.pathname + state.active} />}
            />
            <Route
              path="institutional/metrics"
              element={<InstitutionalMetricsPage key={location.pathname + state.active} />}
            />
            <Route path="journey" element={<JourneyPage />} />
            <Route path="assistant" element={<ChatPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="account/security" element={<SecurityPage />} />
            <Route path="status" element={<StatusPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </DemoContext.Provider>
    </AuthProvider>
  );
}
