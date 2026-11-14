import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

const VOICE_ID = "3d5d62bab7114e10a2380784f1a6449e";

// كاش مؤقت في الرامات لحفظ طلبات الصوت اللي بدأناها مسبقاً
const audioCache = new Map();

// دالة مساعدة تطلب الصوت من Fish Audio وترجعه كـ Buffer جاهز
async function fetchAudioBuffer(text) {
    const response = await fetch("https://api.fish.audio/v1/tts", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.FISH_API_KEY}`,
            "Content-Type": "application/json",
            model: "s2.1-pro-free",
        },
        body: JSON.stringify({
            text: text,
            reference_id: VOICE_ID,
            format: "mp3",
            mp3_bitrate: 64,
            chunk_length: 100,
            latency: "balanced",
        }),
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

// دالة بتبدأ توليد الصوت في الخلفية قبل ما Twilio يطلبه أصلاً
export function preloadAudio(text) {
    if (!text || audioCache.has(text)) return;

    const promise = fetchAudioBuffer(text).catch((err) => {
        console.error("Preload Fish Audio Error:", err);
        audioCache.delete(text);
        return null;
    });

    audioCache.set(text, promise);

    // مسح الصوت من الرامات بعد 30 ثانية عشان مياخدش مساحة
    setTimeout(() => audioCache.delete(text), 30000);
}

export function getAudioStreamUrl(text) {
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.URL;
    return `${BASE_URL}/webhooks/audio-stream?text=${encodeURIComponent(text)}&.mp3`;
}

export async function streamFishAudio(req, res) {
    try {
        const textToSpeak = req.query.text;
        if (!textToSpeak) {
            return res.status(400).send("Text is required");
        }

        // لو الصوت بدأنا توليده مسبقاً هناخده فوراً، لو لأ هنطلبه دلوقتي
        let audioBuffer;
        if (audioCache.has(textToSpeak)) {
            audioBuffer = await audioCache.get(textToSpeak);
            audioCache.delete(textToSpeak); // نمسحه أول ما نستخدمه
        }

        if (!audioBuffer) {
            audioBuffer = await fetchAudioBuffer(textToSpeak);
        }

        // إرسال Content-Length بيخلي Twilio يشغل الصوت فوراً بدون انتظار تجميع البفر
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Length", audioBuffer.length);
        return res.send(audioBuffer);
    } catch (error) {
        console.error("Streaming Error:", error);
        if (!res.headersSent) {
            res.status(500).send("Internal Server Error");
        } else {
            res.end();
        }
    }
}
