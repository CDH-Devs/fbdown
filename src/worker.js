/**
 * src/index.js
 * Final Fix V25: Rate Limit Error Handling for fbdown.blog 
 */

// ** 1. MarkdownV2 හි සියලුම විශේෂ අක්ෂර Escape කිරීමේ Helper Function **
function escapeMarkdownV2(text) {
    if (!text) return "";
    // Escapes special characters for Telegram's MarkdownV2
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
}

// ** 2. Scraped Title/Stats සඳහා Cleaner Function **
function sanitizeText(text) {
    if (!text) return "";
    let cleaned = text.replace(/<[^>]*>/g, '').trim(); 
    cleaned = cleaned.replace(/\s\s+/g, ' '); 
    cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); 
    return cleaned;
}


export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot (V25).', { status: 200 });
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
                
                await this.answerCallbackQuery(telegramApi, callbackQuery.id, "Audio Link සොයමින්...");

                if (data.startsWith('audio:')) {
                    console.log(`[LOG] Handling Audio Request for: ${originalLink}`);
                    
                    let audioUrl = null;
                    let videoTitle = "Audio Download";
                    
                    try {
                        const fdownUrl = "https://fbdown.blog/download.php"; 
                        const formData = new URLSearchParams();
                        formData.append('url', originalLink); 
                        formData.append('submit', 'Download'); 

                        const fdownResponse = await fetch(fdownUrl, {
                            method: 'POST',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Referer': 'https://fbdown.blog/FB-to-mp3-downloader', // Referer for Audio
                            },
                            body: formData.toString(),
                            redirect: 'follow' 
                        });

                        const resultHtml = await fdownResponse.text();

                        // V25 FIX: Rate Limit Error Handling 
                        if (resultHtml.includes('id="rate-limit-container"') || resultHtml.includes('too fast')) {
                            console.error("!!! [ERROR] Rate Limit Blocked by fbdown.blog during Audio search.");
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⏳ *වේග සීමා කිරීම* \\(Rate Limit\\): කරුණාකර තත්පර 15 කට පසු නැවත උත්සාහ කරන්න\\. Audio link ලබා ගැනීමට fbdown\\.blog මගින් ඔබව තාවකාලිකව නවතා ඇත\\. '), messageId);
                            return new Response('OK', { status: 200 });
                        }

                        // V24 DEBUG: Audio Scraping අසාර්ථක නම් HTML එකේ කොටසක් ලොග් කරන්න.
                        const htmlStart = resultHtml.substring(0, 500); 
                        console.log(`[DEBUG_AUDIO_HTML_START] ${htmlStart.replace(/\s+/g, ' ')}...`);

                        // Audio Link සොයා ගැනීම සඳහා දැඩි Regex
                        const audioLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>\s*(?:MP3|Download MP3|MP3 Audio)\s*[^<]*<\/a>/i; 
                        let audioMatch = resultHtml.match(audioLinkRegex);

                        if (audioMatch && audioMatch[1]) {
                            audioUrl = audioMatch[1].replace(/&amp;/g, '&');
                            console.log(`[SUCCESS] Audio Link (MP3) found.`);
                            
                            const titleRegex = /<p[^>]*class=["']?card-text[^"']*["']?>\s*<strong[^>]*>Title:\s*<\/strong>\s*([\s\S]*?)<\/p>/i;
                            let titleMatch = resultHtml.match(titleRegex);
                            if (titleMatch && titleMatch[1]) {
                                videoTitle = sanitizeText(titleMatch[1]);
                            }
                        } else {
                            console.warn(`[WARNING] Audio Link NOT found on fbdown.blog for: ${originalLink}`);
                        }

                    } catch (audioError) {
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
                        const fdownUrl = "https://fbdown.blog/download.php"; 
                        
                        const formData = new URLSearchParams();
                        formData.append('url', text); 
                        formData.append('submit', 'Download');

                        const fdownResponse = await fetch(fdownUrl, {
                            method: 'POST',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Referer': 'https://fbdown.blog/', // Referer for Video Download
                            },
                            body: formData.toString(),
                            redirect: 'follow' 
                        });

                        const resultHtml = await fdownResponse.text();
                        
                        // 🟢 V25 FIX: Rate Limit Error Handling 
                        if (resultHtml.includes('id="rate-limit-container"') || resultHtml.includes('too fast')) {
                            console.error("!!! [ERROR] Rate Limit Blocked by fbdown.blog");
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⏳ *වේග සීමා කිරීම* \\(Rate Limit\\): කරුණාකර තත්පර 15 කට පසු නැවත උත්සාහ කරන්න\\. fbdown\\.blog මගින් ඔබගේ Bot IP එක තාවකාලිකව නවතා ඇත\\. *\\(Cloudflare Worker ගැටලුවක්\\)*'), messageId);
                            return new Response('OK', { status: 200 });
                        }

                        // V24 DEBUG: Video Scraping අසාර්ථක නම් HTML එකේ කොටසක් ලොග් කරන්න.
                        const htmlStart = resultHtml.substring(0, 500); 
                        console.log(`[DEBUG_VIDEO_HTML_START] ${htmlStart.replace(/\s+/g, ' ')}...`);

                        let videoUrl = null;
                        let thumbnailLink = null;
                        
                        // Thumbnail Link සොයා ගැනීම
                        const thumbnailRegex = /<img[^>]+class=["']?fb_img["']?[^>]*src=["']?([^"'\s]+)["']?/i;
                        let thumbnailMatch = resultHtml.match(thumbnailRegex);
                        if (thumbnailMatch && thumbnailMatch[1]) {
                            thumbnailLink = thumbnailMatch[1];
                            console.log(`[LOG] Thumbnail found.`);
                        }

                        // ** 1. HTML5 Video Tag සෙවීම (Top Priority) **
                        const html5VideoRegex = /<source[^>]+src=["']?([^"'\s]+)["']?[^>]*type=["']?video\/mp4["']?/i;
                        let html5Match = resultHtml.match(html5VideoRegex);
                        if (html5Match && html5Match[1]) {
                            videoUrl = html5Match[1];
                            console.log(`[LOG] HTML5 Video Tag Link found.`);
                        }

                        // ** 2. HD Button සෙවීම (V23: More comprehensive HD/SD search) **
                        if (!videoUrl) {
                            const hdLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>(?:HD|Download HD|HD Video|High Quality Video)\s*[^<]*<\/a>/i;
                            let match = resultHtml.match(hdLinkRegex);

                            if (match && match[1]) {
                                videoUrl = match[1]; 
                                console.log(`[LOG] HD Video Link found.`);
                            }
                        }

                        // ** 3. SD Button සෙවීම (V23: More comprehensive SD/Normal search) **
                        if (!videoUrl) {
                            const sdLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>(?:SD|Normal|Download SD|Low Quality Video|Normal Video)\s*[^<]*<\/a>/i;
                            let match = resultHtml.match(sdLinkRegex);

                            if (match && match[1]) {
                                videoUrl = match[1]; 
                                console.log(`[LOG] SD/Normal Video Link found.`);
                            }
                        }

                        // ** 4. Fallback (V23: Generic Download Link සොයන්න) **
                        if (!videoUrl) {
                            const genericLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*download[^>]*>/i;
                            let match = resultHtml.match(genericLinkRegex);

                            if (match && match[1]) {
                                videoUrl = match[1]; 
                                console.log(`[LOG] Generic Fallback Download Link found.`);
                            }
                        }

                        if (videoUrl) {
                            let cleanedUrl = videoUrl.replace(/&amp;/g, '&');
                            console.log(`[SUCCESS] Video Link found: ${cleanedUrl}`);
                            await this.sendVideo(telegramApi, chatId, cleanedUrl, null, messageId, thumbnailLink, text); 
                        } else {
                            console.warn(`[WARNING] Video Link NOT found on fbdown.blog for: ${text}`);
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය\\. වීඩියෝව Private \\(පුද්ගලික\\) විය හැක\\. *\\(Check Logs for DEBUG_VIDEO_HTML_START\\)*'), messageId);
                        }
                        
                    } catch (fdownError) {
                        console.error("!!! [ERROR] fbdown.blog Scraping Failed:", fdownError);
                        await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේදී දෝෂයක් ඇති විය\\. *\\(Check Logs\\)*'), messageId);
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
    // සහායක Functions (Telegram API Callers)
    // ------------------------------------
    
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
            await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Upload Timeout දෝෂයක් හෝ File Size එක වැඩියි)\\. *\\(Check Logs\\)*`), replyToMessageId);
        }
    }
};
