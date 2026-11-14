import dns from "node:dns";
import { Readable } from "node:stream";
import { Agent } from "node:undici";

dns.setDefaultResultOrder("ipv4first");

// إبقاء الاتصال مفتوحاً مع Fish Audio لتوفير وقت الـ Handshake في كل جملة
const keepAliveAgent = new Agent({
    keepAliveTimeout: 60000,
    keepAliveMaxTimeout: 60000,
});

const VOICE_ID = "3d5d62bab7114e10a2380784f1a6449e";

export function getAudioStreamUrl(text) {
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.URL;
    return `${BASE_URL}/webhooks/audio-stream?text=${encodeURIComponent(text)}&.mp3`;
}

export async function streamFishAudio(req, res) {
    const abortController = new AbortController();
    req.on("close", () => abortController.abort());

    try {
        const textToSpeak = req.query.text;
        if (!textToSpeak) {
            return res.status(400).send("Text is required");
        }

        const response = await fetch("https://api.fish.audio/v1/tts", {
            method: "POST",
            dispatcher: keepAliveAgent,
            signal: abortController.signal,
            headers: {
                Authorization: `Bearer ${process.env.FISH_API_KEY}`,
                "Content-Type": "application/json",
                model: "s2.1-pro-free",
            },
            body: JSON.stringify({
                text: textToSpeak,
                reference_id: VOICE_ID,
                format: "mp3",
                mp3_bitrate: 128, // رفعه لـ 128 يملأ بفر المشغل في نصف الوقت فيبدأ النطق أسرع
                chunk_length: 100,
                latency: "balanced",
            }),
        });

        if (!response.ok) {
            console.error("Fish Audio Error:", await response.text());
            return res.status(500).send("Error generating audio");
        }

        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("X-Accel-Buffering", "no"); // منع البروكسي من تجميع الصوت قبل إرساله
        res.flushHeaders(); // فتح قناة البث فوراً

        const nodeStream = Readable.fromWeb(response.body);
        nodeStream.on("error", () => res.end());
        nodeStream.pipe(res);
    } catch (error) {
        if (error.name === "AbortError") return res.end();
        console.error("Streaming Error:", error);
        if (!res.headersSent) {
            res.status(500).send("Internal Server Error");
        } else {
            res.end();
        }
    }
}
