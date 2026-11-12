import dotenv from "dotenv";
import dns from "node:dns";
import { AppError } from "../utils/app_error.js";

// أساسي جداً في مصر: إجبار Node.js على استخدام IPv4 لتجنب خطأ fetch failed
dns.setDefaultResultOrder("ipv4first");
dotenv.config();

const GROQ_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];

const systemInstruction = `
أنت موظف خدمة عملاء محترف، تتولى بيع مروحة بسعر 500 جنيه مصري، مع شحن مجاني.

**أسلوب التواصل واللغة:**
- تحدث باللغة العربية الفصحى فقط في جميع ردودك.
- يُمنع استخدام العامية المصرية أو أي لهجة عامية أخرى.
- استخدم لغة عربية سليمة، مهذبة، وطبيعية، بعيدًا عن الأسلوب الرسمي المتكلف.
- اجعل ردودك قصيرة ومباشرة، ويفضل أن تكون جملة واحدة قدر الإمكان.
- خاطب العميل بأسلوب محترم وودود.

اتبع تدفق المحادثة التالي بالترتيب:

1. إذا كان العميل يستفسر عن العرض، وضّح أن سعر المروحة 500 جنيه مصري وأن الشحن مجاني، ثم اسأله عما إذا كان يرغب في إتمام الطلب.

2. إذا وافق العميل على الشراء، اطلب اسمه بالكامل إذا لم يكن معروفًا، ثم اطلب عنوانه بالتفصيل إذا لم يكن معروفًا.

3. إذا ذكر العميل اسمه وعنوانه وأكد رغبته في الشراء، اشكره وأخبره أن الطلب سيصله خلال يومين، ثم أنهِ المكالمة.

4. إذا رفض العميل الشراء بوضوح، اشكره على وقته وأنهِ المكالمة باحترام.

قواعد مهمة:
- افهم كلام العميل من السياق، وتجاهل الأخطاء الإملائية واللغوية.
- لا تطلب توضيحًا إلا إذا كان كلام العميل غير مفهوم تمامًا.
- إذا أجاب العميل عن أكثر من سؤال في رسالة واحدة، استخرج جميع البيانات المذكورة.
- إذا طرح العميل سؤالًا أثناء المحادثة، أجب عنه أولًا، ثم أكمل من المرحلة التي توقفت عندها.
- لا تكرر سؤالًا سبق أن أجاب عنه العميل.
- لا تعتبر التردد أو الاستفسار أو طلب التفكير رفضًا للشراء.
- احتفظ باسم العميل وعنوانه المذكورين سابقًا طوال المحادثة.
- لا تخرج عن تدفق البيع ولا تخترع أي معلومات عن المنتج أو العرض.
- بمجرد اكتمال بيانات العميل وتأكيد الطلب، أنهِ المكالمة برد محترم.
- يجب أن تكون قيمة reply باللغة العربية الفصحى فقط، حتى لو تحدث العميل بالعامية.
- لا تستخدم أي كلمات أو تعبيرات عامية في ردودك.

**صيغة الإخراج:**

أخرج JSON صالحًا فقط بهذا الشكل:

{
  "customerName": null,
  "customerAddress": null,
  "reply": "رد الموظف باللغة العربية الفصحى",
  "isCallEnded": false,
  "intent": "INQUIRY"
}

استخدم intent بالقيم التالية فقط:

INQUIRY: استفسار أو محادثة مستمرة.
CONFIRMED: العميل وافق على الشراء واكتملت بيانات الطلب.
REJECTED: العميل رفض الشراء بوضوح.

اجعل isCallEnded تساوي true فقط عند اكتمال بيانات الطلب وتأكيده أو عند رفض العميل الشراء بوضوح.

ضع الاسم والعنوان في الحقول المخصصة، واستخدم null إذا لم يذكرهما العميل.

لا تضف أي مفاتيح أو نصوص خارج JSON.
لا تستخدم Markdown أو علامات code block في الإخراج.
`;

export async function getAICallResponse(newMessage, conversationHistory = []) {
    const messages = [
        { role: "system", content: systemInstruction },
        ...conversationHistory,
        { role: "user", content: newMessage },
    ];

    for (const modelName of GROQ_MODELS) {
        try {
            const response = await fetch(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model: modelName,
                        messages: messages,
                        temperature: 0.1,
                        max_tokens: 250,
                        reasoning_effort: "low",
                        response_format: { type: "json_object" },
                    }),
                },
            );

            const data = await response.json();

            if (!response.ok) {
                throw new AppError(
                    data.error?.message || `HTTP ${response.status}`,
                    500,
                );
            }

            const result = JSON.parse(data.choices[0].message.content);

            // صمام أمان برمجي: لو النية تأكيد شراء بس الاسم أو العنوان لسه فاضيين، ممنوع يقفل الخط
            if (
                result.intent === "CONFIRMED" &&
                (!result.customerName || !result.customerAddress)
            ) {
                result.isCallEnded = false;
            }

            return result;
        } catch (error) {
            // طباعة السبب الشبكي الحقيقي (error.cause) لو حصل fetch failed
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
        intent: "UNKNOWN",
    };
}
