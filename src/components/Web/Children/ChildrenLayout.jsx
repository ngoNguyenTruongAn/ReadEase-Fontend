import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import "./ChildrenLayout.scss";
import redMonster from "../../../assets/image/reading book and sitting on the grass 1.png";
import childrenTokenIcon from "../../../assets/image/sparkles 1.png";
import monsterStore from "../../../assets/image/MonterStore.png";
import AuthAPI from "../../../service/Auth/AuthAPI";
import { toast } from "react-toastify";
import ChildrenAPI from "../../../service/Children/ChildrenAPI";
import { saveSelectedStory } from "./Reading/readingUtils";

const guardianSourceKeys = [
  "guardians",
  "guardian",
  "guardianList",
  "guardian_list",
  "linkedGuardians",
  "linked_guardians",
  "childGuardians",
  "child_guardians",
  "childGuardian",
  "child_guardian",
  "parents",
  "parent",
  "parentList",
  "parent_list",
  "linkedParents",
  "linked_parents",
  "caregivers",
  "caregiver",
];

const guardianNestedKeys = [
  "guardian",
  "parent",
  "caregiver",
  "user",
  "account",
  "profile",
  "guardianUser",
  "guardian_user",
  "parentUser",
  "parent_user",
];

const textOrEmpty = (value) => String(value ?? "").trim();

const compactName = (...values) =>
  values.map(textOrEmpty).filter(Boolean).join(" ").trim();

const toList = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const unwrapPayloadRoot = (payload) =>
  payload?.data ?? payload?.user ?? payload?.profile ?? payload;

const guardianNameFrom = (value, seen = new Set()) => {
  if (!value) return "";
  if (typeof value === "string") return textOrEmpty(value);
  if (typeof value !== "object") return "";
  if (seen.has(value)) return "";
  seen.add(value);

  const name =
    textOrEmpty(value.display_name) ||
    textOrEmpty(value.displayName) ||
    textOrEmpty(value.full_name) ||
    textOrEmpty(value.fullName) ||
    compactName(value.first_name, value.last_name) ||
    compactName(value.firstName, value.lastName) ||
    textOrEmpty(value.name) ||
    textOrEmpty(value.username) ||
    textOrEmpty(value.userName) ||
    textOrEmpty(value.email);

  if (name) return name;

  for (const key of guardianNestedKeys) {
    const nestedName = guardianNameFrom(value?.[key], seen);
    if (nestedName) return nestedName;
  }

  return "";
};

const collectGuardianSources = (value, includeSelf = false) => {
  if (!value) return [];
  if (Array.isArray(value)) return [value];
  if (typeof value !== "object") return [value];

  const sources = includeSelf ? [value] : [];
  for (const key of guardianSourceKeys) {
    if (value?.[key]) sources.push(value[key]);
  }
  return sources;
};

const pickGuardianNames = (payload, { includeRoot = false } = {}) => {
  const root = unwrapPayloadRoot(payload);
  const contexts = [
    payload,
    root,
    root?.child,
    root?.user,
    root?.profile,
    root?.account,
  ].filter(Boolean);
  const seen = new Set();
  const sources = contexts.flatMap((context) =>
    collectGuardianSources(context, includeRoot && context === root),
  );

  return sources
    .flatMap(toList)
    .map((item) => guardianNameFrom(item))
    .map(textOrEmpty)
    .filter(Boolean)
    .filter((name) => {
      const key = name.toLocaleLowerCase("vi-VN");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 2);
};

const pickChildId = (root) =>
  textOrEmpty(
    root?.id ||
      root?._id ||
      root?.user_id ||
      root?.childId ||
      root?.child_id ||
      root?.child?.id ||
      root?.child?._id,
  );

const pickAvatarInfo = (root) => ({
  rewardId: textOrEmpty(
    root?.avatar_reward_id ||
      root?.avatarRewardId ||
      root?.current_avatar_reward_id ||
      root?.currentAvatarRewardId,
  ),
  url: textOrEmpty(
    root?.avatar_url || root?.avatarUrl || root?.avatar?.image_url,
  ),
  name: textOrEmpty(
    root?.avatar_name || root?.avatarName || root?.avatar?.name,
  ),
});

const ChildrenLayout = () => {
  const defaultSideStory = useMemo(
    () => ({ kind: "default", src: redMonster, alt: "ReadEase" }),
    [],
  );
  const [sideStory, setSideStory] = useState(defaultSideStory);
  const location = useLocation();
  const navigate = useNavigate();
  const isStoreRoute = location.pathname.startsWith("/children/store");
  const isProfileRoute = location.pathname.startsWith("/children/profile");
  const [profileInfo, setProfileInfo] = useState({
    fullName: "",
    username: "",
    joinedAt: "",
    guardians: [],
  });
  const MIN_PASSWORD_LEN = 8;
  const MAX_PASSWORD_LEN = 128;
  const [changingPw, setChangingPw] = useState(false);
  const [showChangePwModal, setShowChangePwModal] = useState(false);
  const [pw, setPw] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [pwTouched, setPwTouched] = useState({
    oldPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [pwErrors, setPwErrors] = useState({
    oldPassword: null,
    newPassword: null,
    confirmPassword: null,
  });
  const showStoreSidebar = isStoreRoute;
  const [balance, setBalance] = useState(0);
  const [childId, setChildId] = useState("");
  const [, setStoreFilterOpen] = useState(false);
  const [avatar, setAvatar] = useState({ rewardId: "", url: "", name: "" });
  const avatarSrc = avatar.url || redMonster;
  const resetSideStory = useCallback(() => {
    setSideStory(defaultSideStory);
  }, [defaultSideStory]);
  const outletContext = useMemo(
    () => ({
      setSideStory,
      resetSideStory,
      balance,
      setBalance,
      childId,
      avatar,
      setAvatar,
    }),
    [resetSideStory, balance, childId, avatar],
  );

  const handleAvatarError = (event) => {
    event.currentTarget.onerror = null;
    event.currentTarget.src = redMonster;
  };

  useEffect(() => {
    // Đồng bộ childId từ profile (profile trả field id)
    let cancelled = false;
    const run = async () => {
      try {
        const payload = await AuthAPI.getProfileAPI();
        const root = payload?.data ?? payload?.user ?? payload ?? {};
        const id = pickChildId(root);
        if (cancelled) return;
        setAvatar(pickAvatarInfo(root));
        if (!id) {
          setChildId("");
          localStorage.removeItem("childId");
          return;
        }
        setChildId(id);
        localStorage.setItem("childId", id);
      } catch {
        if (!cancelled) {
          setChildId("");
          setAvatar({ rewardId: "", url: "", name: "" });
          localStorage.removeItem("childId");
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!childId) return;
    let cancelled = false;
    ChildrenAPI.getBalance(childId)
      .then((data) => {
        if (!cancelled) setBalance(data?.data?.balance ?? data?.balance ?? 0);
      })
      .catch(() => {
        if (!cancelled) setBalance(0);
      });
    return () => {
      cancelled = true;
    };
  }, [childId]);
  const handleLibraryReadNow = () => {
    if (sideStory?.kind !== "story") return;
    const id = sideStory.storyId;
    if (id == null || id === "") return;
    const selectedStory = {
      id,
      title: sideStory.title ?? "—",
      coverUrl: sideStory.coverUrl ?? "",
      description:
        String(sideStory.description ?? "").trim() ||
        "Ngày xưa, ở một làng nọ, có một anh nông phu nghèo.",
    };
    saveSelectedStory(selectedStory);
    navigate("/children/calibration/start", {
      state: { story: selectedStory },
    });
  };

  const validateOldPassword = (raw) => {
    const v = String(raw ?? "");
    if (!v.trim()) return "Vui lòng nhập mật khẩu hiện tại.";
    if (v.length > MAX_PASSWORD_LEN)
      return `Mật khẩu không được vượt quá ${MAX_PASSWORD_LEN} ký tự.`;
    return null;
  };

  const validateNewPassword = (raw) => {
    const v = String(raw ?? "");
    if (!v.trim()) return "Vui lòng nhập mật khẩu mới.";
    if (v.length < MIN_PASSWORD_LEN)
      return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LEN} ký tự.`;
    if (v.length > MAX_PASSWORD_LEN)
      return `Mật khẩu không được vượt quá ${MAX_PASSWORD_LEN} ký tự.`;
    return null;
  };

  const validateConfirmPassword = (raw, newPassword) => {
    const v = String(raw ?? "");
    if (!v.trim()) return "Vui lòng xác nhận mật khẩu mới.";
    if (v !== String(newPassword ?? "")) return "Mật khẩu xác nhận không khớp.";
    return null;
  };

  const pickErrorMessage = (err) => {
    const body = err?.response?.data;
    if (!body) return err?.message || "Đổi mật khẩu thất bại.";
    if (typeof body.message === "string") return body.message;
    if (Array.isArray(body.message)) return body.message.join(", ");
    if (typeof body.error === "string") return body.error;
    return "Đổi mật khẩu thất bại.";
  };

  useEffect(() => {
    // Chỉ check khi đang ở luồng /children (vào thẳng từ URL cũng áp dụng).
    if (!location.pathname.startsWith("/children")) return;

    const storedToken =
      localStorage.getItem("access_token") ||
      localStorage.getItem("token") ||
      localStorage.getItem("accessToken");

    if (!storedToken) {
      localStorage.removeItem("childId");
      navigate("/login", { replace: true });
      return;
    }

    // Kiểm tra exp của JWT (nếu token là JWT). Nếu parse thất bại thì bỏ qua.
    const isExpired = (() => {
      try {
        const parts = String(storedToken).split(".");
        if (parts.length < 2) return false;

        const payload = parts[1];
        const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64.padEnd(
          base64.length + ((4 - (base64.length % 4)) % 4),
          "=",
        );
        const json = decodeURIComponent(
          atob(padded)
            .split("")
            .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
            .join(""),
        );
        const parsed = JSON.parse(json);
        const exp = parsed?.exp;
        if (!exp) return false;
        return Date.now() >= exp * 1000;
      } catch {
        return false;
      }
    })();

    if (isExpired) {
      const refreshToken =
        localStorage.getItem("refresh_token") ||
        localStorage.getItem("refreshToken");

      if (!refreshToken) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("token");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("tracking_token");
        localStorage.removeItem("trackingToken");
        localStorage.removeItem("ws_token");
        localStorage.removeItem("wsToken");
        localStorage.removeItem("childId");
        navigate("/login", { replace: true });
        return;
      }

      AuthAPI.refreshTokenAPI(refreshToken)
        .then((data) => {
          const newAccess =
            data?.access_token ??
            data?.accessToken ??
            data?.token ??
            data?.data?.access_token ??
            data?.data?.accessToken ??
            data?.data?.token;
          const newRefresh =
            data?.refresh_token ??
            data?.refreshToken ??
            data?.data?.refresh_token ??
            data?.data?.refreshToken;
          const newTrackingToken =
            data?.tracking_token ??
            data?.trackingToken ??
            data?.ws_token ??
            data?.wsToken ??
            data?.data?.tracking_token ??
            data?.data?.trackingToken ??
            data?.data?.ws_token ??
            data?.data?.wsToken;

          if (newAccess) localStorage.setItem("access_token", newAccess);
          if (newRefresh) localStorage.setItem("refresh_token", newRefresh);
          if (newTrackingToken)
            localStorage.setItem("tracking_token", newTrackingToken);
        })
        .catch(() => {
          localStorage.removeItem("access_token");
          localStorage.removeItem("token");
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("tracking_token");
          localStorage.removeItem("trackingToken");
          localStorage.removeItem("ws_token");
          localStorage.removeItem("wsToken");
          localStorage.removeItem("childId");
          navigate("/login", { replace: true });
        });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!isProfileRoute) return;

    let cancelled = false;
    const formatJoinedAt = (raw) => {
      if (!raw) return "";
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return "";
      try {
        const monthYear = new Intl.DateTimeFormat("vi-VN", {
          month: "long",
          year: "numeric",
        }).format(d);
        return `Đã tham gia vào ${monthYear}`;
      } catch {
        return "";
      }
    };

    const loadProfile = async () => {
      try {
        const data = await AuthAPI.getProfileAPI();
        const root = data?.data ?? data?.user ?? data;
        setAvatar(pickAvatarInfo(root));
        const fullName =
          root?.display_name ??
          root?.fullName ??
          root?.name ??
          root?.userName ??
          root?.username ??
          "";

        const username =
          root?.username ??
          root?.userName ??
          root?.account ??
          root?.email ??
          "";

        const joinedAtRaw =
          root?.createdAt ??
          root?.created_at ??
          root?.joinedAt ??
          root?.joinDate ??
          root?.created ??
          "";

        let guardians = pickGuardianNames(data);
        if (!guardians.length) {
          try {
            const guardianPayload = await ChildrenAPI.getGuardians();
            guardians = pickGuardianNames(guardianPayload, {
              includeRoot: true,
            });
          } catch {
            guardians = [];
          }
        }

        if (cancelled) return;
        setProfileInfo({
          display_name: String(fullName || "").trim(),
          username: String(username || "").trim(),
          joinedAt: formatJoinedAt(joinedAtRaw),
          guardians,
        });
      } catch {
        if (!cancelled)
          setProfileInfo({
            display_name: "",
            username: "",
            joinedAt: "",
            guardians: [],
          });
      }
    };

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [isProfileRoute]);

  useEffect(() => {
    if (!isProfileRoute) return;
    setChangingPw(false);
    setShowChangePwModal(false);
    setPw({ oldPassword: "", newPassword: "", confirmPassword: "" });
    setPwTouched({
      oldPassword: false,
      newPassword: false,
      confirmPassword: false,
    });
    setPwErrors({
      oldPassword: null,
      newPassword: null,
      confirmPassword: null,
    });
  }, [isProfileRoute]);

  useEffect(() => {
    if (!showChangePwModal) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setShowChangePwModal(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showChangePwModal]);

  const handleLogout = () => {
    // Dọn sạch token để axios interceptor không gắn Authorization nữa.
    localStorage.removeItem("access_token");
    localStorage.removeItem("token");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("tracking_token");
    localStorage.removeItem("trackingToken");
    localStorage.removeItem("ws_token");
    localStorage.removeItem("wsToken");
    localStorage.removeItem("childId");

    navigate("/login", { replace: true });
  };

  return (
    <div className="children-page">
      <div className="children-home-page">
        <div className="children-side-placeholder" aria-hidden="true" />
        <aside className="children-side">
          <div className="children-side-hero">
            {showStoreSidebar ? (
              sideStory?.kind === "storeReward" ? (
                <div className="children-side-story children-side-store-reward">
                  <div className="children-side-story-cover">
                    <img
                      src={sideStory.src}
                      alt={sideStory.alt}
                      className="children-side-story-cover-img"
                    />
                  </div>

                  <h3 className="children-side-story-title">
                    {sideStory.title}
                  </h3>

                  <div className="children-side-story-tags">
                    <span className="children-side-story-tag">
                      {sideStory.cost} xu
                    </span>
                    {typeof sideStory.stock === "number" ? (
                      <span className="children-side-story-tag">
                        Còn: {sideStory.stock}
                      </span>
                    ) : null}
                  </div>

                  {sideStory.description ? (
                    <p className="children-side-story-desc">
                      {sideStory.description}
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="children-side-illustration">
                    <img
                      src={monsterStore}
                      alt="Cửa hàng"
                      className="children-side-illustration-img"
                    />
                  </div>

                  <div className="children-side-store">
                    <p className="children-side-text children-side-store-title">
                      Cửa hàng nhân vật
                    </p>
                    <p className="children-side-store-subtitle">
                      Chọn nhóm bạn muốn xem
                    </p>
                  </div>
                </>
              )
            ) : (
              <>
                {isProfileRoute ? (
                  <div className="children-side-profile">
                    <div className="children-side-illustration children-side-illustration--profile">
                      <img
                        src={avatarSrc}
                        alt={avatar.name || defaultSideStory.alt}
                        className="children-side-illustration-img children-side-illustration-img--profile"
                        onError={handleAvatarError}
                      />
                    </div>
                    <div className="children-side-profile-header">
                      <p className="children-side-profile-name">
                        {profileInfo.display_name || "Họ và Tên"}
                      </p>
                      <p className="children-side-profile-username">
                        {profileInfo.username || "Username"}
                      </p>
                      {profileInfo.joinedAt ? (
                        <p className="children-side-profile-joined">
                          {profileInfo.joinedAt}
                        </p>
                      ) : null}
                    </div>

                    <div className="children-side-profile-guardian">
                      <p className="children-side-profile-guardian-title">
                        Người bảo hộ
                      </p>
                      <ul className="children-side-profile-guardian-list">
                        {(profileInfo.guardians?.length
                          ? profileInfo.guardians
                          : ["Chưa có thông tin người bảo hộ"]
                        ).map((name, idx) => (
                          <li
                            key={`${idx}-${name}`}
                            className="children-side-profile-guardian-item"
                          >
                            <span
                              className="children-side-profile-guardian-icon"
                              aria-hidden="true"
                            />
                            <span className="children-side-profile-guardian-name">
                              {name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="children-side-profile-password">
                      <button
                        type="button"
                        className="children-side-profile-password-toggle"
                        onClick={() => setShowChangePwModal(true)}
                      >
                        Đổi mật khẩu
                      </button>
                    </div>

                    <button
                      type="button"
                      className="children-side-profile-logout"
                      onClick={handleLogout}
                    >
                    Đăng xuất
                    </button>
                  </div>
                ) : sideStory?.kind === "story" ? (
                  <div className="children-side-story">
                    <div className="children-side-story-cover">
                      <img
                        src={sideStory.src}
                        alt={sideStory.alt}
                        className="children-side-story-cover-img"
                      />
                    </div>

                    <h3 className="children-side-story-title">
                      {sideStory.title}
                    </h3>

                    <p className="children-side-story-desc">
                      {sideStory.description}
                    </p>

                    <button
                      type="button"
                      className="children-side-story-cta"
                      disabled={
                        sideStory.storyId == null || sideStory.storyId === ""
                      }
                      onClick={handleLibraryReadNow}
                    >
                      Đọc ngay
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="children-side-illustration">
                      <img
                        src={defaultSideStory.src}
                        alt={defaultSideStory.alt}
                        className="children-side-illustration-img"
                      />
                    </div>
                    <p className="children-side-text">
                      Hôm nay bạn muốn đọc gì nào?
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </aside>

        {showChangePwModal ? (
          <div
            className="children-modal-overlay"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setShowChangePwModal(false);
            }}
          >
            <div
              className="children-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="change-password-title"
            >
              <div className="children-modal-header">
                <h3 id="change-password-title" className="children-modal-title">
                  Đổi mật khẩu
                </h3>
                <button
                  type="button"
                  className="children-modal-close"
                  onClick={() => setShowChangePwModal(false)}
                  aria-label="Đóng"
                >
                  ×
                </button>
              </div>

              <form
                className="children-side-profile-password-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (changingPw) return;

                  const oldErr = validateOldPassword(pw.oldPassword);
                  const newErr = validateNewPassword(pw.newPassword);
                  const confirmErr = validateConfirmPassword(
                    pw.confirmPassword,
                    pw.newPassword,
                  );

                  setPwTouched({
                    oldPassword: true,
                    newPassword: true,
                    confirmPassword: true,
                  });
                  setPwErrors({
                    oldPassword: oldErr,
                    newPassword: newErr,
                    confirmPassword: confirmErr,
                  });

                  if (oldErr || newErr || confirmErr) return;

                  setChangingPw(true);
                  try {
                    await AuthAPI.changePasswordAPI(
                      pw.oldPassword,
                      pw.newPassword,
                    );
                    toast.success("Đổi mật khẩu thành công.");
                    setPw({
                      oldPassword: "",
                      newPassword: "",
                      confirmPassword: "",
                    });
                    setPwTouched({
                      oldPassword: false,
                      newPassword: false,
                      confirmPassword: false,
                    });
                    setPwErrors({
                      oldPassword: null,
                      newPassword: null,
                      confirmPassword: null,
                    });
                    setShowChangePwModal(false);
                  } catch (err) {
                    toast.error(pickErrorMessage(err));
                  } finally {
                    setChangingPw(false);
                  }
                }}
                noValidate
              >
                <div
                  className={`children-side-profile-password-field ${
                    pwTouched.oldPassword && pwErrors.oldPassword
                      ? "is-invalid"
                      : ""
                  }`}
                >
                  <input
                    type="password"
                    placeholder="Mật khẩu hiện tại"
                    value={pw.oldPassword}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPw((p) => ({ ...p, oldPassword: v }));
                      if (pwTouched.oldPassword)
                        setPwErrors((er) => ({
                          ...er,
                          oldPassword: validateOldPassword(v),
                        }));
                    }}
                    onBlur={() => {
                      setPwTouched((t) => ({ ...t, oldPassword: true }));
                      setPwErrors((er) => ({
                        ...er,
                        oldPassword: validateOldPassword(pw.oldPassword),
                      }));
                    }}
                    autoComplete="current-password"
                    disabled={changingPw}
                    autoFocus
                  />
                  {pwTouched.oldPassword && pwErrors.oldPassword ? (
                    <p
                      className="children-side-profile-password-error"
                      role="alert"
                    >
                      {pwErrors.oldPassword}
                    </p>
                  ) : null}
                </div>

                <div
                  className={`children-side-profile-password-field ${
                    pwTouched.newPassword && pwErrors.newPassword
                      ? "is-invalid"
                      : ""
                  }`}
                >
                  <input
                    type="password"
                    placeholder="Mật khẩu mới (tối thiểu 8 ký tự)"
                    value={pw.newPassword}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPw((p) => ({ ...p, newPassword: v }));
                      if (pwTouched.newPassword)
                        setPwErrors((er) => ({
                          ...er,
                          newPassword: validateNewPassword(v),
                        }));
                      if (pwTouched.confirmPassword)
                        setPwErrors((er) => ({
                          ...er,
                          confirmPassword: validateConfirmPassword(
                            pw.confirmPassword,
                            v,
                          ),
                        }));
                    }}
                    onBlur={() => {
                      setPwTouched((t) => ({ ...t, newPassword: true }));
                      setPwErrors((er) => ({
                        ...er,
                        newPassword: validateNewPassword(pw.newPassword),
                      }));
                    }}
                    autoComplete="new-password"
                    disabled={changingPw}
                  />
                  {pwTouched.newPassword && pwErrors.newPassword ? (
                    <p
                      className="children-side-profile-password-error"
                      role="alert"
                    >
                      {pwErrors.newPassword}
                    </p>
                  ) : null}
                </div>

                <div
                  className={`children-side-profile-password-field ${
                    pwTouched.confirmPassword && pwErrors.confirmPassword
                      ? "is-invalid"
                      : ""
                  }`}
                >
                  <input
                    type="password"
                    placeholder="Xác nhận mật khẩu mới"
                    value={pw.confirmPassword}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPw((p) => ({ ...p, confirmPassword: v }));
                      if (pwTouched.confirmPassword)
                        setPwErrors((er) => ({
                          ...er,
                          confirmPassword: validateConfirmPassword(
                            v,
                            pw.newPassword,
                          ),
                        }));
                    }}
                    onBlur={() => {
                      setPwTouched((t) => ({ ...t, confirmPassword: true }));
                      setPwErrors((er) => ({
                        ...er,
                        confirmPassword: validateConfirmPassword(
                          pw.confirmPassword,
                          pw.newPassword,
                        ),
                      }));
                    }}
                    autoComplete="new-password"
                    disabled={changingPw}
                  />
                  {pwTouched.confirmPassword && pwErrors.confirmPassword ? (
                    <p
                      className="children-side-profile-password-error"
                      role="alert"
                    >
                      {pwErrors.confirmPassword}
                    </p>
                  ) : null}
                </div>

                <button
                  type="submit"
                  className="children-side-profile-password-submit"
                  disabled={changingPw}
                >
                  {changingPw ? "Đang đổi..." : "Đổi mật khẩu"}
                </button>
              </form>
            </div>
          </div>
        ) : null}

        <main className="children-main">
          <header className="children-navbar">
            <div className="children-navbar-left">
              <div className="children-avatar">
                <img
                  src={avatarSrc}
                  alt={avatar.name || "Red Monster Reading Book"}
                  className="children-avatar-img"
                  onError={handleAvatarError}
                />
              </div>
            </div>

            <div className="children-navbar-center">
              <nav className="children-nav-tabs">
                <NavLink
                  to="/children/profile"
                  className={({ isActive }) =>
                    `children-nav-link ${isActive ? "is-active" : ""}`
                  }
                  onClick={() => setStoreFilterOpen(false)}
                >
                  Hồ sơ
                </NavLink>
                <NavLink
                  to="/children/library"
                  className={({ isActive }) =>
                    `children-nav-link ${isActive ? "is-active" : ""}`
                  }
                  onClick={() => {
                    setStoreFilterOpen(false);
                    setSideStory(defaultSideStory);
                  }}
                >
                  Thư viện
                </NavLink>
                <NavLink
                  to="/children/store"
                  className={({ isActive }) =>
                    `children-nav-link ${isActive ? "is-active" : ""}`
                  }
                >
                  Cửa hàng
                </NavLink>
              </nav>
            </div>

            <div className="children-navbar-right children-token">
              <span className="children-coin-amount">{balance}</span>
              <img
                src={childrenTokenIcon}
                alt="Children Token Icon"
                className="children-coin-icon"
              />

              {/* {isProfileRoute && (
                <button
                  type="button"
                  className="children-logout-btn"
                  onClick={handleLogout}
                >
                  Đăng xuất
                </button>
              )} */}
            </div>
          </header>

          <section className="children-content">
            <Outlet
              key={location.pathname}
              context={outletContext}
            />
          </section>
        </main>
      </div>
    </div>
  );
};

export default ChildrenLayout;
