import fetch from 'node-fetch';
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse the payload from the request body
    const {
      prompt,
      resolution,
      duration,
      motion_intensity,
      motion_bucket_id,
      cfm_scale,
      noise_aug_strength,
      midas_depth_warp,
      seed,
      guidance_scale,
      num_inference_steps,
      frame_rate,
      negative_prompt,
      shift
    } = req.body;
    
    // Get your fal.ai API key from environment variables
    const falApiKey = process.env.FAL_API_KEY;
    if (!falApiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }
    
    // Build the payload for fal.ai
    const payload = {
      prompt,
      resolution,
      duration,
      motion_intensity,
      motion_bucket_id,
      cfm_scale,
      noise_aug_strength,
      midas_depth_warp,
      seed,
      guidance_scale,
      num_inference_steps,
      frame_rate,
      negative_prompt,
      shift
    };

    // Call the fal.ai API (adjust the URL and options as needed)
    const falResponse = await fetch('https://api.fal.ai/wan21pro/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${falApiKey}`
      },
      body: JSON.stringify(payload)
    });
    
    if (!falResponse.ok) {
      const errMsg = await falResponse.text();
      return res.status(500).json({ error: `fal.ai API error: ${errMsg}` });
    }
    
    const data = await falResponse.json();

    // Create a new record to persist in KV
    const newRecord = {
      request_id: data.request_id,
      prompt,
      timestamp: Math.floor(Date.now() / 1000)
      // Add other fields if needed
    };

    // Retrieve existing history from KV (or empty array if none) and append the new record
    const history = (await kv.get('history')) || [];
    history.push(newRecord);
    await kv.set('history', history);

    // Return the fal.ai request_id to the client
    return res.status(200).json({ request_id: data.request_id });
  } catch (error) {
    console.error('Error in /api/generate:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
