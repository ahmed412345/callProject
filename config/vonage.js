import { Vonage } from "@vonage/server-sdk";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const privateKeyPath = path.resolve(__dirname, "./private.key");

const vonage = new Vonage({
    apiKey: process.env.VONAGE_KEY,
    apiSecret: process.env.VONAGE_SECRIT,
    applicationId: process.env.APLICATION_ID,
    privateKey: privateKeyPath, // يمكنك تمرير المسار مباشرة هنا
});

export default vonage;
