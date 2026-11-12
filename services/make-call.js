import vonage from "../config/vonage.js";

export async function makeCall() {
    try {
        const response = await vonage.voice.createOutboundCall({
            to: [
                {
                    type: "phone",
                    number: "201035396140",
                },
            ],
            from: {
                type: "phone",
                number: "12345678901",
            },
            ncco: [
                {
                    action: "stream",
                    streamUrl: [
                        "https://res.cloudinary.com/g9qbcsa1/video/upload/v1794511192/first-msg.mp3",
                    ],
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
                    },
                    // الرابط الذي سيستقبل النص الذي قاله المستخدم
                    eventUrl: [`${process.env.URL}/webhooks/speech`],
                },
            ],
        });
        console.log(response);
        console.log("تم بدء المكالمة بنجاح، رقم المعرف:", response.uuid);
    } catch (e) {
        console.error("حدث خطأ أثناء الاتصال:", e);
    }
}
