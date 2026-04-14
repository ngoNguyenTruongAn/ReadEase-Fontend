import instance from "../instance";
const getProfile = async () => {
  try {
    const response = await instance.get("auth/profile");
    return response.data;
  } catch (error) {
    console.error("Error getting profile:", error);
    throw error;
  }
};

export default { getProfile };
