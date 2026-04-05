import React, { useEffect, useState } from "react";
import AuthAPI from "../../../service/Auth/AuthAPI";
import knightImg from "../../../assets/image/Friendly monster waving a flag 1.png";
import mageImg from "../../../assets/image/reading book and sitting on the grass 1.png";
import "./ProfileLayout.scss";

const pickProfile = (data) => {
  const root = data?.data ?? data?.user ?? data;
  return {
    id: root?.id ?? root?.userId ?? data?.id,
    email: root?.email ?? data?.email,
    role: root?.role ?? root?.roles?.[0] ?? data?.role,
  };
};

const ProfileLayout = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await AuthAPI.getProfileAPI();
        if (!cancelled) setProfile(pickProfile(data));
      } catch (err) {
        if (!cancelled) {
          const body = err?.response?.data;
          const message =
            (typeof body?.message === "string" && body.message) ||
            (Array.isArray(body?.message) && body.message.join(", ")) ||
            body?.error ||
            err?.message ||
            "Không tải được hồ sơ.";
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div>Đang tải hồ sơ...</div>;
  }

  if (error) {
    return <div role="alert">{error}</div>;
  }

  // Dữ liệu hồ sơ hiện chưa hiển thị trực tiếp trong UI (phần meta đang comment),
  // nhưng giữ lại để sau này mở rộng nhanh mà không phải gọi lại API.
  const { id: _id, email: _email, role: _role } = profile ?? {};
  const achievements = [
    {
      id: "fire",
      icon: "🔥",
      title: "Người giữ lửa (cấp 1)",
      score: "18/30",
      ratio: 60,
      subtitle: "Đạt chuỗi ngày 18 streaks",
    },
    {
      id: "enthusiasm",
      icon: "✨",
      title: "Nhà tài phiệt (cấp 1)",
      score: "80/100",
      ratio: 80,
      subtitle: "Đạt chuỗi ngày 18 streaks",
    },
    {
      id: "insight",
      icon: "🔮",
      title: "Nhà thông thái (cấp 1)",
      score: "1/5",
      ratio: 20,
      subtitle: "Đạt chuỗi ngày 18 streaks",
    },
    {
      id: "insight",
      icon: "🔮",
      title: "Nhà thông thái (cấp 1)",
      score: "1/5",
      ratio: 20,
      subtitle: "Đạt chuỗi ngày 18 streaks",
    },
    {
      id: "insight",
      icon: "🔮",
      title: "Nhà thông thái (cấp 1)",
      score: "1/5",
      ratio: 20,
      subtitle: "Đạt chuỗi ngày 18 streaks",
    },
    {
      id: "insight",
      icon: "🔮",
      title: "Nhà thông thái (cấp 1)",
      score: "1/5",
      ratio: 20,
      subtitle: "Đạt chuỗi ngày 18 streaks",
    },
    {
      id: "insight",
      icon: "🔮",
      title: "Nhà thông thái (cấp 1)",
      score: "1/5",
      ratio: 20,
      subtitle: "Đạt chuỗi ngày 18 streaks",
    },
    {
      id: "insight",
      icon: "🔮",
      title: "Nhà thông thái (cấp 1)",
      score: "1/5",
      ratio: 20,
      subtitle: "Đạt chuỗi ngày 18 streaks",
    },
    {
      id: "insight",
      icon: "🔮",
      title: "Nhà thông thái (cấp 1)",
      score: "1/5",
      ratio: 20,
      subtitle: "Đạt chuỗi ngày 18 streaks",
    },
    {
      id: "insight",
      icon: "🔮",
      title: "Nhà thông thái (cấp 1)",
      score: "1/5",
      ratio: 20,
      subtitle: "Đạt chuỗi ngày 18 streaks",
    },
    {
      id: "insight",
      icon: "🔮",
      title: "Nhà thông thái (cấp 1)",
      score: "1/5",
      ratio: 20,
      subtitle: "Đạt chuỗi ngày 18 streaks",
    },
    {
      id: "insight 999",
      icon: "🔮",
      title: "Nhà thông thái (cấp 1)",
      score: "1/5",
      ratio: 20,
      subtitle: "Đạt chuỗi ngày 18 streaks",
    },
  ];

  const topAchievements = achievements.slice(0, 5);

  const collection = [
    { id: "c1", image: knightImg, name: "Kỵ sĩ ánh sáng" },
    { id: "c2", image: mageImg, name: "Người chăn thú" },
    { id: "c3", image: knightImg, name: "Linh mục hoàng kim" },
    { id: "c4", image: knightImg, name: "Linh mục hoàng kim" },
    { id: "c5", image: knightImg, name: "Linh mục hoàng kim" },
    { id: "c6", image: knightImg, name: "Linh mục hoàng kim" },
  ];

  return (
    <div className="profile-layout">
      <section className="profile-achievement">
        <h2 className="profile-section-title">
          Thành tích{" "}
          <span style={{ fontWeight: "bold", color: "#FBBF24" }}> Top 5</span>
        </h2>

        <div className="profile-achievement-card">
          {topAchievements.map((item, index) => (
            <div
              key={`${item.id}-${index}`}
              className={`profile-achievement-item ${
                index < topAchievements.length - 1 ? "with-divider" : ""
              }`}
            >
              <div className="profile-achievement-icon" aria-hidden="true">
                {item.icon}
              </div>

              <div className="profile-achievement-body">
                <div className="profile-achievement-head">
                  <h3>{item.title}</h3>
                  <span>{item.score}</span>
                </div>

                <div className="profile-progress-track">
                  <div
                    className="profile-progress-fill"
                    style={{ width: `${item.ratio}%` }}
                  />
                </div>

                <p>{item.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="profile-collection">
        <div className="profile-collection-header">
          <h2 className="profile-section-title">Bộ sưu tập</h2>
          <button type="button" className="profile-view-all">
            Xem tất cả
          </button>
        </div>

        <div className="profile-collection-grid">
          {collection.map((item) => (
            <article key={item.id} className="profile-collection-card">
              <img src={item.image} alt={item.name} />
            </article>
          ))}
        </div>
      </section>

      {/* <div className="profile-meta">
        <span>ID: {id != null ? String(id) : "—"}</span>
        <span>Email: {email ?? "—"}</span>
        <span>Vai trò: {role != null ? String(role) : "—"}</span>
      </div> */}
    </div>
  );
};

export default ProfileLayout;
