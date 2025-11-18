/**
 * src/index.js
 * Cloudflare Worker Telegram Bot Code (Facebook Video Downloader via fdown.net scraping)
 *
 * සටහන: Bot Token එක Cloudflare Worker Settings වලදී Environment Variable එකක් ලෙස BOT_TOKEN නමින් ලබා දී තිබිය යුතුය.
 */

export default {
    // Cloudflare Worker විසින් එන HTTP ඉල්ලීම් හසුරුවන ප්‍රධාන fetch function එක
    async fetch(request, env, ctx) {
        // GET requests නොසලකා හැරීම
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }

        const BOT_TOKEN = env.BOT_TOKEN;
        const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

        try {
            const update = await request.json();
            const message = update.message;

            if (message && message.text) {
                const chatId = message.chat.id;
                const text = message.text.trim();
                const messageId = message.message_id;
                
                // /start command එක හසුරුවීම
                if (text === '/start') {
                    console.log(`[START] Chat ID: ${chatId}`);
                    await this.sendMessage(telegramApi, chatId, '👋 සුභ දවසක්! මට Facebook වීඩියෝ Link එකක් එවන්න. එවිට මම එය download කර දෙන්නම්.', messageId);
                    return new Response('OK', { status: 200 });
                }

                // 1. Link එකක් දැයි පරීක්ෂා කිරීම
                const isLink = /^https?:\/\//i.test(text);
                
                if (isLink) {
                    console.log(`[LINK] Received link from ${chatId}: ${text}`);
                    await this.sendMessage(telegramApi, chatId, '⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න.', messageId);
                    
                    try {
                        // 2. fdown.net වෙත POST ඉල්ලීම යැවීම
                        const fdownUrl = "https://fdown.net/download.php";
                        
                        const formData = new URLSearchParams();
                        formData.append('URLz', text); 

                        const fdownResponse = await fetch(fdownUrl, {
                            method: 'POST',
                            headers: {
                                // Spam ලෙස නොසැලකීම සඳහා අවශ්‍ය Headers
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Referer': 'https://fdown.net/', 
                            },
                            body: formData.toString(),
                            // **********************************
                            // !!! Redirection Fix !!!
                            // **********************************
                            redirect: 'follow' // Redirects (302) ස්වයංක්‍රීයව අනුගමනය කිරීම
                        });

                        const resultHtml = await fdownResponse.text();

                        // 3. HTML ප්‍රතිචාරයෙන් HD සහ Normal Video Links Scrap කිරීම
                        
                        let videoUrl = null;

                        // HD Link එක සොයන ලිහිල් කළ RegEx එක:
                        const hdLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*class=["']?[^"']*btn-success[^"']*[rR]el=["']?nofollow["']?[^>]*>Download Video in HD Quality<\/a>/i;
                        let match = resultHtml.match(hdLinkRegex);

                        if (match && match[1]) {
                            videoUrl = match[1]; // HD Link එක
                        } else {
                            // Normal Quality Link එකක් සොයන ලිහිල් කළ RegEx එක: (Fallback)
                            const normalLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*class=["']?[^"']*btn-default[^"']*[rR]el=["']?nofollow["']?[^>]*>Download Video in Normal Quality<\/a>/i;
                            match = resultHtml.match(normalLinkRegex);

                            if (match && match[1]) {
                                videoUrl = match[1]; // Normal Link එක
                            }
                        }

                        if (videoUrl) {
                            const quality = hdLinkRegex.test(resultHtml) ? "HD" : "Normal";
                            console.log(`[SUCCESS] Video Link found (${quality}): ${videoUrl}`);
                            
                            // 4. Telegram වෙත වීඩියෝව යැවීම (sendVideo)
                            await this.sendVideo(telegramApi, chatId, videoUrl, `මෙන්න ඔබගේ වීඩියෝව! ${quality} Quality එකෙන් download කර ඇත.`, messageId);
                            
                        } else {
                            // Link එකක් සොයා ගැනීමට නොහැකි නම්, Log එකට HTML ප්‍රතිචාරය යවමු.
                            console.error(`[SCRAPING FAILED] No HD/Normal link found for ${text}. Full HTML Response: ${resultHtml}`);
                            
                            await this.sendMessage(telegramApi, chatId, '⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය. වීඩියෝව Private (පුද්ගලික) විය හැක.', messageId);
                        }
                        
                    } catch (fdownError) {
                        console.error("fdown.net/Scraping Error:", fdownError.message, fdownError);
                        await this.sendMessage(telegramApi, chatId, '❌ වීඩියෝව ලබා ගැනීමේදී තාක්ෂණික දෝෂයක් ඇති විය.', messageId);
                    }
                    
                } else {
                    console.log(`[INVALID] Invalid message type from ${chatId}: ${text}`);
                    await this.sendMessage(telegramApi, chatId, '❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න.', messageId);
                }
            }

            return new Response('OK', { status: 200 });

        } catch (e) {
            console.error("[GLOBAL ERROR] Unhandled Error:", e.message, e);
            return new Response('OK', { status: 200 }); 
        }
    },

    // Telegram API වෙත Message යැවීම සඳහා වන සහායක function
    async sendMessage(api, chatId, text, replyToMessageId) {
        try {
            await fetch(`${api}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text,
                    parse_mode: 'HTML',
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                }),
            });
        } catch (e) {
            console.error("[TELEGRAM ERROR] Cannot send message:", e.message);
        }
    },

    // Telegram API වෙත Video යැවීම සඳහා වන සහායක function
    async sendVideo(api, chatId, videoUrl, caption, replyToMessageId) {
        try {
            await fetch(`${api}/sendVideo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    video: videoUrl,
                    caption: caption,
                    parse_mode: 'HTML',
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                }),
            });
        } catch (e) {
            console.error("[TELEGRAM ERROR] Cannot send video:", e.message);
        }
    }
};
