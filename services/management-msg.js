import { getAICallResponse } from "./ask-ai.js";

const firstMsg = {
    role: "assistant",
    content:
        "السلام عليكم يا فندم، مع حضرتك خدمة العملاء، عندنا خصومات على المراوح، تحب تعرف تفاصيل العرض؟",
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

        // TODO: حفظ session.customerData في قاعدة البيانات هنا قبل الحذف

        activeCalls.delete(callId);
    }

    return aiResult;
}
