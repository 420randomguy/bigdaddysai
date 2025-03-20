// api/categories/index.js
import { list, put } from "@vercel/blob";

export default async function handler(req, res) {
  // GET: Retrieve all categories
  if (req.method === 'GET') {
    try {
      // Get history to extract categories
      const { blobs } = await list();
      const historyBlob = blobs.find(blob => blob.pathname === "history.json");
      let history = [];
      
      if (historyBlob && historyBlob.url) {
        const historyResponse = await fetch(historyBlob.url);
        if (historyResponse.ok) {
          history = await historyResponse.json();
        }
      }
      
      // Extract unique categories from history
      const categoriesSet = new Set();
      
      history.forEach(item => {
        if (item.categories && Array.isArray(item.categories)) {
          item.categories.forEach(category => {
            if (category) categoriesSet.add(category);
          });
        }
      });
      
      const categories = Array.from(categoriesSet);
      return res.status(200).json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      return res.status(500).json({ error: "Failed to fetch categories" });
    }
  }
  
  // POST: Create new category
  else if (req.method === 'POST') {
    try {
      const { name } = req.body;
      
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: "Invalid category name" });
      }
      
      // Category is already stored in the history items, not in a separate file
      // So no need to create a separate category record
      
      return res.status(200).json({ success: true, name });
    } catch (error) {
      console.error("Error creating category:", error);
      return res.status(500).json({ error: "Failed to create category" });
    }
  }
  
  else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}