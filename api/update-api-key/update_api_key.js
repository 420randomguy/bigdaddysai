// api/update-api-key.js
import { put } from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }
  
  const { api_key } = req.body;
  
  if (!api_key) {
    return res.status(400).json({ error: "Missing API key" });
  }
  
  try {
    // Store API key securely (in production you'd use environment variables or a secret manager)
    // For this example, we'll store it in a blob with restricted access
    await put(".env.local", `FAL_KEY=${api_key}`, { access: 'private' });
    
    // Set the environment variable for the current session
    process.env.FAL_KEY = api_key;
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error updating API key:", error);
    return res.status(500).json({ 
      success: false, 
      error: "Failed to update API key"
    });
  }
}