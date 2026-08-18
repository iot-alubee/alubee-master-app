import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ConnectivityBar from './components/ConnectivityBar';
import { initPushNotifications } from './utils/pushNotifications';
import WebPushPrompt from './components/WebPushPrompt';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'sans-serif',flexDirection:'column',gap:'16px',padding:'20px',textAlign:'center' }}>
          <div style={{ fontSize:'48px' }}>⚠️</div>
          <h2 style={{ color:'#dc2626' }}>Something went wrong</h2>
          <p style={{ color:'#666',maxWidth:'400px' }}>{this.state.error?.message || 'Unknown error'}</p>
          <button onClick={() => window.location.href='/login'}
            style={{ background:'#f97316',color:'#fff',border:'none',borderRadius:'8px',padding:'10px 24px',cursor:'pointer',fontSize:'14px',fontWeight:'700' }}>
            Back to Login
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function PrivateRoute({ children }) {
  const { currentUser, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'sans-serif',color:'#999',flexDirection:'column',gap:'12px' }}>
      <div style={{ width:'32px',height:'32px',border:'3px solid #f97316',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite' }} />
      <span>Loading...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  return currentUser ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  return currentUser ? <Navigate to="/dashboard" replace /> : children;
}

// Init push notifications once user is logged in
function PushInitializer() {
  const { userProfile } = useAuth();
  useEffect(() => {
    if (!userProfile) return;
    initPushNotifications(userProfile, (notification) => {
      console.log('Push received:', notification?.title || notification);
    });
  }, [userProfile?.id, userProfile?.mobile, userProfile?.appRole]);
  return <WebPushPrompt userProfile={userProfile} />;
}

function AppRoutes() {
  return (
    <>
      <PushInitializer />
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><ErrorBoundary><DashboardPage /></ErrorBoundary></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <ConnectivityBar />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
