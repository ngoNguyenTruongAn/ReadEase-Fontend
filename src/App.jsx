import { Navigate, Route, Routes } from "react-router-dom";
import LoginLayout from "./components/Login/LoginLayout";
import LoginPage from "./components/Login/LoginPage/LoginPage";
import RegisterPage from "./components/Login/RegisterPage/RegisterPage";
import VerifyEmailPage from "./components/Login/RegisterPage/VerifyEmailPage/VerifyEmailPage";
import SelectRolePage from "./components/Login/RegisterPage/SelectRolePage/SelectRolePage";
import ChildrenLayout from "./components/Web/Children/ChildrenLayout";
import LibararyPage from "./components/Web/Children/Library/LibararyPage";
import StorePage from "./components/Web/Children/Store/StorePage";
import ProfileLayout from "./components/Web/Profile/ProfileLayout";
import CalibrationStartPage from "./components/Web/Children/CalibrationStart/CalibrationStartPage";
import ReadingPage from "./components/Web/Children/Reading/ReadingPage";
import ForgotPassword from "./components/Login/LoginPage/ForgotPassword/ForgotPassword";
import ForgotPasswordConfirm from "./components/Login/LoginPage/ForgotPassword/ForgotPasswordConfirm";
import { ToastContainer } from "react-toastify";
import GuardianLayout from "./components/Web/Guardian/GuardianLayout";
import DashboardGuardian from "./components/Web/Guardian/DashboardGuardian/DashboardGuardian";
import Children from "./components/Web/Guardian/Children/Children";
import ClinicianLayout from "./components/Web/Clinician/ClinicianLayout";
import DashboardClinician from "./components/Web/Clinician/DashboardClinician/DashboardClinician";
import Patients from "./components/Web/Clinician/Patients/Patients";
import Reports from "./components/Web/Clinician/Reports/Reports";
import ClinicianProfile from "./components/Web/Clinician/Profile/ClinicianProfile";
import Content from "./components/Web/Clinician/Content/Content";
function App() {
  return (
    <>
      <Routes>
        {/* login */}
        <Route element={<LoginLayout />}>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/validate" element={<VerifyEmailPage />} />
          <Route path="/select-role" element={<SelectRolePage />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route
            path="/forgot-password/confirm"
            element={<ForgotPasswordConfirm />}
          />
        </Route>

        {/* children */}
        <Route path="/children" element={<ChildrenLayout />}>
          <Route path="/children/profile" element={<ProfileLayout />} />
          <Route path="/children/library" element={<LibararyPage />} />
          <Route path="/children/store" element={<StorePage />} />
        </Route>

        {/* standalone calibration */}
        <Route
          path="/children/calibration/start"
          element={<CalibrationStartPage />}
        />

        {/* standalone reading */}
        <Route path="/children/reading" element={<ReadingPage />} />

        <Route path="/guardian" element={<GuardianLayout />}>
          <Route path="/guardian" element={<DashboardGuardian />} />
          <Route path="/guardian/children" element={<Children />} />
        </Route>

        {/* clinician */}
        <Route path="/clinician" element={<ClinicianLayout />}>
          <Route path="/clinician" element={<DashboardClinician />} />
          <Route path="/clinician/contents" element={<Content />} />
          <Route path="/clinician/patients" element={<Patients />} />
          <Route path="/clinician/reports" element={<Reports />} />
          <Route path="/clinician/profile" element={<ClinicianProfile />} />
        </Route>
      </Routes>

      {/* guardian */}

      <ToastContainer
        position="top-right"
        autoClose={2000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
      />
    </>
  );
}

export default App;
