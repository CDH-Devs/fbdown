// --- 1. Variables and Constants (ටෝකන සහ URL) ---

// ********* මෙහි ඔබගේ සැබෑ ටෝකන ඇතුළත් කරන්න *********
const BOT_TOKEN = "8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8"; 
const WEBHOOK_SECRET = "ec6bc090856641e9b2aca785d7a34727"; 
// ********************************************************

const TELEGRAM_API = "https://api.telegram.org/bot";

// Facebook වීඩියෝ සබැඳියක් ලබා දෙන තෙවන පාර්ශවීය API එකක්
// සටහන: මෙම API එක ඕනෑම වෙලාවක ක්‍රියා විරහිත විය හැක.
const FB_API_URL = "https://api.example.com/facebook-dl?url="; 

// --- 2. Telegram API Calls (Telegram API ඇමතුම්) ---

/**
 * Telegram Chat එකකට සරල පණිවිඩයක් යවයි.
 */
async function sendMessage(chat_id, text) {
    const url = `${TELEGRAM_API}${BOT_TOKEN}/sendMessage`;
    const payload = {
        chat_id: chat_id,
        text: text,
        parse_mode: 'Markdown'
    };

    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

/**
 * Telegram Chat එකකට වීඩියෝව යවයි (Download Link හරහා).
 */
async function sendVideoFromUrl(chat_id, video_url) {
    const url = `${TELEGRAM_API}${BOT_TOKEN}/sendVideo`;
    const payload = {
        chat_id: chat_id,
        video: video_url, // වීඩියෝ සබැඳිය
        caption: "✅ Facebook වීඩියෝව බාගත කරන ලදී!"
    };

    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

// --- 3. Facebook Video Downloader Logic (වීඩියෝ බාගත කිරීමේ තර්කය) ---

/**
 * Facebook URL එකකින් බාගත කිරීමේ සබැඳි ලබා ගනී.
 */
async function getFbVideoLinks(videoUrl) {
    try {
        // Facebook URL එක API එකට යැවීම
        const apiResponse = await fetch(`${FB_API_URL}${encodeURIComponent(videoUrl)}`);
        
        // API response එක JSON ලෙස කියවීම
        const data = await apiResponse.json(); 

        // API එකෙන් ලැබෙන දත්ත ව්‍යුහය අනුව HD සහ SD සබැඳි ලබා ගැනීම
        // (මෙය ඔබ භාවිතා කරන API එක අනුව වෙනස් වේ)
        if (data.status === 'ok' && data.links) {
            return {
                hd: data.links.find(link => link.quality === 'HD')?.url,
                sd: data.links.find(link => link.quality === 'SD')?.url
            };
        }
        
        return null; // සබැඳි සොයාගත නොහැකි නම්

    } catch (error) {
        console.error("Facebook API error:", error);
        return null;
    }
}

// --- 4. Main Handler (ප්‍රධාන Webhook හැසිරවීම) ---

async function handleTelegramWebhook(request) {
    // 1. Webhook Secret එක තහවුරු කිරීම (Security)
    const secret = request.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== WEBHOOK_SECRET) {
        // ආරක්ෂක හේතූන් මත අවසර නොදීම
        return new Response('Unauthorized', { status: 401 }); 
    }
    
    // 2. Body එකෙන් Telegram Update එක ලබා ගැනීම
    const update = await request.json();

    // 3. පණිවිඩය (message) තිබේදැයි පරීක්ෂා කිරීම
    if (!update.message || !update.message.text) {
        return new Response('No message text', { status: 200 }); // වෙනත් update වර්ග නොසලකා හරින්න
    }

    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    
    // 4. විධානය (Command) පරීක්ෂා කිරීම
    if (text.startsWith('/start')) {
        await sendMessage(chatId, "👋 **ආයුබෝවන්!** මම Facebook වීඩියෝ බාගත කරන්නා. මට Facebook වීඩියෝ සබැඳියක් (link) එවන්න.");
        return new Response('Start command handled', { status: 200 });
    }

    // 5. Facebook URL එකක්දැයි පරීක්ෂා කිරීම
    const fbUrlMatch = text.match(/https?:\/\/(?:www\.|m\.)?facebook\.com\/\S+/i);
    if (fbUrlMatch) {
        const fbUrl = fbUrlMatch[0];
        await sendMessage(chatId, "⏳ වීඩියෝ සබැඳිය විශ්ලේෂණය කරමින්... කරුණාකර මොහොතක් රැඳී සිටින්න.");
        
        const videoLinks = await getFbVideoLinks(fbUrl);

        if (videoLinks && videoLinks.hd) {
            // HD සබැඳිය භාවිතයෙන් Telegram වෙත වීඩියෝව යැවීම
            await sendVideoFromUrl(chatId, videoLinks.hd);
        } else if (videoLinks && videoLinks.sd) {
             // HD නොමැති නම් SD සබැඳිය භාවිතයෙන් යැවීම
            await sendVideoFromUrl(chatId, videoLinks.sd);
        } else {
            await sendMessage(chatId, "❌ වීඩියෝ සබැඳිය ලබා ගැනීමට නොහැකි විය. සබැඳිය නිවැරදි දැයි පරීක්ෂා කරන්න.");
        }
        
    } else {
        await sendMessage(chatId, "💡 කරුණාකර වලංගු Facebook වීඩියෝ සබැඳියක් පමණක් එවන්න.");
    }

    return new Response('Message handled', { status: 200 });
}

// --- 5. Cloudflare Worker Fetch Listener (Workers ප්‍රධාන පිවිසුම) ---

addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // Telegram Webhook ඉල්ලීම් පමණක් හැසිරවීම
    if (request.method === 'POST') {
        event.respondWith(handleTelegramWebhook(request));
    } 
    // Webhook සකස් කිරීමට (Optional)
    else if (url.pathname === '/registerWebhook') {
        event.respondWith(registerWebhook(url.origin));
    }
    else {
        event.respondWith(new Response('Bot is running.', { status: 200 }));
    }
});

/**
 * Webhook එක Telegram හි සකස් කිරීමට උදව් කරයි.
 * මෙය ඔබගේ Worker URL එකට /registerWebhook එකතු කර බ්‍රවුසරයේ විවෘත කිරීමෙන් සිදු කළ හැක.
 */
async function registerWebhook(workerUrl) {
    const webhookUrl = `${workerUrl}`; // worker URL එක Webhook එක ලෙස
    const url = `${TELEGRAM_API}${BOT_TOKEN}/setWebhook?url=${webhookUrl}&secret_token=${WEBHOOK_SECRET}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        return new Response(`Error registering webhook: ${error.message}`, { status: 500 });
    }
}
