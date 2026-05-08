// api/axiosInstance.js
import axios from "axios";

const instance = axios.create({
  baseURL: "http://localhost:3000/api/v1/",
});

const getAccessToken = () =>
  localStorage.getItem("access_token") ||
  localStorage.getItem("accessToken") ||
  localStorage.getItem("token");

const setAccessToken = (token) => {
  if (!token) return;
  localStorage.setItem("access_token", token);
};

const getRefreshToken = () =>
  localStorage.getItem("refresh_token") || localStorage.getItem("refreshToken");

const setRefreshToken = (token) => {
  if (!token) return;
  localStorage.setItem("refresh_token", token);
};

const setTrackingToken = (token) => {
  if (!token) return;
  localStorage.setItem("tracking_token", token);
};

const clearAuth = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("accessToken");
  localStorage.removeItem("token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("tracking_token");
  localStorage.removeItem("trackingToken");
  localStorage.removeItem("ws_token");
  localStorage.removeItem("wsToken");
};

instance.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise = null;

instance.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error?.config;
    const status = error?.response?.status;
    const url = String(original?.url ?? "");

    if (!original || status !== 401) throw error;
    if (original._retry) throw error;
    if (url.includes("auth/refresh")) throw error;

    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearAuth();
      throw error;
    }

    original._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = axios
          .post(
            `${instance.defaults.baseURL}auth/refresh`,
            { refreshToken },
            { headers: { "Content-Type": "application/json" } },
          )
          .then((r) => r.data)
          .finally(() => {
            refreshPromise = null;
          });
      }

      const data = await refreshPromise;
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

      if (newAccess) setAccessToken(newAccess);
      if (newRefresh) setRefreshToken(newRefresh);
      if (newTrackingToken) setTrackingToken(newTrackingToken);

      original.headers = original.headers || {};
      if (newAccess) original.headers.Authorization = `Bearer ${newAccess}`;

      return instance(original);
    } catch (refreshErr) {
      clearAuth();
      throw refreshErr;
    }
  },
);

/** Ghi log đầy đủ lỗi HTTP từ axios (mở DevTools → Console khi debug). */
export function logApiError(error, context = "axios") {
  const res = error?.response;
  const data = res?.data;
  let responseDataKeys = null;
  if (data != null && typeof data === "object" && !Array.isArray(data)) {
    responseDataKeys = Object.keys(data);
  }

  const snapshot = {
    context,
    requestUrl: error?.config?.url,
    requestMethod: error?.config?.method,
    baseURL: error?.config?.baseURL,
    axiosMessage: error?.message,
    axiosCode: error?.code,
    responseStatus: res?.status,
    responseStatusText: res?.statusText,
    responseData: data,
    responseDataKeys,
  };

  console.error("[API error]", snapshot);
  if (data !== undefined) {
    console.error("[API error] response.data (chi tiết):", data);
  }
}

const textFromValue = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return null;
  if (typeof v === "boolean") return v ? "Có" : "Không";
  if (typeof v === "string") {
    const t = v.trim();
    return t || null;
  }
  if (Array.isArray(v)) {
    const parts = v.map((x) => textFromValue(x)).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
};

/** Chuỗi hiển thị cho người dùng; tránh dùng `message` kiểu số làm nội dung chính. */
export function humanizeApiError(err, fallback = "Đã xảy ra lỗi.") {
  const d = err?.response?.data;

  if (typeof d === "string") {
    const t = d.trim();
    if (t) return t;
  }

  const fromBody =
    textFromValue(d?.message) ||
    textFromValue(d?.error) ||
    textFromValue(d?.errors) ||
    textFromValue(d?.detail) ||
    textFromValue(d?.description) ||
    textFromValue(d?.msg);

  const fromAxios = textFromValue(err?.message);
  return fromBody || fromAxios || fallback;
}

export default instance;
