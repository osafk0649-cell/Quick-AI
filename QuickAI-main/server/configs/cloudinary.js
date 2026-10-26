import { v2 as cloudinary } from "cloudinary";

const connectCloudinary = async () => {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
        api_key: process.env.CLOUDINARY_API_KEY?.trim(),
        api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
        secure: true,
    });

    try {
        await cloudinary.api.ping();
        console.log("✅ Cloudinary connected");
    } catch (error) {
        console.log("❌ Cloudinary connection failed");
        console.log("Message:", error.message);
    }
};

export default connectCloudinary;