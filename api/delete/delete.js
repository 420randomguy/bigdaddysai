import { put, list } from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { request_id } = req.query;
  if (!request_id) {
    return res.status(400).json({ error: "Missing request_id" });
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

    const updatedHistory = history.filter(item => item.request_id !== request_id);
    if (updatedHistory.length === history.length) {
      return res.status(404).json({ error: "Video not found" });
    }

    await put("history.json", JSON.stringify(updatedHistory), {
      access: "public",
      storeId: storeId,
    });

    console.log(`Deleted video with request_id: ${request_id}`);
    return res.status(200).json({ message: "Video deleted successfully" });
  } catch (error) {
    console.error("Error deleting video:", error.message);
    return res.status(500).json({ error: "Failed to delete video", details: error.message });
  }
}