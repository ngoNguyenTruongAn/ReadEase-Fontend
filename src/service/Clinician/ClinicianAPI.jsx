import instance from "../instance";
import { createClient } from "@supabase/supabase-js";

// Vite chỉ inject biến môi trường qua import.meta.env (prefix VITE_).
// Dùng process.env.REACT_APP_* trong browser gây ReferenceError (process is not defined) → crash trắng màn hình.
let supabaseClient = null;
let lastSupabaseConfig = "";

const normalizeSupabaseUrl = (raw) => {
  let url = String(raw ?? "").trim();
  if (!url) return "";
  // Cho phép ghi trong .env kiểu "xxx.supabase.co" (thiếu protocol) — thư viện bắt buộc http(s).
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    // Supabase project URL chuẩn không nên có path/query; tránh dán nhầm endpoint khác.
    return `${parsed.origin}`;
  } catch {
    return "";
  }
};

/** Anon key là JWT dạng compact (3 phần chấm). Lỗi "Invalid Compact JWS" = key sai / cắt / thừa ký tự trong .env */
const normalizeAnonKey = (raw) => {
  let k = String(raw ?? "").trim();
  if (!k) return "";
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1).trim();
  }
  k = k.replace(/\s+/g, "");
  return k;
};

const isLikelySupabaseJwt = (k) => {
  const parts = k.split(".");
  if (parts.length !== 3) return false;
  return parts.every((p) => p.length > 0);
};

const getSupabase = () => {
  const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
  const supabaseKey = normalizeAnonKey(import.meta.env.VITE_SUPABASE_ANON_KEY);
  const configFingerprint = `${supabaseUrl}\0${supabaseKey}`;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Thiếu hoặc sai VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Đặt file .env trong thư mục ReadEase-Fontend (cùng cấp vite.config.js), dạng URL: https://<ref>.supabase.co — lấy tại Supabase Dashboard → Settings → API.",
    );
  }

  if (!isLikelySupabaseJwt(supabaseKey)) {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY không đúng định dạng (cần JWT đủ 3 phần: xxx.yyy.zzz). Vào Supabase → Settings → API → copy lại mục "anon" / "public", một dòng, không xuống dòng giữa chừng, không thêm dấu ngoặc.',
    );
  }

  if (!supabaseClient || lastSupabaseConfig !== configFingerprint) {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
    lastSupabaseConfig = configFingerprint;
  }
  return supabaseClient;
};

// --- Hàm Upload lên Supabase ---
const uploadCoverImage = async (file) => {
  try {
    const supabase = getSupabase();
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `covers/${fileName}`;

    // 1. Upload lên bucket 'contents'
    const { data, error } = await supabase.storage
      .from("contents")
      .upload(filePath, file);

    if (error) throw error;

    // 2. Lấy URL công khai
    const { data: publicData } = supabase.storage
      .from("contents")
      .getPublicUrl(filePath);

    return publicData.publicUrl; // Trả về link ngắn để lưu vào DB
  } catch (error) {
    console.error("Supabase Upload Error:", error);
    const msg = String(error?.message ?? error ?? "");
    if (/invalid compact jws/i.test(msg)) {
      throw new Error(
        'Supabase từ chối anon key (JWT không hợp lệ). Kiểm tra VITE_SUPABASE_ANON_KEY: copy đủ key "anon public" từ Dashboard → Settings → API, đúng project với VITE_SUPABASE_URL, rồi restart dev server.',
      );
    }
    throw error;
  }
};

// Content (reading materials) - ROLE_CLINICIAN
const createContent = async (
  title,
  body,
  difficulty,
  age_group,
  cover_image_url,
) => {
  const payload = {
    title,
    body,
    difficulty,
    age_group,
    cover_image_url,
  };

  try {
    const response = await instance.post("content", payload);
    return response.data;
  } catch (error) {
    console.error("Error creating content:", error);
    throw error;
  }
};

const updateContent = async (
  id,
  title,
  body,
  difficulty,
  age_group,
  cover_image_url,
) => {
  const payload = {
    title,
    body,
    difficulty,
    age_group,
    cover_image_url,
  };
  try {
    const response = await instance.put(`content/${id}`, payload);
    return response.data;
  } catch (error) {
    console.error("Error updating content:", error);
    throw error;
  }
};

const deleteContent = async (id) => {
  try {
    const response = await instance.delete(`content/${id}`);
    return response.data;
  } catch (error) {
    console.error("Error deleting content:", error);
    throw error;
  }
};

const getContents = async () => {
  try {
    const response = await instance.get("content");
    return response.data;
  } catch (error) {
    console.error("Error getting contents:", error);
    throw error;
  }
};

const getContentById = async (id) => {
  try {
    const response = await instance.get(`content/${id}`);
    return response.data;
  } catch (error) {
    console.error("Error getting content by id:", error);
    throw error;
  }
};

// Analytics - ROLE_CLINICIAN
const getHeatmap = async (childId, sessionId) => {
  try {
    const response = await instance.get(`analytics/${childId}/heatmap`, {
      params: { sessionId },
    });
    return response.data;
  } catch (error) {
    console.error("Error getting heatmap:", error);
    throw error;
  }
};

//xu huopng doc sach
const getTrends = async (childId, days = 7) => {
  try {
    const response = await instance.get(`analytics/${childId}/trends`, {
      params: { days },
    });
    return response.data;
  } catch (error) {
    console.error("Error getting trends:", error);
    throw error;
  }
};

//phien doc sach
const getSessionReplay = async (sessionId) => {
  try {
    const response = await instance.get(`sessions/${sessionId}/replay`);
    return response.data;
  } catch (error) {
    console.error("Error getting session replay:", error);
    throw error;
  }
};

//phien doc sach cua tre
const getChildSessions = async (childId, params = {}) => {
  try {
    const response = await instance.get(`sessions/${childId}`, { params });
    return response.data;
  } catch (error) {
    console.error("Error getting child sessions:", error);
    throw error;
  }
};

const getRewards = async () => {
  try {
    const response = await instance.get("rewards");
    return response.data;
  } catch (error) {
    console.error("Error getting rewards:", error);
    throw error;
  }
};

const postReward = async (name, description, cost, stock, image_url) => {
  const payload = {
    name,
    description,
    cost,
    stock,
  };
  const imageUrl = String(image_url ?? "").trim();
  if (imageUrl) payload.image_url = imageUrl;
  try {
    const response = await instance.post("rewards", payload);
    return response.data;
  } catch (error) {
    console.error("Error posting reward:", error);
    throw error;
  }
};

//chinh sua report
const updateReportContent = async (reportId, content) => {
  const payload = {
    content,
  };
  try {
    const response = await instance.patch(
      `reports/${reportId}/content`,
      payload,
    );
    return response.data;
  } catch (error) {
    console.error("Error updating report:", error);
    throw error;
  }
};

export default {
  uploadCoverImage,
  // content
  createContent,
  updateContent,
  deleteContent,
  getContents,
  getContentById,

  // analytics
  getHeatmap,
  getTrends,

  // sessions
  getSessionReplay,
  getChildSessions,

  // rewards
  getRewards,
  postReward,

  // reports
  updateReportContent,
};
