const VOICE_ID = "N2lVS1w4EtoT3dr4eOWO"; // الـ ID الخاص بالصوت المصري من ElevenLabs

// 1. دالة مساعدة بتجهز رابط البث لـ Vonage
export function getAudioStreamUrl(text) {
    return `${process.env.URL}/webhooks/audio-stream?text=${encodeURIComponent(text)}&.mp3`;
}

// 2. الـ Handler المسؤول عن جلب الصوت من ElevenLabs وبثه للمكالمة
export async function streamElevenLabsAudio(req, res) {
    try {
        const textToSpeak = req.query.text;
        if (!textToSpeak) {
            return res.status(400).send("Text is required");
        }

        const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?output_format=mp3_22050_32`,
            {
                method: "POST",
                headers: {
                    "xi-api-key": process.env.ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    text: textToSpeak,
                    model_id: "eleven_flash_v2_5",
                }),
            },
        );

        if (!response.ok) {
            console.error("ElevenLabs Error:", await response.text());
            return res.status(500).send("Error generating audio");
        }

        res.setHeader("Content-Type", "audio/mpeg");

        // تمرير الصوت كـ Stream مباشر للمكالمة
        const reader = response.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
        res.end();
    } catch (error) {
        console.error("Streaming Error:", error);
        res.status(500).send("Internal Server Error");
    }
}
