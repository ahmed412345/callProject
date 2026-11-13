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

    // ارسال الرساله الحاليه والتاريخ للموديل
    const aiResult = await getAICallResponse(userMessage, session.history);

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
            `🧹 انتهت المكالمة [${callId}]. بيانات العميل النهائية:`,
            session.customerData,
        );

        try {
            const stringData = JSON.stringify(session.customerData);

            const response = await fetch(
                "https://hero430.app.n8n.cloud/webhook/data",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: stringData,
                },
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log("Success:", result);
        } catch (error) {
            console.error("Error sending data to n8n:", error);
        }

        // TODO: حفظ session.customerData في قاعدة البيانات هنا قبل الحذف

        https: activeCalls.delete(callId);
    }

    return aiResult;
}
