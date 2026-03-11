import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import ClassDetail from './pages/ClassDetail';
import Tests from './pages/Tests';
import TestDetail from './pages/TestDetail';
import ScanUpload from './pages/ScanUpload';
import LiveScanner from './pages/LiveScanner';
import Results from './pages/Results';
import SchoolManagement from './pages/SchoolManagement';
import QuestionBank from './pages/QuestionBank';
import AdminPanel from './pages/AdminPanel';

function ProtectedRoute({ children }) {
  const { teacher, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
          <p className="text-gray-500">Loading MarkSnap...</p>
        </div>
      </div>
    );
  }

  if (!teacher) return <Navigate to="/login" />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="classes" element={<Classes />} />
        <Route path="classes/:classId" element={<ClassDetail />} />
        <Route path="tests" element={<Tests />} />
        <Route path="tests/:testId" element={<TestDetail />} />
        <Route path="scan/:testId" element={<ScanUpload />} />
        <Route path="live-scan/:testId" element={<LiveScanner />} />
        <Route path="results/:testId" element={<Results />} />
        <Route path="school" element={<SchoolManagement />} />
        <Route path="questions" element={<QuestionBank />} />
        <Route path="admin" element={<AdminPanel />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'text-sm',
          duration: 3000,
        }}
      />
      <AppRoutes />
    </AuthProvider>
  );
}
