import instance from "../instance";

const loginAPI = async (email, password) => {
  try {
    const response = await instance.post("auth/login", { email, password });
    return response.data;
  } catch (error) {
    console.error("Error logging in:", error);
    throw error;
  }
};

const registerAPI = async (email, password, displayName, role) => {
  try {
    const response = await instance.post("auth/register", {
      email,
      password,
      displayName,
      role,
    });
    return response.data;
  } catch (error) {
    const apiError = error?.response?.data?.error;
    const message =
      (Array.isArray(apiError?.details) && apiError.details[0]) ||
      apiError?.message ||
      error?.response?.data?.message ||
      error?.message ||
      "Đăng ký thất bại";

    const normalizedError = new Error(message);
    normalizedError.response = error?.response;
    normalizedError.code = apiError?.code || error?.code;

    console.error("Error registering:", {
      message,
      code: normalizedError.code,
      status: error?.response?.status,
      data: error?.response?.data,
    });
    throw normalizedError;
  }
};

const verifyOTPAPI = async (email, code) => {
  try {
    const response = await instance.post("auth/verify-email", { email, code });
    return response.data;
  } catch (error) {
    console.error("Error verifying OTP:", error);
    throw error;
  }
};

const getProfileAPI = async () => {
  try {
    const response = await instance.get("auth/profile");
    return response.data;
  } catch (error) {
    console.error("Error getting profile API:", error);
    throw error;
  }
};

const refreshTokenAPI = async (refreshToken) => {
  try {
    const response = await instance.post("auth/refresh", { refreshToken });
    return response.data;
  } catch (error) {
    console.error("Error refreshing token:", error);
    throw error;
  }
};

export default {
  loginAPI,
  registerAPI,
  verifyOTPAPI,
  getProfileAPI,
  refreshTokenAPI,
};
