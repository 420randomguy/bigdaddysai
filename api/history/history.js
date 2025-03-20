// api/history/history.js
import { list } from "@vercel/blob";

export default async function handler(req, res) {
  try {
    console.log("Fetching video history");
    let history = [];
    const storeId = process.env.STORE_ID || "store_CKJawqvrYtN9o7F1";

    const { blobs } = await list({ storeId });
    const historyBlob = blobs.find((blob) => blob.pathname === "history.json");
    if (historyBlob && historyBlob.url) {
      const historyResponse = await fetch(historyBlob.url);
      if (historyResponse.ok) {
        history = await historyResponse.json();
        console.log("Full history.json contents:", JSON.stringify(history, null, 2));
        console.log(`Successfully retrieved ${history.length} history items`);
      } else {
        console.warn("Failed to fetch history.json:", historyResponse.status);
      }
    } else {
      console.log("No history.json file found in blob storage for store:", storeId);
    }

    const { category } = req.query;
    if (category !== undefined) {
      if (category === "") {
        history = history.filter((item) => !item.categories || item.categories.length === 0 || item.categories.includes(""));
      } else {
        history = history.filter((item) => item.categories && item.categories.includes(category));
      }
    }

    history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return res.status(200).json(history);
  } catch (error) {
    console.error("Error in history endpoint:", error.message);
    return res.status(500).json({ error: "Failed to fetch history", details: error.message });
  }
}