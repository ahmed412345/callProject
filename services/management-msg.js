import { getAICallResponse } from "./ask-ai.js";

const firstMsg = {
    role: "assistant",
    content: JSON.stringify({
        customerName: null,
        customerAddress: null,
        reply: "السلام عليكم، مع حضرتك أحمد من خدمة العملاء. عندنا بوكس هدايا مميز ، بسعر 350 جنيه شامل التوصيل. تحب تعرف تفاصيل أكتر؟",
        isCallEnded: false,
        intent: "INQUIRY",
    }),
};

const activeCalls = new Map();
export async function managementMsg(callId, userMessage) {
    if (!activeCalls.has(callId)) {
        activeCalls.set(callId, {
            history: [firstMsg],
            customerData: { name: null, address: null },
            createdAt: Date.now(),
        });
    }
    //بنجيب بيانات الرحله الحاليه
    const session = activeCalls.get(callId);

    console.time("model_time");
    // ارسال الرساله الحاليه والتاريخ للموديل
    const aiResult = await getAICallResponse(userMessage, session.history);
    console.timeEnd("model_time");
    //لو بيانات العميل اتحددت نضيفها
    if (aiResult.customerName)
        session.customerData.name = aiResult.customerName;
    if (aiResult.customerAddress)
        session.customerData.address = aiResult.customerAddress;

    // 4. حفظ الرسالة والرد في تاريخ الجلسة
    session.history.push({ role: "user", content: userMessage });
    session.history.push({
        role: "assistant",
        content: JSON.stringify(aiResult),
    });

    if (aiResult.isCallEnded) {
        console.log(
            `🧹 انتهت المكالمة [${callId}] (${aiResult.intent}). بيانات العميل:`,
            session.customerData,
        );

        // 1. نرسل الداتا لـ n8n فقط لو العميل أكد الطلب وبياناته كاملة
        if (
            aiResult.intent === "CONFIRMED" &&
            session.customerData?.name &&
            session.customerData?.address
        ) {
            const stringData = JSON.stringify({
                callId,
                ...session.customerData,
                status: "CONFIRMED",
            });

            // بدون await عشان منأخرش رد الوداع على العميل في المكالمة
            fetch("https://hero430.app.n8n.cloud/webhook/data", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: stringData,
                signal: AbortSignal.timeout(5000),
            })
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error(
                            `HTTP error! status: ${response.status}`,
                        );
                    }
                    const result = await response.json();
                    console.log("✅ تم إرسال الطلب لـ n8n بنجاح:", result);
                })
                .catch((error) => {
                    console.error("❌ فشل إرسال الطلب لـ n8n:", error.message);
                });
        } else {
            console.log(
                `🚫 لم يتم إرسال طلب لـ n8n (الحالة: ${aiResult.intent})`,
            );
        }

        // 2. مسح الجلسة من الرامات في جميع الحالات (تأكيد أو رفض)
        activeCalls.delete(callId);
    }

    return aiResult;
}
