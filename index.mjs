// --- 1. Variables and Constants (ටෝකන සහ URL) ---

// ********* මෙහි ඔබගේ සැබෑ ටෝකන ඇතුළත් කර ඇත *********
const BOT_TOKEN = "8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8"; 
const WEBHOOK_SECRET = "ec6bc090856641e9b2aca785d7a34727"; 
// ********************************************************

const TELEGRAM_API = "https://api.telegram.org/bot";

// ⚠️ වැදගත්: මෙය 'Fdown' වැනි සේවාවක API එකක ව්‍යුහයට සමාන උපකල්පිත URL එකකි.
// ඔබ අන්තර්ජාලයෙන් සොයාගන්නා සැබෑ, සක්‍රීය API එක මෙහි ආදේශ කළ යුතුය.
const FB_API_URL = "https://api.some-fb-downloader.com/get_video?url="; 

// --- 2. Telegram API Interaction (Telegram API අන්තර්ක්‍රියා) ---

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

async function sendVideoFromUrl(chat_id, video_url, quality) {
    const url = `${TELEGRAM_API}${BOT_TOKEN}/sendVideo`;
    const payload = {
        chat_id: chat_id,
        video: video_url, 
        caption: `✅ Facebook වීඩියෝව බාගත කරන ලදී! (${quality})`
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
 * ⚠️ මෙම ශ්‍රිතය ඔබගේ නව API එකේ JSON ප්‍රතිචාරයට අනුව සකස් කළ යුතුය.
 */
async function getFbVideoLinks(videoUrl) {
    try {
        const apiResponse = await fetch(`${FB_API_URL}${encodeURIComponent(videoUrl)}`);
        
        if (!apiResponse.ok) {
            console.error(`API response status: ${apiResponse.status}`);
            return null;
        }
        
        const data = await apiResponse.json(); 

        // අපි උපකල්පනය කරන්නේ API ප්‍රතිචාරය පහත ව්‍යුහය දරන බවයි:
        // { "status": "ok", "links": [ { "quality": "HD", "url": "..." }, { "quality": "SD", "url": "..." } ] }
        if (data && data.status === 'ok' && Array.isArray(data.links)) {
            
            // HD සබැඳිය සෙවීම (720p හෝ HD)
            const hdLink = data.links.find(link => link.quality && (link.quality.toUpperCase() === 'HD' || link.quality.includes('720p')) && link.url)?.url;
            // SD සබැඳිය සෙවීම (360p හෝ SD)
            const sdLink = data.links.find(link => link.quality && (link.quality.toUpperCase() === 'SD' || link.quality.includes('360p')) && link.url)?.url;

            return {
                hd: hdLink,
                sd: sdLink
            };
        }
        
        console.error("API response structure unexpected or links not found:", data);
        return null; 

    } catch (error) {
        console.error("Facebook API fetch error:", error);
        return null;
    }
}

// --- 4. Main Handler (ප්‍රධාන Webhook හැසිරවීම) ---

async function handleTelegramWebhook(request) {
    const secret = request.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== WEBHOOK_SECRET) {
        return new Response('Unauthorized', { status: 401 }); 
    }
    
    const update = await request.json();

    if (!update.message || !update.message.text) {
        return new Response('No message text', { status: 200 });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    
    if (text.startsWith('/start') || text.startsWith('/help')) {
        await sendMessage(chatId, "👋 **ආයුබෝවන්!** මම Facebook වීඩියෝ බාගත කරන්නා. මට Facebook වීඩියෝ සබැඳියක් (link) එවන්න.");
        return new Response('Start command handled', { status: 200 });
    }

    const fbUrlMatch = text.match(/https?:\/\/(?:www\.|m\.)?facebook\.com\/\S+/i);
    if (fbUrlMatch) {
        const fbUrl = fbUrlMatch[0];
        await sendMessage(chatId, "⏳ වීඩියෝ සබැඳිය විශ්ලේෂණය කරමින්... කරුණාකර මොහොතක් රැඳී සිටින්න.");
        
        const videoLinks = await getFbVideoLinks(fbUrl);

        if (videoLinks && videoLinks.hd) {
            await sendVideoFromUrl(chatId, videoLinks.hd, 'HD');
        } else if (videoLinks && videoLinks.sd) {
            await sendVideoFromUrl(chatId, videoLinks.sd, 'SD');
        } else {
            await sendMessage(chatId, "❌ වීඩියෝ සබැඳිය ලබා ගැනීමට නොහැකි විය. සබැඳිය නිවැරදි දැයි පරීක්ෂා කරන්න, නැතහොත් Bot ගේ API සේවාව අක්‍රිය විය හැක.");
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

    if (request.method === 'POST') {
        event.respondWith(handleTelegramWebhook(request));
    } 
    else if (url.pathname === '/registerWebhook') {
        event.respondWith(registerWebhook(url.origin));
    }
    else {
        event.respondWith(new Response('Bot is running.', { status: 200 }));
    }
});

async function registerWebhook(workerUrl) {
    const webhookUrl = `${workerUrl}`; 
    const url = `${TELEGRAM_API}${BOT_TOKEN}/setWebhook?url=${webhookUrl}&secret_token=${WEBHOOK_SECRET}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        return new Response(`Error registering webhook: ${error.message}`, { status: 500 });
    }
}
