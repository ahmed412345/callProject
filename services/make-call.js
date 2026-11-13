import vonage from "../config/vonage.js";

export async function makeCall() {
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.URL;
    try {
        const response = await vonage.voice.createOutboundCall({
            to: [
                {
                    type: "phone",
                    number: "20108034926",
                },
            ],
            from: {
                type: "phone",
                number: "12345678901",
            },
            ncco: [
                {
                    action: "stream",
                    streamUrl: [`${BASE_URL}/audio-stream.mp3`],
                    level: 0,
                    loop: 1,
                    bargeIn: false,
                },
                {
                    action: "input",
                    type: ["speech"],
                    speech: {
                        language: "ar-EG", // تحديد اللهجة المصرية (أو ar-SA للسعودية) لدقة أعلى
                        endOnSilence: 2, // يتوقف عن الاستماع بعد ثانيتين من صمت المتصل
                        maxDuration: 10, // أقصى مدة للاستماع (بالثواني)
                        bargeIn: false,
                    },
                    // الرابط الذي سيستقبل النص الذي قاله المستخدم
                    eventUrl: [`${BASE_URL}/webhooks/speech`],
                },
            ],
        });
        console.log(response);
        console.log("تم بدء المكالمة بنجاح، رقم المعرف:", response.uuid);
    } catch (e) {
        console.error("حدث خطأ أثناء الاتصال:", e);
    }
}
