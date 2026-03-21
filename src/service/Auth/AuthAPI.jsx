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
    console.error("Error registering:", error);
    throw error;
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

export default { loginAPI, registerAPI, verifyOTPAPI };
