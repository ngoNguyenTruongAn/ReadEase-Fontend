import React from "react";
import "./Reports.scss";

const Reports = () => {
  const items = [
    {
      title: "Báo cáo tổng quan tuần",
      sub: "Placeholder — sau này nối API lấy danh sách báo cáo",
      status: "Chưa duyệt",
    },
    {
      title: "Báo cáo theo bệnh nhân",
      sub: "Placeholder — lọc theo bệnh nhân/khung thời gian",
      status: "Đã duyệt",
    },
  ];

  return (
    <div className="clr">
      <div className="clr-header">
        <div>
          <div className="clr-title">Báo cáo</div>
          <div className="clr-subtitle">
            Trang khung để bạn chỉnh sửa sau (giống style Guardian).
          </div>
        </div>
      </div>

      <div className="clr-card">
        <div className="clr-card__title">Danh sách báo cáo</div>
        <div className="clr-list">
          {items.map((r, idx) => (
            <div className="clr-item" key={idx}>
              <div className="clr-item__left">
                <div className="clr-item__title">{r.title}</div>
                <div className="clr-item__sub">{r.sub}</div>
              </div>
              <div className="clr-item__right">
                <div className="clr-item__status">{r.status}</div>
                <button className="clr-item__link" type="button">
                  Xem
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Reports;

