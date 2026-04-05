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

const clearAuth = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("accessToken");
  localStorage.removeItem("token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("refreshToken");
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

      if (newAccess) setAccessToken(newAccess);
      if (newRefresh) setRefreshToken(newRefresh);

      original.headers = original.headers || {};
      if (newAccess) original.headers.Authorization = `Bearer ${newAccess}`;

      return instance(original);
    } catch (refreshErr) {
      clearAuth();
      throw refreshErr;
    }
  },
);

export default instance;
