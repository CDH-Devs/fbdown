/**
 * src/index.js
 * Cloudflare Worker Telegram Bot Code (Facebook Video Downloader via fdown.net scraping)
 * * අවසන් නිවැරදි කිරීම්:
 * 1. fdown.net වෙත POST ඉල්ලීම සඳහා redirect: 'follow' යෙදීම.
 * 2. HD/Normal Quality Links නිවැරදි RegEx මඟින් Scrap කිරීම.
 * 3. Link Expiry ගැටලුව මඟහරවා Link එක Stream කරමින් Telegram වෙත යැවීම.
 */

export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }

        // Environment Variables (BOT_TOKEN) භාවිතා කරන්න
        const BOT_TOKEN = env.BOT_TOKEN;
        const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

        try {
            const update = await request.json();
            const message = update.message;

            if (message && message.text) {
                const chatId = message.chat.id;
                const text = message.text.trim();
                const messageId = message.message_id;
                
                if (text === '/start') {
                    console.log(`[START] Chat ID: ${chatId}`);
                    await this.sendMessage(telegramApi, chatId, '👋 සුභ දවසක්! මට Facebook වීඩියෝ Link එකක් එවන්න. එවිට මම එය download කර දෙන්නම්.', messageId);
                    return new Response('OK', { status: 200 });
                }

                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                
                if (isLink) {
                    console.log(`[LINK] Received link from ${chatId}: ${text}`);
                    await this.sendMessage(telegramApi, chatId, '⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න.', messageId);
                    
                    try {
                        const fdownUrl = "https://fdown.net/download.php";
                        
                        const formData = new URLSearchParams();
                        formData.append('URLz', text); 

                        // 1. fdown.net වෙත POST ඉල්ලීම යැවීම (redirect: 'follow' වැදගත්)
                        const fdownResponse = await fetch(fdownUrl, {
                            method: 'POST',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Referer': 'https://fdown.net/', 
                            },
                            body: formData.toString(),
                            redirect: 'follow' 
                        });

                        const resultHtml = await fdownResponse.text();

                        // 2. HTML ප්‍රතිචාරයෙන් HD සහ Normal Video Links Scrap කිරීම
                        let videoUrl = null;

                        const hdLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>.*Download Video in HD Quality.*<\/a>/i;
                        let match = resultHtml.match(hdLinkRegex);

                        if (match && match[1]) {
                            videoUrl = match[1]; 
                        } else {
                            const normalLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>.*Download Video in Normal Quality.*<\/a>/i;
                            match = resultHtml.match(normalLinkRegex);

                            if (match && match[1]) {
                                videoUrl = match[1]; 
                            }
                        }

                        if (videoUrl) {
                            // ** URL Clean up කිරීම **
                            let cleanedUrl = videoUrl.replace(/&amp;/g, '&');
                            cleanedUrl = cleanedUrl.replace(/&dl=[01]/, ''); 
                            
                            try {
                                cleanedUrl = decodeURIComponent(cleanedUrl);
                            } catch (e) {
                                console.warn("URL decoding failed, using raw URL.");
                            }
                            
                            // .mp4 link එකේ මූලික කොටස පමණක් ලබා ගැනීමට උත්සාහ කිරීම (Cleanup)
                            let baseVideoUrlMatch = cleanedUrl.match(/(.*\.mp4\?.*)/i);
                            if (baseVideoUrlMatch && baseVideoUrlMatch[1]) {
                                cleanedUrl = baseVideoUrlMatch[1];
                            }

                            const quality = hdLinkRegex.test(resultHtml) ? "HD" : "Normal";
                            console.log(`[SUCCESS] Video Link found (${quality}): ${cleanedUrl}`);
                            
                            // 3. Telegram වෙත වීඩියෝව Stream කරමින් යැවීම (Link Expiry Fix)
                            await this.sendVideo(telegramApi, chatId, cleanedUrl, `මෙන්න ඔබගේ වීඩියෝව! ${quality} Quality එකෙන් download කර ඇත.`, messageId);
                            
                        } else {
                            console.error(`[SCRAPING FAILED] No HD/Normal link found for ${text}.`);
                            
                            await this.sendMessage(telegramApi, chatId, '⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය. වීඩියෝව Private (පුද්ගලික) විය හැක.', messageId);
                        }
                        
                    } catch (fdownError) {
                        console.error("fdown.net/Scraping Error:", fdownError.message);
                        await this.sendMessage(telegramApi, chatId, '❌ වීඩියෝව ලබා ගැනීමේදී තාක්ෂණික දෝෂයක් ඇති විය.', messageId);
                    }
                    
                } else {
                    console.log(`[INVALID] Invalid message type from ${chatId}: ${text}`);
                    await this.sendMessage(telegramApi, chatId, '❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න.', messageId);
                }
            }

            return new Response('OK', { status: 200 });

        } catch (e) {
            console.error("[GLOBAL ERROR] Unhandled Error:", e.message);
            return new Response('OK', { status: 200 }); 
        }
    },

    // ------------------------------------
    // සහායක Functions
    // ------------------------------------

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

    // ** වීඩියෝව Stream කරමින් Upload කරන නවතම Function එක **
    async sendVideo(api, chatId, videoUrl, caption, replyToMessageId) {
        
        // 1. Facebook CDN Link එක Fetch කිරීම (Direct Streaming)
        const videoResponse = await fetch(videoUrl);
        
        if (videoResponse.status !== 200) {
            console.error(`[TELEGRAM ERROR] Failed to fetch video from CDN. Status: ${videoResponse.status}`);
            await this.sendMessage(api, chatId, `⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි. CDN වෙත පිවිසීමට නොහැක.`, replyToMessageId);
            return;
        }
        
        // 2. Telegram 'sendVideo' API වෙත FormData ලෙස යැවීම
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');
        if (replyToMessageId) {
            formData.append('reply_to_message_id', replyToMessageId);
        }
        
        // වීඩියෝව ගොනුවක් ලෙස FormData එකට එකතු කිරීම (Stream)
        formData.append('video', videoResponse.body, 'facebook_video.mp4');

        try {
            const telegramResponse = await fetch(`${api}/sendVideo`, {
                method: 'POST',
                body: formData, 
            });
            
            const telegramResult = await telegramResponse.json();
            
            if (!telegramResponse.ok) {
                console.error("[TELEGRAM UPLOAD ERROR] Status:", telegramResponse.status, "Message:", JSON.stringify(telegramResult));
                // විශාල ගොනු ප්‍රමාණයේ දෝෂ හෝ වෙනත් දෝෂ
                await this.sendMessage(api, chatId, `❌ වීඩියෝව යැවීම අසාර්ථකයි! (File Error). හේතුව: ${telegramResult.description || 'නොදන්නා දෝෂයක්.'}`, replyToMessageId);
            } else {
                console.log("[TELEGRAM SUCCESS] Video successfully streamed and sent.");
            }
            
        } catch (e) {
            console.error("[TELEGRAM API ERROR] Cannot send video (Upload Mode):", e.message);
            await this.sendMessage(api, chatId, `❌ වීඩියෝව යැවීම අසාර්ථකයි! (Timeout හෝ Network දෝෂයක්).`, replyToMessageId);
        }
    }
};
