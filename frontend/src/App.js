import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import HealthAssessment from "./pages/HealthAssessment";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import ProfileSetup from "./pages/ProfileSetup";
import VerifyEmail from "./pages/VerifyEmail";
import Recommendation from "./pages/recommendation";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/register" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
          <Route path="/profile-setup" element={<ProfileSetup />} />
          <Route path="/health-assessment" element={<HealthAssessment />} />
          <Route element={<Dashboard />}>
            <Route path="/dashboard" />
            <Route path="/insights" />
            <Route path="/analytics" />
            <Route path="/profile" />
            <Route path="/nutrition" />
            <Route path="/tracking" />
          </Route>
          <Route path="/recommendations" element={<Recommendation />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
