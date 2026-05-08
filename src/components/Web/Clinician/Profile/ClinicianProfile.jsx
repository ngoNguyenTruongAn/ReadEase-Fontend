import React from "react";
import "./ClinicianProfile.scss";

const ClinicianProfile = () => {
  return (
    <div className="clpr">
      <div className="clpr-header">
        <div>
          <div className="clpr-title">Hồ sơ Clinician</div>
          <div className="clpr-subtitle">
            Placeholder — sau này nối dữ liệu user/clinic, chỉnh form, v.v.
          </div>
        </div>
      </div>

      <div className="clpr-card">
        <div className="clpr-card__title">Thông tin cơ bản</div>
        <div className="clpr-grid">
          <div className="clpr-field">
            <div className="clpr-field__label">Họ tên</div>
            <div className="clpr-field__value">—</div>
          </div>
          <div className="clpr-field">
            <div className="clpr-field__label">Email</div>
            <div className="clpr-field__value">—</div>
          </div>
          <div className="clpr-field">
            <div className="clpr-field__label">Chuyên khoa</div>
            <div className="clpr-field__value">—</div>
          </div>
          <div className="clpr-field">
            <div className="clpr-field__label">Cơ sở</div>
            <div className="clpr-field__value">—</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClinicianProfile;

