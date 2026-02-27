require("dotenv").config();
const { Telegraf, session, Markup } = require("telegraf");
const axios = require("axios");
const fs = require("fs");

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

const STYLE_PATH = "./style.txt";
const getStyle = () =>
  fs.existsSync(STYLE_PATH) ? fs.readFileSync(STYLE_PATH, "utf8").trim() : "";

const SYSTEM_PROMPT = `В НАЧАЛЕ КАЖДОГО ОТВЕТА ПИШИ "[CLAUDE 4.6]". Ты — персональный AI-копирайтер, пишущий от лица Натальи Павловой (@belkapavlova).

ТВОЙ ГОЛОС:
- Искренность и рефлексия. Анализируй, как события тебя изменили ("Я стала другой", "Впитала новые смыслы").
- Уважение к наставникам и героям. Называй статусных людей по имени-отчеству.
- Энергия Белки. Деятельная, быстрая, постоянно в движении.
- Смесь сленга и смыслов: "запилить кружочек" рядом с "вселенскими смыслами бытия".

ФИРМЕННЫЙ СЛОВАРЬ:
- "Для истории" — важное событие
- "Впитать смыслы", "глубина", "космос", "нереально", "до мурашек"
- "Запилить кружочек", "внутренняя кухня", "родная душа"

ПРАВИЛА ОФОРМЛЕНИЯ:
1. Эмодзи в конце мыслей: ❤️ 🐿️ 🇷🇺 ✨ 🚛 🫡 💪🏻
2. Короткие абзацы по 1-2 предложения. Много воздуха.
3. ВАЖНО: Сохраняй ВСЕ мысли и детали из входящего текста. Не сокращай, не обрезай. Пиши столько, сколько нужно, чтобы ни одна идея не потерялась. Максимум — 4000 символов.
4. Завершение: вопрос или призыв к обсуждению.`;

const callAI = async (history, extraInstruction = "", temp = 0.75) => {
  const style = getStyle();
  const system =
    SYSTEM_PROMPT +
    (style ? "\n\nМОЙ ЛИЧНЫЙ СТИЛЬ:\n" + style : "") +
    (extraInstruction ? "\n\n" + extraInstruction : "");

  const messages = [{ role: "system", content: system }, ...history.slice(-8)];

  const res = await axios.post(
    "https://polza.ai/api/v1/chat/completions",
    {
      model: "anthropic/claude-sonnet-4.6",
      messages,
      provider: { allow_fallbacks: true },
      temperature: temp,
      max_tokens: 2000,
    },
    {
      headers: {
        Authorization: "Bearer " + process.env.POLZA_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );
  return res.data.choices[0].message.content;
};

const postButtons = Markup.inlineKeyboard([
  [Markup.button.callback("🔄 Ещё вариант", "another_variant")],
  [Markup.button.callback("📝 Проверить грамотность", "check_grammar")],
]);

const mainMenu = Markup.keyboard([
  ["✍️ Новый пост", "📝 Проверить грамотность"],
]).resize();

bot.start((ctx) => {
  ctx.session = { history: [], mode: null };
  ctx.reply("🐿️ Привет! Я твой личный копирайтер в стиле Белки.\n\nВыбери действие:", mainMenu);
});

bot.hears("✍️ Новый пост", (ctx) => {
  ctx.session = { history: [], mode: "write" };
  ctx.reply("🆕 Начинаем новый пост!\nПиши тему или набросок — сохраню все детали 👇", mainMenu);
});

bot.hears("📝 Проверить грамотность", (ctx) => {
  ctx.session = { history: [], mode: "check" };
  ctx.reply("Пришли текст — исправлю ошибки, сохраню стиль.", mainMenu);
});

bot.action("another_variant", async (ctx) => {
  await ctx.answerCbQuery("Генерирую другой вариант...");
  if (!ctx.session) ctx.session = { history: [], mode: "write" };
  ctx.session.history.push({ role: "user", content: "Напиши ещё один вариант этого поста. Другой подход, та же тема и стиль. Сохрани все детали." });
  ctx.sendChatAction("typing");
  try {
    const reply = await callAI(ctx.session.history, "", 0.9);
    ctx.session.history.push({ role: "assistant", content: reply });
    await ctx.reply(reply, postButtons);
  } catch (e) {
    ctx.reply("Ошибка: " + (e.response?.data?.error?.message || e.message));
  }
});

bot.action("check_grammar", async (ctx) => {
  await ctx.answerCbQuery("Проверяю грамотность...");
  if (!ctx.session?.history?.length) return;
  const lastPost = ctx.session.history.filter((m) => m.role === "assistant").pop();
  if (!lastPost) return;
  ctx.sendChatAction("typing");
  try {
    const reply = await callAI(
      [{ role: "user", content: lastPost.content }],
      "Проверь текст на орфографию, пунктуацию и стилистику. Сохрани авторский голос. Покажи исправленный текст, затем кратко список правок.",
      0.3
    );
    await ctx.reply(reply);
  } catch (e) {
    ctx.reply("Ошибка: " + (e.response?.data?.error?.message || e.message));
  }
});

bot.on("text", async (ctx) => {
  if (!ctx.session) ctx.session = { history: [], mode: null };
  const text = ctx.message.text;

  if (!ctx.session.mode) return ctx.reply("Выбери действие:", mainMenu);

  ctx.session.history.push({ role: "user", content: text });
  ctx.sendChatAction("typing");

  try {
    let reply;
    if (ctx.session.mode === "check") {
      reply = await callAI(
        ctx.session.history,
        "Проверь текст на орфографию, пунктуацию и стилистику. Сохрани авторский голос. Покажи исправленный вариант, затем кратко список правок.",
        0.3
      );
      ctx.session.mode = null;
      ctx.session.history.push({ role: "assistant", content: reply });
      await ctx.reply(reply, mainMenu);
    } else {
      reply = await callAI(ctx.session.history, "", 0.75);
      ctx.session.history.push({ role: "assistant", content: reply });
      await ctx.reply(reply, postButtons);
    }
  } catch (e) {
    console.error(e.response?.data || e.message);
    ctx.reply("Ошибка API: " + (e.response?.data?.error?.message || e.message), mainMenu);
  }
});


// --- ГОЛОСОВЫЕ СООБЩЕНИЯ (Whisper через Polza.ai) ---
const FormData = require("form-data");
const fetch = require("node-fetch");

bot.on("voice", async (ctx) => {
  if (!ctx.session) ctx.session = { history: [], mode: null };

  ctx.sendChatAction("typing");

  try {
    // 1. Получаем ссылку на файл от Telegram
    const fileId = ctx.message.voice.file_id;
    const fileInfo = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;

    // 2. Скачиваем аудиофайл
    const audioResponse = await fetch(fileUrl);
    const audioBuffer = await audioResponse.buffer();

    // 3. Отправляем в Whisper через Polza.ai
    const form = new FormData();
    form.append("file", audioBuffer, { filename: "voice.ogg", contentType: "audio/ogg" });
    form.append("model", "openai/whisper-1");
    form.append("language", "ru");

    const whisperResponse = await fetch("https://polza.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.POLZA_API_KEY,
        ...form.getHeaders(),
      },
      body: form,
    });

    const whisperData = await whisperResponse.json();

    if (!whisperData.text) {
      return ctx.reply("Не смог расшифровать аудио. Попробуй ещё раз или напиши текстом.");
    }

    const transcribed = whisperData.text;
    ctx.sendChatAction("typing");

    // Сразу используем расшифровку для поста (без промежуточного сообщения)
    ctx.session.mode = ctx.session.mode || "write";
    ctx.session.history = ctx.session.history || [];
    ctx.session.history.push({ role: "user", content: transcribed });

    const reply = await callAI(ctx.session.history, "", 0.75);
    ctx.session.history.push({ role: "assistant", content: reply });

    await ctx.reply(reply, postButtons);

  } catch (e) {
    console.error("Ошибка голосового:", e.message);
    ctx.reply("Ошибка обработки голосового: " + e.message);
  }
});
bot.launch().then(() => console.log("Bot started!"));
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

