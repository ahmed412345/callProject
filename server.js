import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import mongoConnect from "./config/db_connect.js";
import errorMiddleware from "./middleware/error.js";
import { makeCall } from "./services/make-call.js";
import { managementMsg } from "./services/management-msg.js";
import {
    getAudioStreamUrl,
    streamElevenLabsAudio,
} from "./services/elevenlabs.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

//علشان نخلي السيرفر مينامش
app.get("/ping", (req, res) => {
    res.end("pong");
});

app.get("/startcall", makeCall);

// ربط مسار البث الصوتي بالـ Handler المنفصل
app.get("/webhooks/audio-stream", streamElevenLabsAudio);

// مسار المكالمة الأساسي
app.post("/webhooks/speech", async (req, res) => {
    try {
        if (!req.body || typeof req.body !== "object") {
            return res.status(400).json({ error: "you must send body" });
        }

        const callId = req.body.uuid;
        const userMessage = req.body.speech?.results?.[0]?.text?.trim();

        if (!callId) {
            return res.status(400).json({ error: "callId is required" });
        }

        if (!userMessage) {
            return res.json([
                {
                    action: "stream",
                    streamUrl: [
                        getAudioStreamUrl(
                            "عذراً، لم أسمعك بوضوح، هل يمكنك الإعادة؟",
                        ),
                    ],
                },
                {
                    action: "input",
                    type: ["speech"],
                    speech: { language: "ar-EG", endOnSilence: 2 },
                    eventUrl: [
                        "https://wavy-legible-yo-yo.ngrok-free.dev/webhooks/speech",
                    ],
                },
            ]);
        }

        console.log(userMessage);

        const aiResult = await managementMsg(callId, userMessage);

        if (aiResult?.isCallEnded) {
            return res.json([
                {
                    action: "stream",
                    streamUrl: [getAudioStreamUrl(aiResult?.reply)],
                },
            ]);
        }

        res.json([
            {
                action: "stream",
                streamUrl: [getAudioStreamUrl(aiResult?.reply)],
            },
            {
                action: "input",
                type: ["speech"],
                speech: { language: "ar-EG", endOnSilence: 2 },
                eventUrl: [
                    "https://wavy-legible-yo-yo.ngrok-free.dev/webhooks/speech",
                ],
            },
        ]);
    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
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
