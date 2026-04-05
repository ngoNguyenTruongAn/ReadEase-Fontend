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
// import HomePage from "./components/Web/Children/ChildrenLayout";

function App() {
  return (
    <Routes>
      {/* login */}
      <Route element={<LoginLayout />}>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/validate" element={<VerifyEmailPage />} />
        <Route path="/select-role" element={<SelectRolePage />} />
      </Route>

      {/* children */}
      <Route path="/children" element={<ChildrenLayout />}>
        <Route path="/children/profile" element={<ProfileLayout />} />
        <Route path="/children/library" element={<LibararyPage />} />
        <Route path="/children/store" element={<StorePage />} />
        {/* <Route path="/children/profile" element={<ProfilePage />} /> */}
        <Route path="library" element={<LibararyPage />} />
        {/* <Route path="/children/store" element={<StorePage />} /> */}
      </Route>

      {/* standalone calibration */}
      <Route
        path="/children/calibration/start"
        element={<CalibrationStartPage />}
      />
    </Routes>
  );
}

export default App;
