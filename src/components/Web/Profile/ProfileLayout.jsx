import React, { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { toast } from "react-toastify";
import AuthAPI from "../../../service/Auth/AuthAPI";
import ChildrenAPI from "../../../service/Children/ChildrenAPI";
import "./ProfileLayout.scss";

const TINTS = ["mint", "lavender", "peach", "coral", "sky"];

const pickProfile = (data) => {
  const root = data?.data ?? data?.user ?? data;

  return {
    id:
      root?.id ??
      root?._id ??
      root?.user_id ??
      root?.childId ??
      root?.child_id ??
      root?.child?.id ??
      root?.userId ??
      data?.id,
    email: root?.email ?? data?.email,
    role: root?.role ?? root?.roles?.[0] ?? data?.role,
    avatarRewardId:
      root?.avatar_reward_id ??
      root?.avatarRewardId ??
      root?.current_avatar_reward_id ??
      root?.currentAvatarRewardId ??
      "",
    avatarUrl: root?.avatar_url ?? root?.avatarUrl ?? "",
    avatarName: root?.avatar_name ?? root?.avatarName ?? "",
  };
};

const ProfileLayout = () => {
  const navigate = useNavigate();
  const outletContext = useOutletContext();
  const setLayoutAvatar = outletContext?.setAvatar;
  const layoutAvatarRewardId = outletContext?.avatar?.rewardId ?? "";

  const [_profile, setProfile] = useState(null);
  const [collection, setCollection] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentAvatarRewardId, setCurrentAvatarRewardId] = useState("");
  const [settingAvatarId, setSettingAvatarId] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const profileData = await AuthAPI.getProfileAPI();

        if (cancelled) return;

        const parsedProfile = pickProfile(profileData);

        setProfile(parsedProfile);
        setCurrentAvatarRewardId(
          String(parsedProfile.avatarRewardId || "").trim(),
        );

        const childId = String(parsedProfile?.id || "").trim();

        if (!childId) {
          localStorage.removeItem("childId");
          return;
        }

        localStorage.setItem("childId", childId);

        const collectionRes = await ChildrenAPI.getCollection(childId);

        if (cancelled) return;

        const items = collectionRes?.data?.items ?? [];

        setCollection(items);
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

  useEffect(() => {
    const normalized = String(layoutAvatarRewardId || "").trim();
    if (normalized) setCurrentAvatarRewardId(normalized);
  }, [layoutAvatarRewardId]);

  const handleSetAvatar = async (item) => {
    const rewardId = String(item?.reward_id || "").trim();
    if (!rewardId || settingAvatarId || rewardId === currentAvatarRewardId)
      return;

    setSettingAvatarId(rewardId);
    try {
      const response = await ChildrenAPI.setAvatar(rewardId);
      const avatar = response?.data ?? response ?? {};
      const nextAvatar = {
        rewardId: avatar.avatar_reward_id || rewardId,
        url: avatar.avatar_url || item.image_url || "",
        name: avatar.avatar_name || item.name || "",
      };

      setCurrentAvatarRewardId(nextAvatar.rewardId);
      setLayoutAvatar?.(nextAvatar);
      toast.success("Đã đặt avatar mới.");
    } catch (err) {
      const body = err?.response?.data;
      const message =
        body?.message ||
        body?.error?.message ||
        err?.message ||
        "Không thể đặt avatar.";
      toast.error(message);
    } finally {
      setSettingAvatarId("");
    }
  };

  if (loading) {
    return <div className="profile-loading">Đang tải bộ sưu tập...</div>;
  }

  if (error) {
    return (
      <div className="profile-error" role="alert">
        {error}
      </div>
    );
  }

  return (
    <div className="profile-layout">
      <section className="profile-collection">
        <div className="profile-collection-header">
          <div className="profile-collection-intro">
            <h2 className="profile-section-title">🏆 Bộ sưu tập</h2>

            <p className="profile-section-subtitle">
              Những vật phẩm bạn đã sưu tập được
            </p>
          </div>

          <button
            type="button"
            className="profile-view-all"
            onClick={() => navigate("/children/collection")}
          >
            Xem tất cả
          </button>
        </div>

        {collection.length === 0 ? (
          <div className="profile-empty">
            <div className="profile-empty-icon">📦</div>

            <h3>Chưa có vật phẩm nào</h3>

            <p>Hãy ghé cửa hàng và đổi thưởng để bắt đầu bộ sưu tập nhé!</p>

            <button
              type="button"
              className="profile-empty-btn"
              onClick={() => navigate("/children/store")}
            >
              Đến cửa hàng 🎁
            </button>
          </div>
        ) : (
          <div className="profile-collection-grid">
            {collection.map((item, idx) => {
              const tint = TINTS[idx % TINTS.length];

              return (
                <article
                  key={item.reward_id}
                  className={`profile-collection-card profile-collection-card--${tint} ${
                    currentAvatarRewardId === item.reward_id ? "is-avatar" : ""
                  }`}
                >
                  {item.quantity > 1 && (
                    <span className="profile-badge">x{item.quantity}</span>
                  )}

                  <div className="profile-card-art">
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="profile-card-img"
                      loading="lazy"
                    />
                  </div>

                  <span className="profile-card-name">{item.name}</span>

                  <button
                    type="button"
                    className="profile-avatar-btn"
                    disabled={
                      settingAvatarId === item.reward_id ||
                      currentAvatarRewardId === item.reward_id
                    }
                    onClick={() => handleSetAvatar(item)}
                  >
                    {currentAvatarRewardId === item.reward_id
                      ? "Đang dùng"
                      : settingAvatarId === item.reward_id
                        ? "Đang đặt..."
                        : "Đặt làm avatar"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default ProfileLayout;
