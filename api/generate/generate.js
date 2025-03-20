// api/generate/generate.js
import { put, list } from "@vercel/blob";
import * as formidable from "formidable";
import fs from "fs";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  console.log("1. Request hit /api/generate");

  if (req.method !== "POST") {
    console.log("2. Wrong method, expected POST, got:", req.method);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    console.log("3. Parsing form data...");
    const form = formidable.default();

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.log("❌ Error parsing form data:", err);
        return res.status(400).json({ error: "Failed to parse form data" });
      }

      console.log("✅ Parsed fields:", fields);
      console.log("✅ Parsed file:", files.image);

      const {
        prompt: promptArray,
        resolution: resolutionArray = ["1080p"],
        duration: durationArray = ["5"],
        motion_intensity: motionIntensityArray = ["medium"],
        motion_bucket_id: motionBucketIdArray = ["127"],
        cfm_scale: cfmScaleArray = ["0.5"],
        noise_aug_strength: noiseAugStrengthArray = ["0.1"],
        midas_depth_warp: midasDepthWarpArray = ["0.3"],
        seed: seedArray,
        guidance_scale: guidanceScaleArray = ["7.5"],
        num_inference_steps: numInferenceStepsArray = ["50"],
        frame_rate: frameRateArray = ["30"],
        negative_prompt: negativePromptArray = [""],
        shift: shiftArray = ["2.0"],
        category: categoryArray = [""],
      } = fields;

      const prompt = Array.isArray(promptArray) ? promptArray[0] : promptArray || "";
      const resolution = Array.isArray(resolutionArray) ? resolutionArray[0] : resolutionArray;
      const duration = Array.isArray(durationArray) ? durationArray[0] : durationArray;
      const motion_intensity = Array.isArray(motionIntensityArray) ? motionIntensityArray[0] : motionIntensityArray;
      const motion_bucket_id = Array.isArray(motionBucketIdArray) ? motionBucketIdArray[0] : motionBucketIdArray;
      const cfm_scale = Array.isArray(cfmScaleArray) ? cfmScaleArray[0] : cfmScaleArray;
      const noise_aug_strength = Array.isArray(noiseAugStrengthArray) ? noiseAugStrengthArray[0] : noiseAugStrengthArray;
      const midas_depth_warp = Array.isArray(midasDepthWarpArray) ? midasDepthWarpArray[0] : midasDepthWarpArray;
      const seed = Array.isArray(seedArray) ? seedArray[0] : seedArray;
      const guidance_scale = Array.isArray(guidanceScaleArray) ? guidanceScaleArray[0] : guidanceScaleArray;
      const num_inference_steps = Array.isArray(numInferenceStepsArray) ? numInferenceStepsArray[0] : numInferenceStepsArray;
      const frame_rate = Array.isArray(frameRateArray) ? frameRateArray[0] : frameRateArray;
      const negative_prompt = Array.isArray(negativePromptArray) ? negativePromptArray[0] : negativePromptArray;
      const shift = Array.isArray(shiftArray) ? shiftArray[0] : shiftArray;
      const category = Array.isArray(categoryArray) ? categoryArray[0] : categoryArray;

      if (!prompt || typeof prompt !== "string") {
        console.error("Invalid prompt: must be a non-empty string");
        return res.status(400).json({ error: "Prompt must be a non-empty string" });
      }

      let imageUrl = null;
      if (files.image) {
        const imageFile = Array.isArray(files.image) ? files.image[0] : files.image;
        console.log("4. Uploading image to blob storage...");
        if (imageFile.filepath) {
          const imageBuffer = fs.readFileSync(imageFile.filepath);
          try {
            const storeId = process.env.STORE_ID || "store_CKJawqvrYtN9o7F1";
            const filename = `input/${Date.now()}_${imageFile.originalFilename || "image.jpg"}`;
            const blobResult = await put(filename, imageBuffer, { access: "public", storeId });
            imageUrl = blobResult.url;
            console.log(`Image uploaded to blob storage: ${imageUrl}`);
          } catch (error) {
            console.error("Error uploading image to blob storage:", error);
            return res.status(500).json({ error: "Failed to upload image" });
          }
        } else {
          console.log("⚠️ No valid file path found in uploaded image.");
        }
      }

      if (!imageUrl) {
        return res.status(400).json({ error: "No valid image provided" });
      }

      const payload = {
        prompt,
        image_url: imageUrl,
        resolution,
        duration: parseInt(duration),
        motion_intensity,
        motion_bucket_id: parseInt(motion_bucket_id),
        cfm_scale: parseFloat(cfm_scale),
        noise_aug_strength: parseFloat(noise_aug_strength),
        midas_depth_warp: parseFloat(midas_depth_warp),
        seed: seed ? parseInt(seed) : undefined,
        guidance_scale: parseFloat(guidance_scale),
        num_inference_steps: parseInt(num_inference_steps),
        frame_rate: parseInt(frame_rate),
        negative_prompt,
        shift: parseFloat(shift),
        enable_safety_checker: false,
      };

      console.log("5. Sending payload to Fal API...");
      const apiKey = process.env.FAL_API_KEY;
      if (!apiKey) {
        console.error("No FAL_API_KEY found in environment variables.");
        return res.status(400).json({ error: "Missing FAL API key" });
      }

      let requestId;
      let statusUrl;
      const submissionTimestamp = Math.floor(Date.now() / 1000);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        console.log("Initiating fetch to Fal.ai...");
        const falResponse = await fetch("https://fal.run/fal-ai/wan-pro/image-to-video", {
          method: "POST",
          headers: {
            "Authorization": `Key ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log("6. Fal API response status:", falResponse.status);
        const falText = await falResponse.text();
        console.log("Raw Fal API response:", falText);

        if (!falResponse.ok) {
          console.error("Fal API error:", falText);
          return res.status(falResponse.status).json({
            error: `Fal API error: ${falResponse.status}`,
            details: falText,
          });
        }

        const falData = JSON.parse(falText);
        console.log("7. Fal API response data:", falData);
        requestId = falData.request_id;
        statusUrl = falData.status_url;

        if (!requestId || !statusUrl) {
          console.error("Missing request_id or status_url from Fal.ai");
          return res.status(500).json({ error: "Fal.ai did not return a request_id or status_url" });
        }
      } catch (falError) {
        console.error("Error calling Fal API:", falError);
        if (falError.name === "AbortError") {
          console.error("Fal API request timed out after 15 seconds");
          requestId = `temp-${submissionTimestamp}-${Math.random().toString(36).substring(2, 8)}`;
          statusUrl = "https://queue.fal.run/fal-ai/wan-pro/image-to-video/status";
          console.log("Generated temp request_id:", requestId);
          console.log("Using queue status_url:", statusUrl);
        } else {
          return res.status(500).json({ error: "Failed to call Fal API", details: falError.message });
        }
      }

      const newRecord = {
        request_id: requestId,
        prompt,
        resolution,
        duration: parseInt(duration),
        motion_intensity,
        motion_bucket_id: parseInt(motion_bucket_id),
        cfm_scale: parseFloat(cfm_scale),
        noise_aug_strength: parseFloat(noise_aug_strength),
        midas_depth_warp: parseFloat(midas_depth_warp),
        seed: seed ? parseInt(seed) : undefined,
        guidance_scale: parseFloat(guidance_scale),
        num_inference_steps: parseInt(num_inference_steps),
        frame_rate: parseInt(frame_rate),
        negative_prompt,
        shift: parseFloat(shift),
        status: "IN_PROGRESS",
        timestamp: submissionTimestamp,
        categories: category ? [category] : [""],
        image_url: imageUrl,
        status_url: statusUrl,
      };

      try {
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
        history.push(newRecord);
        await put("history.json", JSON.stringify(history), { access: "public", storeId });
        console.log("8. History updated successfully with request_id:", requestId);
      } catch (historyError) {
        console.error("Error updating history:", historyError);
        return res.status(500).json({ error: "Failed to update history", details: historyError.message });
      }

      console.log("9. Sending response to client with request_id:", requestId);
      return res.status(200).json({
        request_id: requestId,
        status: "IN_PROGRESS",
        status_url: statusUrl,
      });
    });
  } catch (error) {
    console.error("General error in generate endpoint:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
}