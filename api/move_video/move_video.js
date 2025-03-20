// api/move_video.js
import { list, put } from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }
  
  const { request_id, category, remove_from_all } = req.body;
  
  if (!request_id) {
    return res.status(400).json({ error: "Missing request_id" });
  }
  
  try {
    // Get current history
    const { blobs } = await list();
    const historyBlob = blobs.find(blob => blob.pathname === "history.json");
    let history = [];
    
    if (historyBlob && historyBlob.url) {
      const historyResponse = await fetch(historyBlob.url);
      if (historyResponse.ok) {
        history = await historyResponse.json();
      }
    }
    
    // Find the video entry
    const videoIndex = history.findIndex(item => item.request_id === request_id);
    
    if (videoIndex === -1) {
      return res.status(404).json({ error: "Video not found" });
    }
    
    // Update categories
    const video = history[videoIndex];
    let categories = video.categories || [];
    
    // Remove from "all" category if requested
    if (remove_from_all) {
      categories = categories.filter(cat => cat !== "");
    }
    
    // Add to new category if provided and not already there
    if (category && !categories.includes(category)) {
      categories.push(category);
    }
    
    // Update the video record
    history[videoIndex] = {
      ...video,
      categories
    };
    
    // Save updated history
    await put("history.json", JSON.stringify(history), { access: 'public' });
    
    return res.status(200).json({ 
      message: "Video moved successfully",
      categories
    });
  } catch (error) {
    console.error("Error moving video:", error);
    return res.status(500).json({ error: "Failed to move video" });
  }
}