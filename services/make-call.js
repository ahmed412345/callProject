import signalwire from "../config/signalwire.js";

export async function makeCall() {
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.URL;

    try {
        const response = await signalwire.calls.create({
            to: "+12077087792",
            from: "+12077087792",
            twiml: `
                <Response>
                    <Play loop="1">${BASE_URL}/audio-stream.mp3</Play>
                    <Gather 
                        input="speech" 
                        language="ar-EG" 
                        speechTimeout="0.5" 
                        timeout="10" 
                        actionOnEmptyResult="true" 
                        action="${BASE_URL}/webhooks/speech" 
                        method="POST">
                    </Gather>
                </Response>
            `,
        });
        console.log(response);
        console.log("تم بدء المكالمة بنجاح، رقم المعرف:", response.sid);
        return response;
    } catch (e) {
        console.error("حدث خطأ أثناء الاتصال:", e);
    }
}
