import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import mongoConnect from "./config/db_connect.js";
import errorMiddleware from "./middleware/error.js";
import { makeCall } from "./services/make-call.js";
import { managementMsg } from "./services/management-msg.js";
import { getAudioStreamUrl, streamFishAudio } from "./services/fish.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//علشان نخلي السيرفر مينامش
app.get("/ping", (req, res) => {
    res.end("pong");
});

app.use("/", express.static("public/"));

app.get("/startcall", async (req, res) => {
    await makeCall();
    res.json({ status: "successful" });
});

// ربط مسار البث الصوتي بالـ Handler المنفصل
app.get("/webhooks/audio-stream", streamFishAudio);

// مسار المكالمة الأساسي
// تأكد من وجود هذا السطر في أعلى ملف Express لديك قبل تعريف المسارات

// دالة مساعدة لتجنب كسر الـ XML إذا احتوى الرابط على علامة &
const escapeXml = (unsafe) =>
    String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

app.post("/webhooks/speech", async (req, res) => {
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.URL;

    try {
        if (!req.body || typeof req.body !== "object") {
            return res.status(400).send("Missing request body");
        }

        const callId = req.body.CallSid;
        const userMessage = req.body.SpeechResult?.trim();

        if (!callId) {
            return res.status(400).send("CallSid is required");
        }

        // 1. في حالة عدم وضوح الصوت أو الصمت
        if (!userMessage) {
            const retryAudio = escapeXml(
                getAudioStreamUrl("بعتذر من حضرتك صوتك غير واضح.")
            );
            res.type("text/xml");
            return res.send(`
                <Response>
                    <Play>${retryAudio}</Play>
                    <Gather input="speech" language="ar-EG" speechTimeout="0.5" action="${BASE_URL}/webhooks/speech" method="POST" />
                </Response>
            `);
        }

        console.log("User said:", userMessage);

        const aiResult = await managementMsg(callId, userMessage);
        const replyAudio = escapeXml(getAudioStreamUrl(aiResult?.reply));

        // 2. في حالة انتهاء المكالمة (تشغيل الرد ثم إغلاق الخط)
        if (aiResult?.isCallEnded) {
            res.type("text/xml");
            return res.send(`
                <Response>
                    <Play>${replyAudio}</Play>
                    <Hangup />
                </Response>
            `);
        }

        // 3. استمرار المحادثة (وضع <Play> داخل <Gather> يفعّل المقاطعة bargeIn تلقائياً)
        res.type("text/xml");
        return res.send(`
            <Response>
                <Gather input="speech" language="ar-EG" speechTimeout="0.5" action="${BASE_URL}/webhooks/speech" method="POST">
                    <Play>${replyAudio}</Play>
                </Gather>
            </Response>
        `);
    } catch (error) {
        console.error("Webhook Error:", error);
        res.type("text/xml");
        res.status(500).send(`
            <Response>
                <Hangup />
            </Response>
        `);
    }
});
app.use(errorMiddleware);

// تشغيل السيرفر بعد الاتصال بقاعدة البيانات
const startServer = async () => {
    try {
        await mongoConnect();
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`the server is running now at ${PORT} `);
        });
    } catch (error) {
        console.error("can't start the server", error);
    }
};

startServer();
