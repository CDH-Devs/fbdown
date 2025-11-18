/**
 * src/index.js
 * Final Fix V18: V10 Clean Code base with Robust FDown Scraping and Logging.
 */

// ** 1. MarkdownV2 හි සියලුම විශේෂ අක්ෂර Escape කිරීමේ Helper Function **
function escapeMarkdownV2(text) {
    if (!text) return "";
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
}

// ** 2. Scraped Title/Stats සඳහා Cleaner Function (Logging සඳහා තබා ගනිමු) **
function sanitizeText(text) {
    if (!text) return "";
    let cleaned = text.replace(/<[^>]*>/g, '').trim(); 
    cleaned = cleaned.replace(/\s\s+/g, ' '); 
    cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); 
    // MarkdownV2 escape is NOT needed here as it's for internal use/logging only
    return cleaned;
}


export default {
    async fetch(request, env, ctx) {
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
                
                if (text === '/start') {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('👋 සුභ දවසක්! මට Facebook වීඩියෝ Link එකක් එවන්න\\. එවිට මම එය download කර දෙන්නම්\\.'), messageId);
                    return new Response('OK', { status: 200 });
                }

                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                
                if (isLink) {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න\\.'), messageId);
                    
                    try {
                        const fdownUrl = "https://fdown.net/download.php";
                        
                        const formData = new URLSearchParams();
                        // V18 FIX: නිවැරදි POST data යවයි
                        formData.append('url', text); 
                        formData.append('submit', 'Download'); 

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
                        
                        let videoUrl = null;
                        let thumbnailLink = null;
                        
                        // Thumbnail Link සොයා ගැනීම (V10 Regex)
                        const thumbnailRegex = /<img[^>]+class=["']?fb_img["']?[^>]*src=["']?([^"'\s]+)["']?/i;
                        let thumbnailMatch = resultHtml.match(thumbnailRegex);
                        if (thumbnailMatch && thumbnailMatch[1]) {
                            thumbnailLink = thumbnailMatch[1];
                            console.log(`[LOG] Thumbnail found (Fdown.net).`);
                        }

                        // V18 FIX: වඩාත් විශ්වාසදායක Regex භාවිතා කරයි (Buttons වල ඇති HD/SD වචන අනුව)
                        
                        // 1. HD Link සොයා ගැනීම (පැරණි/නවතම 'btn-download' Class එකක් හෝ 'HD Video' යන Text එකක් සොයයි)
                        const hdLinkRegex = /<a href="([^"]+)"[^>]*>\s*HD Video\s*<\/a>/i;
                        let match = resultHtml.match(hdLinkRegex);

                        if (match && match[1]) {
                            videoUrl = match[1]; 
                            console.log(`[LOG] HD Video Link found.`);
                        } else {
                            // 2. SD/Normal Link සොයා ගැනීම
                            const sdLinkRegex = /<a href="([^"]+)"[^>]*>\s*(?:SD|Normal)\s*Video\s*<\/a>/i;
                            match = resultHtml.match(sdLinkRegex);

                            if (match && match[1]) {
                                videoUrl = match[1]; 
                                console.log(`[LOG] SD/Normal Video Link found.`);
                            }
                        }

                        if (videoUrl) {
                            let cleanedUrl = videoUrl.replace(/&amp;/g, '&');
                            
                            await this.sendVideo(telegramApi, chatId, cleanedUrl, null, messageId, thumbnailLink);
                            
                        } else {
                            // Video Link සොයා නොගැනීම Log කරයි
                            console.warn(`[LOG] Video Link NOT found on Fdown.net for: ${text}`);
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය\\. වීඩියෝව Private (පුද්ගලික) විය හැක\\. (Check Logs)'), messageId);
                        }
                        
                    } catch (fdownError) {
                        console.error("!!! [ERROR] FDOWN Scraping Failed:", fdownError);
                        await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේදී දෝෂයක් ඇති විය\\. (Check Logs)'), messageId);
                    }
                    
                } else {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න\\.'), messageId);
                }
            }

            return new Response('OK', { status: 200 });

        } catch (e) {
            console.error("!!! [CRITICAL ERROR] UNHANDLED EXCEPTION IN FETCH:", e);
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
                    parse_mode: 'MarkdownV2', 
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                }),
            });
        } catch (e) {
            console.error("Error sending message to Telegram:", e);
        }
    },

    async sendVideo(api, chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null) {
        
        const videoResponse = await fetch(videoUrl);
        
        if (videoResponse.status !== 200) {
            console.error(`[ERROR] Failed to fetch video from CDN. Status: ${videoResponse.status}`);
            await this.sendMessage(api, chatId, escapeMarkdownV2(`⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි\\. CDN වෙත පිවිසීමට නොහැක\\.(Check Logs)`), replyToMessageId);
            return;
        }
        
        const videoBlob = await videoResponse.blob();
        
        const formData = new FormData();
        formData.append('chat_id', chatId);
        
        if (caption) {
            formData.append('caption', caption);
            formData.append('parse_mode', 'MarkdownV2'); 
        }
        
        if (replyToMessageId) {
            formData.append('reply_to_message_id', replyToMessageId);
        }
        
        formData.append('video', videoBlob, 'video.mp4'); 

        if (thumbnailLink) {
            try {
                const thumbResponse = await fetch(thumbnailLink);
                if (thumbResponse.ok) {
                    const thumbBlob = await thumbResponse.blob();
                    formData.append('thumb', thumbBlob, 'thumbnail.jpg');
                    console.log(`[LOG] Thumbnail blob successfully added.`);
                } else {
                     console.warn(`[LOG] Failed to fetch thumbnail link. Status: ${thumbResponse.status}`);
                }
            } catch (e) {
                console.error("Error fetching thumbnail:", e);
            }
        }

        try {
            const telegramResponse = await fetch(`${api}/sendVideo`, {
                method: 'POST',
                body: formData, 
            });
            
            const telegramResult = await telegramResponse.json();
            
            if (!telegramResponse.ok) {
                console.error(`[ERROR] Telegram sendVideo failed: ${telegramResult.description || 'Unknown error'}`);
                await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Error: ${telegramResult.description || 'නොදන්නා දෝෂයක්\\.'}) (Check Logs)`), replyToMessageId);
            } else {
                 console.log("[LOG] Video successfully sent to Telegram.");
            }
            
        } catch (e) {
            console.error("Error sending video to Telegram:", e);
            await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Network හෝ Timeout දෝෂයක්)\\. (Check Logs)`), replyToMessageId);
        }
    }
};
