import { put, list } from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { request_id, category } = req.body;
  if (!request_id || !category) {
    return res.status(400).json({ error: "Missing request_id or category" });
  }

  try {
    const storeId = process.env.STORE_ID || "store_CKJawqvrYtN9o7F1";
    const { blobs } = await list({ storeId });
    const historyBlob = blobs.find(blob => blob.pathname === "history.json");
    let history = [];

    if (historyBlob && historyBlob.url) {
      const historyResponse = await fetch(historyBlob.url);
      if (historyResponse.ok) {
        history = await historyResponse.json();
      }
    }

    const itemIndex = history.findIndex(item => item.request_id === request_id);
    if (itemIndex === -1) {
      return res.status(404).json({ error: "Video not found" });
    }

    const categories = (history[itemIndex].categories || []).filter(cat => cat !== category);
    history[itemIndex].categories = categories;

    await put("history.json", JSON.stringify(history), {
      access: "public",
      storeId: storeId,
    });

    console.log(`Removed category '${category}' from video with request_id: ${request_id}`);
    return res.status(200).json({ message: "Category removed successfully" });
  } catch (error) {
    console.error("Error removing category:", error.message);
    return res.status(500).json({ error: "Failed to remove category", details: error.message });
  }
}