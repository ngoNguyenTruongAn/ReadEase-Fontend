import React, { useMemo } from "react";
// import "./VerifyEmailPage.scss";

const VerifyEmailPage = () => {
  // Lấy email từ localStorage để hiển thị cho thân thiện
  const email = useMemo(
    () => localStorage.getItem("registerEmail") || "người dùng",
    [],
  );

  return (
    <div className="validate-page">
      <div className="validate-wrapper pending-state">
        {/* Biểu tượng đồng hồ cát hoặc thông báo */}
        <div
          className="pending-icon"
          style={{ fontSize: "3rem", marginBottom: "1rem" }}
        >
          ⏳
        </div>

        <h1 className="validate-title">Xác minh hoàn tất!</h1>

        <p className="validate-subtitle">
          Chào bạn, email <strong>{email}</strong> đã được xác thực thành công.
        </p>

        <div
          className="notice-box"
          style={{
            background: "#f0f7ff",
            padding: "20px",
            borderRadius: "12px",
            marginTop: "20px",
          }}
        >
          <p style={{ margin: 0, color: "#2c3e50", lineHeight: "1.6" }}>
            Vì bạn đăng ký với vai trò <strong>Người học (Child)</strong>, tài
            khoản cần được
            <span style={{ color: "#e67e22", fontWeight: "bold" }}>
              {" "}
              Người bảo hộ xác nhận
            </span>{" "}
            trước khi bắt đầu.
          </p>
        </div>

        <p
          className="validate-footer"
          style={{ marginTop: "30px", fontSize: "0.9rem", color: "#7f8c8d" }}
        >
          Vui lòng liên hệ với Phụ huynh hoặc Giảng viên của bạn để kích hoạt
          tài khoản nhé!
        </p>

        <button
          className="btn-validate"
          style={{ marginTop: "20px" }}
          onClick={() => (window.location.href = "/login")}
        >
          Quay lại Đăng nhập
        </button>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
