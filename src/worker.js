/**
 * src/index.js
 * Final Fix V20: Robust Scraping (Link Found errors fix) + Correct Log Levels + Audio Button.
 */

// ** 1. MarkdownV2 හි සියලුම විශේෂ අක්ෂර Escape කිරීමේ Helper Function **
function escapeMarkdownV2(text) {
    if (!text) return "";
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
}

// ** 2. Scraped Title/Stats සඳහා Cleaner Function **
function sanitizeText(text) {
    if (!text) return "";
    let cleaned = text.replace(/<[^>]*>/g, '').trim(); 
    cleaned = cleaned.replace(/\s\s+/g, ' '); 
    cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); 
    // Note: MarkdownV2 escape is NOT needed here as it's for internal use/logging only
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

            // --- 1. CALLBACK QUERY HANDLING (Audio Button) ---
            if (update.callback_query) {
                const callbackQuery = update.callback_query;
                const data = callbackQuery.data;
                const chatId = callbackQuery.message.chat.id;
                const messageId = callbackQuery.message.message_id;
                const originalLink = data.replace('audio:', ''); 
                
                // User ට දැනුම් දීම
                await this.answerCallbackQuery(telegramApi, callbackQuery.id, "Audio Link සොයමින්...");

                if (data.startsWith('audio:')) {
                    console.log(`[LOG] Handling Audio Request for: ${originalLink}`);
                    
                    let audioUrl = null;
                    let videoTitle = "Audio Download";
                    
                    try {
                        const fdownUrl = "https://fdown.net/download.php";
                        const formData = new URLSearchParams();
                        formData.append('url', originalLink); 
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

                        // Audio Only Link සොයා ගැනීම
                        const audioLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>\s*MP3\s*[^<]*<\/a>/i; 
                        let audioMatch = resultHtml.match(audioLinkRegex);

                        if (audioMatch && audioMatch[1]) {
                            audioUrl = audioMatch[1].replace(/&amp;/g, '&');
                            console.log(`[LOG] Audio Link (MP3) found.`);
                            
                            // Title scraping (වඩා හොඳ caption එකකට)
                            const titleRegex = /<p[^>]*class=["']?card-text[^"']*["']?>\s*<strong[^>]*>Title:\s*<\/strong>\s*([\s\S]*?)<\/p>/i;
                            let titleMatch = resultHtml.match(titleRegex);
                            if (titleMatch && titleMatch[1]) {
                                videoTitle = sanitizeText(titleMatch[1]);
                            }

                        } else {
                            // ⚠️ Audio Link සොයා නොගැනීම Warning ලෙස Log කරයි
                            console.warn(`[WARNING] Audio Link NOT found on Fdown.net for: ${originalLink}`);
                        }

                    } catch (audioError) {
                        // ❌ Audio Scraping දෝෂය Error ලෙස Log කරයි
                        console.error("!!! [ERROR] Audio Scraping Failed:", audioError);
                    }
                    
                    // --- 1.2 Audio Sending ---
                    if (audioUrl) {
                         await this.sendAudio(telegramApi, chatId, audioUrl, escapeMarkdownV2(`🎧 *Audio Only* - ${videoTitle}`), messageId);
                    } else {
                         await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ සමාවෙන්න, එම වීඩියෝවට අදාළ Audio Link එක සොයා ගැනීමට නොහැකි විය\\. \\(Private විය හැක\\)'), messageId);
                    }
                }
                
                return new Response('OK', { status: 200 });
            }

            // --- 2. MESSAGE HANDLING (Video Download) ---
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
                        // ⚠️ V20 FIX: URL parameter name එක 'url' විය යුතුය
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
                        
                        // Thumbnail Link සොයා ගැනීම
                        const thumbnailRegex = /<img[^>]+class=["']?fb_img["']?[^>]*src=["']?([^"'\s]+)["']?/i;
                        let thumbnailMatch = resultHtml.match(thumbnailRegex);
                        if (thumbnailMatch && thumbnailMatch[1]) {
                            thumbnailLink = thumbnailMatch[1];
                            console.log(`[LOG] Thumbnail found.`);
                        }

                        // ✅ V20 FIX: Robust Link Scraping Regex
                        const hdLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>(?:Download Video in HD Quality|HD Video)<\/a>/i;
                        let match = resultHtml.match(hdLinkRegex);

                        if (match && match[1]) {
                            videoUrl = match[1]; 
                            console.log(`[LOG] HD Video Link found.`);
                        } else {
                            const sdLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>(?:Download Video in Normal Quality|SD Video|Normal Video)<\/a>/i;
                            match = resultHtml.match(sdLinkRegex);

                            if (match && match[1]) {
                                videoUrl = match[1]; 
                                console.log(`[LOG] SD/Normal Video Link found.`);
                            }
                        }

                        if (videoUrl) {
                            let cleanedUrl = videoUrl.replace(/&amp;/g, '&');
                            
                            // Original link එක Audio button සඳහා යවයි
                            await this.sendVideo(telegramApi, chatId, cleanedUrl, null, messageId, thumbnailLink, text); 
                            
                        } else {
                            // ⚠️ Video Link සොයා නොගැනීම Warning ලෙස Log කරයි
                            console.warn(`[WARNING] Video Link NOT found on Fdown.net for: ${text}`);
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය\\. වීඩියෝව Private \\(පුද්ගලික\\) විය හැක\\. *\\(Check Logs\\)*'), messageId);
                        }
                        
                    } catch (fdownError) {
                        // ❌ Fdown Scraping දෝෂය Error ලෙස Log කරයි
                        console.error("!!! [ERROR] FDOWN Scraping Failed:", fdownError);
                        await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේදී දෝෂයක් ඇති විය\\. *\\(Check Logs\\)*'), messageId);
                    }
                    
                } else {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න\\.'), messageId);
                }
            }

            return new Response('OK', { status: 200 });

        } catch (e) {
            // ❌ Critical Unhandled Exception Error ලෙස Log කරයි
            console.error("!!! [CRITICAL ERROR] UNHANDLED EXCEPTION IN FETCH:", e);
            return new Response('OK', { status: 200 }); 
        }
    },

    // ------------------------------------
    // සහායක Functions
    // ------------------------------------
    
    // Callback Query Answer
    async answerCallbackQuery(api, callbackQueryId, text) {
        try {
             await fetch(`${api}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackQueryId,
                    text: text,
                    show_alert: false, 
                }),
            });
        } catch (e) {
            console.error("Error answering callback query:", e);
        }
    },


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
    
    // Send Audio
    async sendAudio(api, chatId, audioUrl, caption, replyToMessageId) {
        
        const audioResponse = await fetch(audioUrl);
        
        if (audioResponse.status !== 200) {
            console.error(`[ERROR] Failed to fetch audio from CDN. Status: ${audioResponse.status}`);
            await this.sendMessage(api, chatId, escapeMarkdownV2(`⚠️ Audio file එක කෙලින්ම Upload කිරීමට අසාර්ථකයි\\. CDN වෙත පිවිසීමට නොහැක\\.`), replyToMessageId);
            return;
        }
        
        const audioBlob = await audioResponse.blob();
        
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', caption);
        formData.append('parse_mode', 'MarkdownV2'); 
        
        if (replyToMessageId) {
            formData.append('reply_to_message_id', replyToMessageId);
        }
        
        formData.append('audio', audioBlob, 'audio.mp3'); 

        try {
            const telegramResponse = await fetch(`${api}/sendAudio`, {
                method: 'POST',
                body: formData, 
            });
            
            const telegramResult = await telegramResponse.json();
            
            if (!telegramResponse.ok) {
                console.error(`[ERROR] Telegram sendAudio failed: ${telegramResult.description || 'Unknown error'}`);
                await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ Audio file එක යැවීම අසාර්ථකයි! (Error: ${telegramResult.description || 'නොදන්නා දෝෂයක්\\.'})`), replyToMessageId);
            } else {
                 console.log("[LOG] Audio successfully sent to Telegram.");
            }
            
        } catch (e) {
            console.error("Error sending audio to Telegram:", e);
            await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ Audio file එක යැවීම අසාර්ථකයි! (Network හෝ Timeout දෝෂයක්)\\.`), replyToMessageId);
        }
    },

    // Send Video
    async sendVideo(api, chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null, originalLink) {
        
        const videoResponse = await fetch(videoUrl);
        
        if (videoResponse.status !== 200) {
            console.error(`[ERROR] Failed to fetch video from CDN. Status: ${videoResponse.status}`);
            await this.sendMessage(api, chatId, escapeMarkdownV2(`⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි\\. CDN වෙත පිවිසීමට නොහැක\\. *\\(Check Logs\\)*`), replyToMessageId);
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
                     console.warn(`[WARNING] Failed to fetch thumbnail link. Status: ${thumbResponse.status}`);
                }
            } catch (e) {
                console.error("Error fetching thumbnail:", e);
            }
        }
        
        // Inline Keyboard (Audio Button) එකතු කිරීම
        const inlineKeyboard = {
            inline_keyboard: [
                [{ 
                    text: '🎵 Audio Only (MP3)', 
                    callback_data: `audio:${originalLink}`
                }]
            ]
        };
        formData.append('reply_markup', JSON.stringify(inlineKeyboard));


        try {
            const telegramResponse = await fetch(`${api}/sendVideo`, {
                method: 'POST',
                body: formData, 
            });
            
            const telegramResult = await telegramResponse.json();
            
            if (!telegramResponse.ok) {
                console.error(`[ERROR] Telegram sendVideo failed: ${telegramResult.description || 'Unknown error'}`);
                await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Error: ${telegramResult.description || 'නොදන්නා දෝෂයක්\\.'}) *\\(Check Logs\\)*`), replyToMessageId);
            } else {
                 console.log("[LOG] Video successfully sent to Telegram.");
            }
            
        } catch (e) {
            console.error("Error sending video to Telegram (Network/Timeout):", e);
            // ✅ V20 FIX: Timeout/Network දෝෂය පිළිබඳ වඩාත් පැහැදිලි පණිවිඩයක්
            await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Upload Timeout දෝෂයක් හෝ File Size එක වැඩියි)\\. *\\(Check Logs\\)*`), replyToMessageId);
        }
    }
};
