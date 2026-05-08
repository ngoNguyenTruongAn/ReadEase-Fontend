import React, { useState, useEffect } from "react";
import "./DashboardGuardian.scss";
import readingBook from "../../../../assets/image/Vector.png";

const DashboardGuardian = () => {
  const [stats, setStats] = useState([]);

  const reports = [
    {
      title: "Báo cáo Đánh giá Tuần 3 - Tháng 3",
      sub: "Ghi nhận 5 phiên đọc",
      status: "Báo cáo tự động tạo bởi AI ✨",
    },
    {
      title: "Báo cáo Đánh giá Tuần 2 - Tháng 3",
      sub: "Ghi nhận 5 phiên đọc",
      status: "Đã được Bác sĩ [Tên Bác sĩ] xem xét",
    },
  ];

  useEffect(() => {
    const fetchStats = async () => {
      const dataFromApi = [
        { label: "Số phiên đọc tuần này", value: 6 },
        { label: "Điểm nỗ lực đạt được", value: 120 },
        { label: "Tổng thời gian tập trung", value: "15 phút 12 giây" },
      ];

      setStats(dataFromApi);
    };

    fetchStats();
  }, []);

  const statConfig = [
    { label: "Số phiên đọc tuần này", icon: readingBook },
    { label: "Điểm nỗ lực đạt được", icon: readingBook },
    { label: "Tổng thời gian tập trung", icon: readingBook },
  ];

  return (
    <div className="gdg">
      {/* STATS */}
      <div className="gdg-stats">
        {stats.map((s) => {
          const config = statConfig.find((c) => c.label === s.label);

          return (
            <div key={s.label} className="gdg-stat">
              <div className="gdg-stat__icon">
                <img src={config?.icon} alt="icon" className="gdg-ico" />
              </div>

              <div className="gdg-stat__main">
                <div className="gdg-stat__label">{s.label}</div>
                <div className="gdg-stat__value">{s.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* REPORTS */}
      <div className="gdg-section">
        <div className="gdg-section__title">Báo cáo Hàng tuần</div>

        <div className="gdg-list">
          {reports.map((r, index) => (
            <div key={index} className="gdg-item">
              <div className="gdg-item__left">
                <div className="gdg-item__title">{r.title}</div>
                <div className="gdg-item__sub">{r.sub}</div>
              </div>

              <div className="gdg-item__right">
                <div className="gdg-item__status">{r.status}</div>
                <button className="gdg-item__link">Xem chi tiết</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardGuardian;
