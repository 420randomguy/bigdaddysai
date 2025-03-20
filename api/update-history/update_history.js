// api/update-history/update_history.js
import { put, list } from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { videos } = req.body;
    if (!Array.isArray(videos)) {
      return res.status(400).json({ error: "Invalid videos array" });
    }

    const storeId = process.env.STORE_ID || "store_CKJawqvrYtN9o7F1";
    const { blobs } = await list({ storeId });
    const historyBlob = blobs.find((blob) => blob.pathname === "history.json");
    let history = [];
    if (historyBlob && historyBlob.url) {
      const historyResponse = await fetch(historyBlob.url);
      if (historyResponse.ok) {
        history = await historyResponse.json();
      }
    }

    // Merge updates: keep existing, update matching request_ids
    videos.forEach((newVideo) => {
      const index = history.findIndex((item) => item.request_id === newVideo.request_id);
      if (index !== -1) {
        history[index] = { ...history[index], ...newVideo };
      } else {
        history.push(newVideo);
      }
    });

    await put("history.json", JSON.stringify(history), { access: "public", storeId });
    console.log("History.json updated with", history.length, "items");
    return res.status(200).json({ message: "History updated successfully" });
  } catch (error) {
    console.error("Error updating history:", error);
    return res.status(500).json({ error: "Failed to update history", details: error.message });
  }
}