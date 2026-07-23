import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import PatientsPage from './pages/PatientsPage';
import PatientDetailPage from './pages/PatientDetailPage';
import EscalationsPage from './pages/EscalationsPage';
import SettingsPage from './pages/SettingsPage';
import SimulatorPage from './pages/SimulatorPage';
import AdminWorkersPage from './pages/AdminWorkersPage';
import DoctorDashboard from './pages/DoctorDashboard';
import { useAuthStore } from './hooks/useAuthStore';

// Access Control Guard for Administrative Portal Pages
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  
  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Universal and Role-Specific routes */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/doctor-dashboard" element={<DoctorDashboard />} />
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/patients/new" element={<PatientsPage showNew />} />
          <Route path="/patients/:id" element={<PatientDetailPage />} />
          
          {/* Strict Admin Portal routes */}
          <Route 
            path="/escalations" 
            element={
              <AdminRoute>
                <EscalationsPage />
              </AdminRoute>
            } 
          />
          <Route 
            path="/admin/workers" 
            element={
              <AdminRoute>
                <AdminWorkersPage />
              </AdminRoute>
            } 
          />
          
          {/* Standard operational routes */}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/simulator" element={<SimulatorPage />} />
        </Route>
        
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
