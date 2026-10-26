import OpenAI from "openai";
import GenerateArticle from "../models/GenerateArticle.js";
import { clerkClient } from "@clerk/express";
import GenerateBlogTitle from "../models/GenerateBlogTitle.js";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import GenerateImage from "../models/GenerateImage.js";
import pdf from "pdf-parse-new";
import ReviewResume from "../models/ReviewResume.js";
import FormData from "form-data";
import getDataUri from "../configs/datauri.js";


const AI = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

export const generateArticle = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { prompt, length } = req.body;
    const plan = req.plan;
    const free_usage = req.free_usage;

    if (plan !== "premium" && free_usage >= 10) {
      return res.json({
        success: false,
        message: "Limit reached. Upgrade to continue",
      });
    }

    const response = await AI.chat.completions.create({
      model: "gemini-3-flash-preview",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: length,
    });

    const content = response.choices[0].message.content;

    // Create and save article
    const newArticle = new GenerateArticle({
      userId,
      prompt,
      content,
    });
    await newArticle.save();

    if (plan != "premium") {
      await clerkClient.users.updateUserMetadata(userId, {
        privateMetadata: {
          free_usage: free_usage + 1,
        },
      });
    }

    res.json({ success: true, content });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

export const generateBlogTitle = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { prompt } = req.body;

    console.log("Blog title prompt:", prompt);

    const plan = req.plan;
    const free_usage = req.free_usage;

    if (plan !== "premium" && free_usage >= 10) {
      return res.json({
        success: false,
        message: "Limit reached. Upgrade to continue",
      });
    }

    const response = await AI.chat.completions.create({
      model: "gemini-3-flash-preview",
      messages: [
        {
          role: "user",
          content: `Create ONE complete blog title based on this request:

${prompt}

Return ONLY the title.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    console.log(
      "AI RESPONSE:",
      JSON.stringify(response, null, 2)
    );

    console.log(
      "MESSAGE:",
      JSON.stringify(response.choices?.[0]?.message, null, 2)
    );

    console.log(
      "FINISH REASON:",
      response.choices?.[0]?.finish_reason
    );

    const content = response.choices?.[0]?.message?.content?.trim();

    console.log("BLOG TITLE:", content);

    if (!content) {
      return res.status(500).json({
        success: false,
        message: "AI did not return a blog title",
      });
    }

    const newBlogTitle = new GenerateBlogTitle({
      userId,
      prompt,
      content,
    });

    await newBlogTitle.save();

    if (plan !== "premium") {
      await clerkClient.users.updateUserMetadata(userId, {
        privateMetadata: {
          free_usage: free_usage + 1,
        },
      });
    }

    res.json({
      success: true,
      content,
    });

  } catch (error) {
    console.error("Generate Blog Title Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const generateImage = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { prompt, publish } = req.body;
    const plan = req.plan;

    console.log("========== GENERATE IMAGE ==========");
    console.log("User ID:", userId);
    console.log("Plan:", plan);
    console.log("Prompt:", prompt);
    console.log(
      "Clipdrop API Key exists:",
      !!process.env.CLIPDROP_API_KEY
    );

    if (plan !== "premium") {
      return res.status(403).json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    if (!process.env.CLIPDROP_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "CLIPDROP_API_KEY is missing",
      });
    }

    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: "Prompt is required",
      });
    }

    const formData = new FormData();
    formData.append("prompt", prompt);

    console.log("➡️ Sending request to Clipdrop...");

    const response = await axios.post(
      "https://clipdrop-api.co/text-to-image/v1",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          "x-api-key": process.env.CLIPDROP_API_KEY,
        },
        responseType: "arraybuffer",
      }
    );

    console.log("✅ Clipdrop status:", response.status);
    console.log("Image buffer size:", response.data.length);

    const base64Image = `data:image/png;base64,${Buffer.from(
      response.data
    ).toString("base64")}`;

    console.log("Base64 image length:", base64Image.length);
    console.log("➡️ Uploading image to Cloudinary...");

    const uploadResult = await cloudinary.uploader.upload(
      base64Image,
      {
        resource_type: "image",
      }
    );

    console.log("✅ Cloudinary upload successful");
    console.log("Cloudinary URL:", uploadResult.secure_url);

    const newImage = new GenerateImage({
      userId,
      prompt,
      content: uploadResult.secure_url,
      publish,
    });

    await newImage.save();

    console.log("✅ Image saved to database");

    res.json({
      success: true,
      content: uploadResult.secure_url,
    });

  } catch (error) {
    console.log("=================================");
    console.log("❌ IMAGE GENERATION ERROR");
    console.log("Name:", error.name);
    console.log("Message:", error.message);
    console.log("HTTP Code:", error.http_code);
    console.log("Error Code:", error.code);

    if (error.response) {
      console.log("Response Status:", error.response.status);
      console.log("Response Data:", error.response.data);
    }

    console.log("Full error:", error);
    console.log("=================================");

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// export const removeImageBackground = async (req, res) => {
//   try {
//     const { userId } = req.auth();
//     const { image } = req.file;
//     const plan = req.plan;

//     if (plan !== "premium") {
//       return res.json({
//         success: false,
//         message: "This feature is only avilable for premium subscriptions",
//       });
//     }

//     const {secure_url} = await cloudinary.uploader.upload(image.path, {
//       transformation: {
//         effect: 'background_removal',
//         background_removal: 'remove_the_background'
//       }
//     })

//     // Create and save article
//     const newArticle = new GenerateImage({
//       userId,
//       prompt : "Remove backgound form image",
//       content: secure_url,
//     });
//     await newArticle.save();

//     res.json({ success: true, content: secure_url });
//   } catch (error) {
//     res.json({ success: false, message: error.message });
//   }
// };

export const removeImageBackground = async (req, res) => {
  try {
    const { userId } = req.auth();
    const image = req.file;

    const plan = req.plan;

    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    if (!image) {
      return res.json({
        success: false,
        message: "Image file is required",
      });
    }
    const imageUri = getDataUri(image);

    const { secure_url } = await cloudinary.uploader.upload(imageUri.content, {
      transformation: [{ effect: "background_removal" }],
    });

    const newArticle = new GenerateImage({
      userId,
      prompt: "Remove background from image",
      content: secure_url,
    });

    await newArticle.save();

    res.json({ success: true, content: secure_url });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

export const removeImageObject = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { object } = req.body;
    const image = req.file;
    const plan = req.plan;

    // Check premium plan
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    // Validate image
    if (!image) {
      return res.json({
        success: false,
        message: "Image file is required",
      });
    }

    // Validate object
    if (!object) {
      return res.json({
        success: false,
        message: "Object name is required",
      });
    }

    // Convert to DataURI
    const imageUri = getDataUri(image);

    // Upload image
    const uploadResult = await cloudinary.uploader.upload(imageUri.content);

    // Generate transformed image URL
    const imageUrl = cloudinary.url(uploadResult.public_id, {
      transformation: [{ effect: `gen_remove:${object}` }],
      resource_type: "image",
    });
    console.log(imageUrl);

    // Save record
    const newArticle = new GenerateImage({
      userId,
      prompt: `Removed ${object} from image`,
      content: imageUrl,
    });

    await newArticle.save();

    res.json({ success: true, content: imageUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// export const resumeReview = async (req, res) => {
//   try {
//     const { userId } = req.auth();
//     const resume = req.file;
//     const plan = req.plan;

//     if (plan !== "premium") {
//       return res.json({
//         success: false,
//         message: "This feature is only avilable for premium subscriptions",
//       });
//     }

//     if(resume.size > 5*1024 *1024){
//       return res.json({
//         success: false,
//         message: "File size is greater than 5MB"
//       })
//     }
//     const dataBuffer = fs.readFileSync(resume.path);
//     const pdfData = await pdf(dataBuffer);

//     const prompt = `Review the following resume and provide constructive feedback on its strengths,
//     weaknesses, and areas for imporvement. Resume Content:\n\n${pdfData.text}`

//     const response = await AI.chat.completions.create({
//       model: "gemini-2.0-flash",
//       messages: [
//         {
//           role: "user",
//           content: prompt,
//         },
//       ],
//       temperature: 0.7,
//       max_tokens: 1000,
//     });

//     const content = response.choices[0].message.content;

//     // Create and save article
//     const newResume = new ReviewResume({
//       userId,
//       prompt : "Review the uploaded resume",
//       content,
//     });
//     await newResume.save();

//     res.json({ success: true, content });
//   } catch (error) {
//     res.json({ success: false, message: error.message });
//   }
// };

export const resumeReview = async (req, res) => {
  try {
    const { userId } = req.auth();
    const resume = req.file;
    const plan = req.plan;

    // Plan check
    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    // File check
    if (!resume) {
      return res.json({
        success: false,
        message: "Resume file is required",
      });
    }

    // File type check
    if (resume.mimetype !== "application/pdf") {
      return res.json({
        success: false,
        message: "Only PDF files are allowed",
      });
    }

    // File size check
    if (resume.size > 5 * 1024 * 1024) {
      return res.json({
        success: false,
        message: "File size must be less than 5MB",
      });
    }
    console.log(pdf);

    // Parse PDF from buffer
    const pdfData = await pdf(resume.buffer);
    
    const prompt = `Review the following resume and provide constructive feedback on its strengths,
weaknesses, and areas for improvement.

Resume Content:
${pdfData.text}`;

    const response = await AI.chat.completions.create({
      model: "gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = response.choices[0].message.content;

    const newResume = new ReviewResume({
      userId,
      prompt: "Review the uploaded resume",
      content,
    });

    await newResume.save();

    res.json({ success: true, content });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
