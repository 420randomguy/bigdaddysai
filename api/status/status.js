import fetch from "node-fetch";
import { put, list } from "@vercel/blob";

export default async function handler(req, res) {
  let { request_id } = req.query;

  if (!request_id) {
    return res.status(400).json({ error: "Missing request_id parameter" });
  }

  console.log(`Checking status for request: ${request_id}`);

  try {
    const apiKey = process.env.FAL_API_KEY || req.headers["x-fal-key"];
    if (!apiKey) {
      return res.status(400).json({ error: "Missing FAL API key" });
    }
    const storeId = process.env.STORE_ID || "store_CKJawqvrYtN9o7F1";
    const { blobs } = await list({ storeId });
    const historyBlob = blobs.find((blob) => blob.pathname === "history.json");
    let history = [];
    if (historyBlob && historyBlob.url) {
      const historyResponse = await fetch(historyBlob.url);
      if (historyResponse.ok) {
        history = await historyResponse.json();
      } else {
        console.warn("Failed to fetch history.json:", historyResponse.status);
      }
    }

    // Find the history entry corresponding to the provided request_id
    const videoEntry = history.find((item) => item.request_id === request_id);
    let statusUrl = videoEntry?.status_url;
    const isTempRequest = request_id.startsWith("temp-");
    let statusResponse;

    // If it's a temporary request or there's no status_url stored, use the generic queue endpoint.
    if (isTempRequest || !statusUrl) {
      console.log(`Using queue status for ${request_id}`);
      statusResponse = await fetch("https://queue.fal.run/fal-ai/wan-pro/image-to-video/status", {
        method: "POST",
        headers: {
          "Authorization": `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ request_id }),
      });
    } else {
      console.log(`Using specific status_url: ${statusUrl}`);
      statusResponse = await fetch(statusUrl, {
        headers: { "Authorization": `Key ${apiKey}` },
      });
    }

    if (!statusResponse.ok) {
      console.error(`Error checking status: ${statusResponse.status}`);
      const errorText = await statusResponse.text();
      return res.status(statusResponse.status).json({
        error: `Status check failed: ${statusResponse.status}`,
        details: errorText,
      });
    }

    const statusData = await statusResponse.json();
    console.log("Status data:", statusData);

    // If Fal.ai returns a different (final) request_id, merge it into our history record.
    const realRequestId = statusData.request_id || request_id;
    if (realRequestId !== request_id) {
      const itemIndex = history.findIndex((item) => item.request_id === request_id);
      if (itemIndex !== -1) {
        history[itemIndex] = {
          ...history[itemIndex],
          request_id: realRequestId,
          status_url: statusData.status_url || `https://queue.fal.run/fal-ai/wan-pro/requests/${realRequestId}/status`,
          status: statusData.status,
        };
        await put("history.json", JSON.stringify(history), { access: "public", storeId });
        console.log(`Updated history: replaced ${request_id} with final request_id ${realRequestId}`);
        request_id = realRequestId; // update our variable so that subsequent logic uses the final id
      }
    }

    let state = statusData.status; // Expected values: "IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED"
    let videoUrl = null;
    let lowResVideoUrl = null;
    let logs = statusData.logs || [];

    if (state === "COMPLETED" && statusData.response_url) {
      const responseFetch = await fetch(statusData.response_url, {
        headers: { "Authorization": `Key ${apiKey}` },
      });
      if (responseFetch.ok) {
        const responseData = await responseFetch.json();
        console.log("Response data:", responseData);
        if (responseData.video?.url) {
          videoUrl = responseData.video.url;
          try {
            const videoResponse = await fetch(videoUrl);
            if (videoResponse.ok) {
              const videoBuffer = await videoResponse.buffer();
              const blobVideoResult = await put(`output/${request_id}.mp4`, videoBuffer, { access: "public", storeId });
              console.log(`Video saved to blob storage: ${blobVideoResult.url}`);
              videoUrl = blobVideoResult.url;
              lowResVideoUrl = blobVideoResult.url;
            } else {
              console.error("Failed to download video:", videoResponse.status);
            }
          } catch (videoError) {
            console.error("Error saving video to blob storage:", videoError.message);
          }
        } else {
          console.warn("No video URL in response data");
        }
      } else {
        console.error("Failed to fetch response_url:", responseFetch.status);
      }
    }

    // Update the history record if the status or video URL has changed.
    const itemIndex = history.findIndex((item) => item.request_id === request_id);
    if (itemIndex !== -1 && (history[itemIndex].status !== state || (videoUrl && !history[itemIndex].video_url))) {
      history[itemIndex].status = state;
      if (videoUrl) history[itemIndex].video_url = videoUrl;
      if (lowResVideoUrl) history[itemIndex].low_res_video_url = lowResVideoUrl;
      await put("history.json", JSON.stringify(history), { access: "public", storeId });
      console.log(`Updated history for request_id: ${request_id} to ${state}`);
    }

    return res.status(200).json({
      request_id, // final (updated) request_id if changed
      status: state,
      logs,
      video_url: videoUrl,
      low_res_video_url: lowResVideoUrl,
    });
  } catch (error) {
    console.error("Error in status endpoint:", error.message);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
}
