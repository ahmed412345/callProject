const VOICE_ID = "3d5d62bab7114e10a2380784f1a6449e";

export function getAudioStreamUrl(text) {
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.URL;
    return `${BASE_URL}/webhooks/audio-stream.mp3?text=${encodeURIComponent(text)}`;
}

export async function streamFishAudio(req, res) {
    try {
        const textToSpeak = req.query.text;
        if (!textToSpeak) {
            return res.status(400).send("Text is required");
        }

        const response = await fetch("https://api.fish.audio/v1/tts", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.FISH_API_KEY}`,
                "Content-Type": "application/json",
                model: "s2.1-pro-free",
            },
            body: JSON.stringify({
                text: textToSpeak,
                reference_id: VOICE_ID,
                format: "mp3",
                mp3_bitrate: 128,
                latency: "balanced", // أسرع خيار متاح رسمياً في Fish Audio
            }),
        });

        if (!response.ok) {
            console.error("Fish Audio Error:", await response.text());
            return res.status(500).send("Error generating audio");
        }

        // نفس طريقة ElevenLabs تماماً بدون فرض chunked يدوياً
        res.setHeader("Content-Type", "audio/mpeg");

        const reader = response.body.getReader();
        console.time("speech_time");
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
        }
        console.timeEnd("speech_time");
        res.end();
    } catch (error) {
        console.error("Streaming Error:", error);
        if (!res.headersSent) {
            res.status(500).send("Internal Server Error");
        } else {
            res.end();
        }
    }
}
