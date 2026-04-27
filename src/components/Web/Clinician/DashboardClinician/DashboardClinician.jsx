import React, { useEffect, useState } from "react";
import "./DashboardClinician.scss";
import readingBook from "../../../../assets/image/Vector.png";

const DashboardClinician = () => {
  const [stats, setStats] = useState([]);

  const reports = [
    {
      title: "Báo cáo Tuần này",
      sub: "Tổng hợp nhanh hoạt động đọc",
      status: "Bản nháp (placeholder) — sửa sau",
    },
    {
      title: "Báo cáo Tuần trước",
      sub: "So sánh tiến độ theo bệnh nhân",
      status: "Đã tạo (placeholder) — sửa sau",
    },
  ];

  useEffect(() => {
    const dataFromApi = [
      { label: "Số bệnh nhân đang theo dõi", value: 12 },
      { label: "Báo cáo cần duyệt", value: 3 },
      { label: "Phiên đọc bất thường", value: 1 },
    ];
    setStats(dataFromApi);
  }, []);

  const statConfig = [
    { label: "Số bệnh nhân đang theo dõi", icon: readingBook },
    { label: "Báo cáo cần duyệt", icon: readingBook },
    { label: "Phiên đọc bất thường", icon: readingBook },
  ];

  return (
    <div className="cdc">
      <div className="cdc-stats">
        {stats.map((s) => {
          const config = statConfig.find((c) => c.label === s.label);
          return (
            <div key={s.label} className="cdc-stat">
              <div className="cdc-stat__icon">
                <img src={config?.icon} alt="icon" className="cdc-ico" />
              </div>
              <div className="cdc-stat__main">
                <div className="cdc-stat__label">{s.label}</div>
                <div className="cdc-stat__value">{s.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cdc-section">
        <div className="cdc-section__title">Báo cáo gần đây</div>
        <div className="cdc-list">
          {reports.map((r, index) => (
            <div key={index} className="cdc-item">
              <div className="cdc-item__left">
                <div className="cdc-item__title">{r.title}</div>
                <div className="cdc-item__sub">{r.sub}</div>
              </div>
              <div className="cdc-item__right">
                <div className="cdc-item__status">{r.status}</div>
                <button className="cdc-item__link" type="button">
                  Xem chi tiết
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardClinician;

