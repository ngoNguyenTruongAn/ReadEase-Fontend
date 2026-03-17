import React, { useMemo, useState } from "react";
import "./SelectRolePage.scss";

const ROLES = [
  { id: "reader", label: "Mình là bạn đọc" },
  { id: "guardian", label: "Mình là người bảo hộ" },
  { id: "doctor", label: "Mình là bác sĩ" },
];

const SelectRolePage = () => {
  const [selectedRole, setSelectedRole] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  // TODO: lấy username thật từ context/store
  const userName = useMemo(() => "UserName", []);
  const guardianName = useMemo(() => "Họ và tên người bảo hộ", []);

  const handleSelect = (roleId) => {
    setSelectedRole(roleId);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedRole) return;

    if (selectedRole === "reader") {
      setConfirmed(true);
      return;
    }

    // TODO: xử lý submit cho các role khác nếu cần
    setConfirmed(true);
  };

  if (confirmed && selectedRole === "reader") {
    // Màn hình chờ người bảo hộ chấp nhận
    return (
      <div className="select-role-wrapper waiting-view">
        <h1 className="title success-title">Tài khoản của bạn đã được tạo!</h1>

        <p className="subtitle">Hãy chờ người bảo hộ của bạn chấp nhận nhé.</p>

        <div className="guardian-box">
          <p className="guardian-label">Người bảo hộ của bạn</p>
          <div className="guardian-row">
            <div className="avatar-circle">
              <span>{guardianName.charAt(0) || "N"}</span>
            </div>
            <span className="guardian-name">{guardianName}</span>
          </div>
        </div>
      </div>
    );
  }

  // Màn hình chọn vai trò
  return (
    <div className="select-role-wrapper">
      <p className="helper-text">Chọn vai trò cho tài khoản</p>

      <h1 className="title">Xin chào {userName}!</h1>

      <p className="subtitle">
        Vì đây là lần đầu bạn sử dụng, hãy cho mình biết bạn là ai nhé.
      </p>

      <form className="role-form" onSubmit={handleSubmit}>
        <div className="role-list">
          {ROLES.map((role) => (
            <button
              key={role.id}
              type="button"
              className={`role-item ${
                selectedRole === role.id ? "role-item--active" : ""
              }`}
              onClick={() => handleSelect(role.id)}
            >
              <span className="role-dot" />
              <span className="role-label">{role.label}</span>
            </button>
          ))}
        </div>

        <button type="submit" className="btn-confirm" disabled={!selectedRole}>
          Xác nhận
        </button>
      </form>
    </div>
  );
};

export default SelectRolePage;
