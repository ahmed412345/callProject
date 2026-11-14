import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// import mongoConnect from "./config/db_connect.js";
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

// ربط مسار البث الصوتي بالـ
app.get("/webhooks/audio-stream", streamFishAudio);

// دالة مساعدة لتجنب كسر الـ XML إذا احتوى الرابط على علامة &
const escapeXml = (unsafe) =>
    String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

// دالة تقسم الرد الطويل لجمل قصيرة عشان أول جملة تتنطق فوراً
function splitIntoPlayTags(text) {
    if (!text) return "";

    // تقسيم النص عند النقطة أو علامة الاستفهام أو التعجب أو الفاصلة مع الحفاظ على الجمل مفيدة
    const sentences = text
        .split(/(?<=[.؟!،\n])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    // لو النص قصير أصلاً أو جملة واحدة، منقسموش
    const chunks = sentences.length > 0 ? sentences : [text];

    return chunks
        .map((chunk) => {
            // نبدأ توليد كل جملة في الخلفية دلوقتي حالاً بالتوازي!
            preloadAudio(chunk);
            const url = escapeXml(getAudioStreamUrl(chunk));
            return `<Play>${url}</Play>`;
        })
        .join("\n                    ");
}

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
            const retryText = "بعتذر من حضرتك صوتك غير واضح.";
            preloadAudio(retryText); // يجهزها في الخلفية قبل ما Twilio يطلبها
            const retryAudio = escapeXml(getAudioStreamUrl(retryText));

            res.type("text/xml");
            return res.send(`
                <Response>
                    <Play>${retryAudio}</Play>
                    <Gather input="speech" language="ar-EG" speechTimeout="auto" action="${BASE_URL}/webhooks/speech" method="POST" />
                </Response>
            `);
        }

        console.log("User said:", userMessage);

        const aiResult = await managementMsg(callId, userMessage);

        // تقسيم الرد لـ Play tags مع بدء توليد الصوت في الخلفية فوراً
        const playTags = splitIntoPlayTags(aiResult?.reply);

        // 2. في حالة انتهاء المكالمة (تشغيل الرد ثم إغلاق الخط)
        if (aiResult?.isCallEnded) {
            res.type("text/xml");
            return res.send(`
                <Response>
                    ${playTags}
                    <Hangup />
                </Response>
            `);
        }

        // لما نحطها جوه دا معناه لو المستخدم قاطع المتحدث يتوقف
        res.type("text/xml");
        return res.send(`
            <Response>
                <Gather input="speech" language="ar-EG" speechTimeout="auto" action="${BASE_URL}/webhooks/speech" method="POST">
                    ${playTags}
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
        // await mongoConnect();
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`the server is running now at ${PORT} `);
        });
    } catch (error) {
        console.error("can't start the server", error);
    }
};

startServer();
