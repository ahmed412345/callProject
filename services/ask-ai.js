import dotenv from "dotenv";
import dns from "node:dns";
import { AppError } from "../utils/app_error.js";

// أساسي جداً في مصر: إجبار Node.js على استخدام IPv4 لتجنب خطأ fetch failed
dns.setDefaultResultOrder("ipv4first");
dotenv.config();

const GROQ_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];

const systemInstruction = `
أنت "أحمد"، موظف مبيعات مصري في مكالمة هاتفية لبيع "بوكس هدايا جاهز".

[معلومات المنتج الثابتة]
- المحتويات: دبدوب صغير، خاتم، علبة شوكولاتة، شمعة معطرة، كارت تهنئة، بعلبة بتغليف أنيق.
- السعر: 350 جنيه مصري (شامل شحن مجاني).
- التوصيل: خلال يومين من تأكيد الطلب.
- قيود صارمة: المحتويات ثابتة لا تتغير، لا توجد خصومات، ولا توجد تفاصيل إضافية عن حجم الدبدوب أو نوع الشوكولاتة أو كتابة رسائل على الكارت (قل أن هذه التفاصيل غير متاحة حالياً).
- النص قادم من محرك تحويل صوت لنص (STT) مليء بالأخطاء السمعية (مثل سماع 'تفاصيل أكتر' كـ 'قصيره على النت')، خمن الكلمة الأقرب لسياق بيع البوكس ولا تستخدم أي أدوات بحث أبداً"

[أسلوب الكلام]
- لهجة مصرية طبيعية، بسيطة، مهذبة، ومختصرة جداً (مناسبة لمكالمة صوتية بدون إيموجي أو فصحى).
- لا تكرر الترحيب أو تعريف نفسك إذا كانت المحادثة جارية بالفعل.
- إذا كان سجل المحادثة فارغاً، رحب بالعميل واعرض البوكس وسعره باختصار.
-- قاعدة ذهبية للصوت: لا تتجاوز في ردك 12 إلى 15 كلمة كحد أقصى في المرة الواحدة!
- إذا سأل العميل "عبارة عن إيه؟"، اذكر المحتويات فقط باختصار شديد بدون ذكر السعر والتوصيل إلا إذا سأل عنهم، لكي يكون الصوت سريعاً.

[خطوات البيع وإدارة الحالة]
1. أجب عن الاستفسارات مباشرة وبإيجاز دون سرد كل المحتويات إلا عند السؤال عنها.
2. إذا أبدى العميل اهتماماً، اسأله لتأكيد رغبته في الطلب.
3. بعد موافقته فقط، اطلب "الاسم بالكامل" ثم "العنوان بالتفصيل" (أو الناقص منهما).
4. احتفظ دائماً بالاسم والعنوان من الرسائل السابقة ولا تطلب تكرارهما أبداً.
5. عند اكتمال (الموافقة الصريحة + الاسم + العنوان): اشكره، أكد التوصيل خلال يومين مجاناً، وأنهِ المكالمة.
6. عند الرفض الصريح: اشكره باحترام دون إلحاح وأنهِ المكالمة (التردد أو طلب وقت للتفكير ليس رفضاً).

[صيغة الإخراج الإجبارية - JSON فقط]
أخرج كائن JSON صالح فقط يطابق هذا الهيكل تماماً:
{
  "reply": "ردك باللهجة المصرية",
  "intent": "INQUIRY | CONFIRMED | REJECTED",
  "customerName": "اسم العميل أو null",
  "customerAddress": "عنوان العميل أو null",
  "isCallEnded": false
}
  - customerAddress: استخرج العنوان النظيف فقط وصحح أخطاء تحويل الصوت لنص الواضحة (مثلاً إذا وصل النص "عن والي دمياط" أو "عنواني دمياط"، سجل في الحقل "دمياط" فقط بدون كلمة عنواني أو عن والي).

قواعد الحقول:
- intent: ضع "CONFIRMED" فقط عند توفر (موافقة + اسم + عنوان). ضع "REJECTED" عند الرفض الصريح. ضع "INQUIRY" في أي حالة أخرى حتى لو وافق والبيانات ناقصة.
- isCallEnded: يكون true فقط إذا كان intent يساوي CONFIRMED أو REJECTED، وإلا false.
`.trim();

export async function getAICallResponse(newMessage, conversationHistory = []) {
    const messages = [
        { role: "system", content: systemInstruction },
        ...conversationHistory,
        { role: "user", content: newMessage },
    ];

    for (const modelName of GROQ_MODELS) {
        try {
            const payload = {
                model: modelName,
                messages: messages,
                temperature: 0.1,
                max_completion_tokens: 250,
                response_format: { type: "json_object" },
                reasoning_effort: "low",
            };

            const response = await fetch(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    },
                    body: JSON.stringify(payload),
                    // صمام أمان: لو الموديل مردش خلال 4 ثواني يقطع ويحول للبديل فوراً
                    signal: AbortSignal.timeout(4000),
                },
            );

            const data = await response.json();

            if (!response.ok) {
                throw new AppError(
                    data.error?.message || `HTTP ${response.status}`,
                    500,
                );
            }

            const content = data.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error("Empty content returned from model");
            }

            const result = JSON.parse(content);

            if (
                result.intent === "CONFIRMED" &&
                (!result.customerName || !result.customerAddress)
            ) {
                result.isCallEnded = false;
            }

            console.log(`✅ رد الذكاء الاصطناعي (${modelName}):`, result.reply);
            return result;
        } catch (error) {
            const reason = error.cause
                ? `${error.message} (${error.cause.code || error.cause.message})`
                : error.message;
            console.warn(
                `⚠️ فشل [${modelName}] [${reason}]، جاري التحويل للبديل...`,
            );
        }
    }

    return {
        customerName: null,
        customerAddress: null,
        reply: "عذرًا، الصوت غير واضح، هل يمكنك إعادة ما قلته من فضلك؟",
        isCallEnded: false,
        intent: "INQUIRY",
    };
}
//داله علشان تسرع اول عمليه اتصال
export function warmupGroqConnection() {
    fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
            model: GROQ_MODELS[0],
            messages: [{ role: "system", content: systemInstruction }],
            max_completion_tokens: 1, // توكن واحد بس لتسخين الكاش والاتصال
        }),
        signal: AbortSignal.timeout(3000),
    })
        .then(() => console.log("🔥 اتصال وكاش Groq جاهزين للمكالمة"))
        .catch(() => {}); // تجاهل أي خطأ في الخلفية عشان ميوقفش السيرفر
}

async function test() {
    
    let h = [];
    console.time("test");
    const aiRes = await getAICallResponse("اهلا", h);
    console.timeEnd("test");
    h.push[
        ({ role: "user", content: "اهلا" },
        {
            role: "assistant",
            content: JSON.stringify({
                customerName: null,
                customerAddress: null,
                reply: aiRes,
                isCallEnded: false,
                intent: "INQUIRY",
            }),
        })
    ];
    console.time("test2");
    await getAICallResponse("ايه العرض", h);
    console.timeEnd("test2");
}
