import React, { useState, useEffect } from "react";
import "./ClinicianProfile.scss";
import AuthAPI from "../../../../service/Auth/AuthAPI";
import { toast } from "react-toastify";

const MIN_PASSWORD_LEN = 8;
const MAX_PASSWORD_LEN = 128;

const ClinicianProfile = () => {
  const [profile, setProfile] = useState({ displayName: "", email: "" });
  
  // States cho Modal và Form (Bê nguyên logic từ ChildrenLayout sang)
  const [showChangePwModal, setShowChangePwModal] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [pw, setPw] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" });
  const [pwTouched, setPwTouched] = useState({ oldPassword: false, newPassword: false, confirmPassword: false });
  const [pwErrors, setPwErrors] = useState({ oldPassword: null, newPassword: null, confirmPassword: null });

  // Load Profile
  useEffect(() => {
    AuthAPI.getProfileAPI().then((res) => {
      const data = res?.data || res;
      setProfile({
        displayName: data?.display_name || data?.full_name || "Bác sĩ",
        email: data?.email || "---",
      });
    }).catch(() => toast.error("Không thể tải hồ sơ"));
  }, []);

  // Validation Helpers (Dùng chung logic của bạn)
  const validateOldPassword = (v) => !v.trim() ? "Vui lòng nhập mật khẩu hiện tại." : null;
  const validateNewPassword = (v) => {
    if (!v.trim()) return "Vui lòng nhập mật khẩu mới.";
    if (v.length < MIN_PASSWORD_LEN) return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LEN} ký tự.`;
    return null;
  };
  const validateConfirmPassword = (v, newPw) => {
    if (!v.trim()) return "Vui lòng xác nhận mật khẩu.";
    if (v !== newPw) return "Mật khẩu xác nhận không khớp.";
    return null;
  };

  const handlePwSubmit = async (e) => {
    e.preventDefault();
    if (changingPw) return;

    const oldErr = validateOldPassword(pw.oldPassword);
    const newErr = validateNewPassword(pw.newPassword);
    const confirmErr = validateConfirmPassword(pw.confirmPassword, pw.newPassword);

    setPwTouched({ oldPassword: true, newPassword: true, confirmPassword: true });
    setPwErrors({ oldPassword: oldErr, newPassword: newErr, confirmPassword: confirmErr });

    if (oldErr || newErr || confirmErr) return;

    setChangingPw(true);
    try {
      // Lưu ý: Kiểm tra key API của bạn là (old_password, new_password) hay (oldPassword, newPassword)
      await AuthAPI.changePasswordAPI(pw.oldPassword, pw.newPassword);
      toast.success("Đổi mật khẩu thành công.");
      setShowChangePwModal(false);
      setPw({ oldPassword: "", newPassword: "", confirmPassword: "" });
      setPwTouched({ oldPassword: false, newPassword: false, confirmPassword: false });
    } catch (err) {
      const body = err?.response?.data;
      toast.error(body?.message || "Đổi mật khẩu thất bại.");
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="clpr">
      <div className="clpr-header">
        <h2 className="clpr-title">Hồ sơ Clinician</h2>
      </div>

      <div className="clpr-content">
        <div className="clpr-card">
          <div className="clpr-card__title">Thông tin cơ bản</div>
          <div className="clpr-grid">
            <div className="clpr-field">
              <label className="clpr-field__label">Họ tên</label>
              <div className="clpr-field__value">{profile.displayName}</div>
            </div>
            <div className="clpr-field">
              <label className="clpr-field__label">Email</label>
              <div className="clpr-field__value">{profile.email}</div>
            </div>
          </div>
        </div>

        <div className="clpr-card">
          <div className="clpr-card__title">Bảo mật tài khoản</div>
          <p className="clpr-card__desc">Quản lý mật khẩu để bảo vệ dữ liệu phòng khám.</p>
          <button className="clpr-btn clpr-btn--primary" onClick={() => setShowChangePwModal(true)}>
            Đổi mật khẩu
          </button>
        </div>
      </div>

      {/* --- PASSWORD MODAL (Cấu trúc tương tự ChildrenLayout) --- */}
      {showChangePwModal && (
        <div 
          className="children-modal-overlay" 
          onMouseDown={(e) => e.target === e.currentTarget && setShowChangePwModal(false)}
        >
          <div className="children-modal">
            <div className="children-modal-header">
              <h3 className="children-modal-title">Thay đổi mật khẩu</h3>
              <button className="children-modal-close" onClick={() => setShowChangePwModal(false)}>×</button>
            </div>

            <form className="children-side-profile-password-form" onSubmit={handlePwSubmit}>
              <div className={`children-side-profile-password-field ${pwTouched.oldPassword && pwErrors.oldPassword ? "is-invalid" : ""}`}>
                <input
                  type="password"
                  placeholder="Mật khẩu hiện tại"
                  value={pw.oldPassword}
                  onChange={(e) => setPw({ ...pw, oldPassword: e.target.value })}
                  disabled={changingPw}
                />
                {pwTouched.oldPassword && pwErrors.oldPassword && <p className="children-side-profile-password-error">{pwErrors.oldPassword}</p>}
              </div>

              <div className={`children-side-profile-password-field ${pwTouched.newPassword && pwErrors.newPassword ? "is-invalid" : ""}`}>
                <input
                  type="password"
                  placeholder="Mật khẩu mới"
                  value={pw.newPassword}
                  onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
                  disabled={changingPw}
                />
                {pwTouched.newPassword && pwErrors.newPassword && <p className="children-side-profile-password-error">{pwErrors.newPassword}</p>}
              </div>

              <div className={`children-side-profile-password-field ${pwTouched.confirmPassword && pwErrors.confirmPassword ? "is-invalid" : ""}`}>
                <input
                  type="password"
                  placeholder="Xác nhận mật khẩu mới"
                  value={pw.confirmPassword}
                  onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })}
                  disabled={changingPw}
                />
                {pwTouched.confirmPassword && pwErrors.confirmPassword && <p className="children-side-profile-password-error">{pwErrors.confirmPassword}</p>}
              </div>

              <button type="submit" className="children-side-profile-password-submit" disabled={changingPw}>
                {changingPw ? "Đang xử lý..." : "Cập nhật mật khẩu"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClinicianProfile;