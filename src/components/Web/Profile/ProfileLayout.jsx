import React, { useEffect, useState } from "react";
import AuthAPI from "../../../service/Auth/AuthAPI";

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

  const { id, email, role } = profile ?? {};

  return (
    <div>
      <h1>Hồ sơ</h1>
      <ul>
        <li>ID: {id != null ? String(id) : "—"}</li>
        <li>Email: {email ?? "—"}</li>
        <li>Vai trò: {role != null ? String(role) : "—"}</li>
      </ul>
    </div>
  );
};

export default ProfileLayout;
