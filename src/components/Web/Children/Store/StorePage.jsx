import React, { useEffect, useMemo, useState } from "react";
import "./StorePage.scss";
import { useOutletContext } from "react-router-dom";
import ChildrenAPI from "../../../../service/Children/ChildrenAPI";
import AuthAPI from "../../../../service/Auth/AuthAPI";

const TINTS = ["mint", "lavender", "peach", "coral", "sky"];

const StorePage = () => {
  const outletContext = useOutletContext();
  const activeFilter = outletContext?.storeFilter ?? "all";
  const [selectedId, setSelectedId] = useState("");
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [redeemingId, setRedeemingId] = useState("");
  const [toast, setToast] = useState("");
  const [childId, setChildId] = useState(
    () => localStorage.getItem("childId") || "",
  );

  const loadRewards = async (signal) => {
    setLoading(true);
    setError("");
    try {
      const res = await ChildrenAPI.getRewardList();
      const list = res?.data;
      if (signal?.aborted) return;
      setRewards(Array.isArray(list) ? list : []);
    } catch (e) {
      if (signal?.aborted) return;
      setError(
        e?.response?.data?.message ||
          e?.message ||
          "Không tải được danh sách phần thưởng.",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadRewards(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (childId) return;
    let mounted = true;
    const run = async () => {
      try {
        const payload = await AuthAPI.getProfileAPI();
        const root = payload?.data ?? payload?.user ?? payload ?? {};
        const picked =
          root?.id ||
          root?.childId ||
          root?.child_id ||
          root?.child?.id ||
          root?.child?.childId ||
          "";
        const normalized = String(picked || "").trim();
        if (!mounted || !normalized) return;
        setChildId(normalized);
        localStorage.setItem("childId", normalized);
      } catch {
        // ignore: sẽ báo khi bấm mua nếu vẫn không có childId
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [childId]);

  useEffect(() => {
    if (!selectedId && rewards.length > 0) setSelectedId(rewards[0]?.id || "");
  }, [rewards, selectedId]);

  const visible = useMemo(() => {
    // Hiện tại API rewards không có field category tương ứng storeFilter,
    // nên mặc định hiển thị toàn bộ danh sách.
    if (!Array.isArray(rewards)) return [];
    if (!activeFilter || activeFilter === "all") return rewards;
    return rewards;
  }, [activeFilter, rewards]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleRedeem = async (rewardId) => {
    if (!rewardId || redeemingId) return;
    const reward = rewards.find((r) => r?.id === rewardId);
    const expectedVersion =
      typeof reward?.version === "number" ? reward.version : undefined;
    if (!childId) {
      setToast("Không tìm thấy childId từ profile. Vui lòng đăng nhập lại.");
      return;
    }
    try {
      setRedeemingId(rewardId);
      setToast("");
      await ChildrenAPI.redeemReward(rewardId, childId, expectedVersion);
      setToast("Mua/đổi thưởng thành công!");
      await loadRewards();
    } catch (e) {
      const body = e?.response?.data;
      const apiErr = body?.error;
      const detail =
        (Array.isArray(apiErr?.details) && apiErr.details[0]) ||
        (Array.isArray(body?.details) && body.details[0]) ||
        null;
      setToast(
        detail ||
          apiErr?.message ||
          body?.message ||
          e?.message ||
          "Mua/đổi thưởng thất bại.",
      );
    } finally {
      setRedeemingId("");
    }
  };

  return (
    <div className="store-page">
      <div className="store-main">
        {toast ? <div className="store-toast">{toast}</div> : null}
        {loading ? <div className="store-state">Đang tải...</div> : null}
        {!loading && error ? (
          <div className="store-state store-state--error">{error}</div>
        ) : null}
        <div className="store-grid">
          {visible.map((item, idx) => {
            const tint = TINTS[idx % TINTS.length];
            const disabled =
              item?.is_active === false ||
              (typeof item?.stock === "number" && item.stock <= 0);
            const buying = redeemingId === item?.id;
            return (
            <div key={item.id} className="store-card-wrap">
              <button
                type="button"
                className={`store-card store-card--${tint} ${
                  selectedId === item.id ? "store-card--selected" : ""
                }`}
                onClick={() => setSelectedId(item.id)}
                disabled={disabled}
              >
                <div className="store-card-art">
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="store-card-img"
                    loading="lazy"
                  />
                </div>
                <span className="store-card-label">{item.name}</span>
                {item.description ? (
                  <div className="store-card-desc">{item.description}</div>
                ) : null}
                <div className="store-card-meta">
                  <span className="store-card-cost">{item.cost} xu</span>
                  {typeof item.stock === "number" ? (
                    <span className="store-card-stock">Tồn: {item.stock}</span>
                  ) : null}
                  {item?.is_active === false ? (
                    <span className="store-card-inactive">Tạm ngưng</span>
                  ) : null}
                </div>
              </button>

              <button
                type="button"
                className="store-buy-btn"
                onClick={() => handleRedeem(item.id)}
                disabled={disabled || buying}
              >
                {buying ? "Đang mua..." : "Mua"}
              </button>
            </div>
          )})}
        </div>
      </div>
    </div>
  );
};

export default StorePage;
