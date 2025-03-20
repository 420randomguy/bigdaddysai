import fetch from "node-fetch";
import { list } from "@vercel/blob";

export default async function handler(req, res) {
  const storeId = process.env.STORE_ID || "store_CKJawqvrYtN9o7F1";
  try {
    // Retrieve the blobs from your blob storage
    const { blobs } = await list({ storeId });
    // Find the history.json file
    const historyBlob = blobs.find(blob => blob.pathname === "history.json");
    let history = [];
    if (historyBlob && historyBlob.url) {
      const response = await fetch(historyBlob.url);
      if (response.ok) {
        history = await response.json();
      } else {
        console.warn("Failed to fetch history.json:", response.status);
      }
    }
    // Filter for completed video entries that have a video URL
    const galleryItems = history.filter(item => item.status === "COMPLETED" && item.video_url);
    return res.status(200).json({ gallery: galleryItems });
  } catch (error) {
    console.error("Error fetching gallery:", error.message);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
}
