/**
 * src/index.js
 * Final Fix V16: Added comprehensive console.log debugging for fbdownloader.to scraping failures.
 * Requires: A KV Namespace bound as env.VIDEO_LINKS
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
    return cleaned;
}

export default {
    // ------------------------------------
    // ප්‍රධාන Fetch Handler එක
    // ------------------------------------
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }

        const BOT_TOKEN = env.BOT_TOKEN;
        const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

        try {
            const update = await request.json();
            const message = update.message;
            const callbackQuery = update.callback_query;

            // -------------------------------------------------------------
            // 🚀 1. CALLBACK QUERY HANDLING (Inline Button Clicks) - Audio Extraction
            // -------------------------------------------------------------
            if (callbackQuery) {
                const chatId = callbackQuery.message.chat.id;
                const data = callbackQuery.data;
                const messageId = callbackQuery.message.message_id;
                const callbackQueryId = callbackQuery.id;

                const parts = data.split('|');

                // 'audio_ID|RANDOM_ID|TITLE' Format එක හඳුනාගැනීම
                if (parts.length >= 3 && parts[0] === 'audio_ID') {
                    const randomId = parts[1]; // KV Key එක
                    const videoTitle = parts[2];

                    // 1. KV Store එකෙන් Original Facebook Link එක ලබා ගැනීම 
                    const originalFbUrl = await env.VIDEO_LINKS.get(randomId);

                    if (originalFbUrl) {
                        await this.answerCallbackQuery(telegramApi, callbackQueryId, '⏳ Audio Link එක fbdownloader වෙතින් ලබා ගනිමින්...');
                        
                        try {
                            console.log(`[DEBUG] Attempting to scrape Audio for URL: ${originalFbUrl}`);
                            
                            // 2. fbdownloader.to වෙත නිවැරදි POST Request යැවීම
                            const fbDownloaderUrl = "https://fbdownloader.to/en"; // Action URL
                            const formData = new URLSearchParams();
                            formData.append('q', originalFbUrl); // Link එක 'q' field එකට යවයි
                            
                            const fbDownloaderResponse = await fetch(fbDownloaderUrl, {
                                method: 'POST',
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                    'Referer': 'https://fbdownloader.to/en/download-facebook-mp3', 
                                },
                                body: formData.toString(),
                                redirect: 'follow'
                            });

                            const resultHtml = await fbDownloaderResponse.text();
                            
                            // 3. Audio Link එක Scrape කිරීම
                            // Download Link එක බොහෝ විට "Download MP3" හෝ "Download" යන වචන සහිත button එකේ href එකේ ඇත.
                            const mp3LinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>(?:Download MP3|Download).*<\/a>/i;
                            let mp3Match = resultHtml.match(mp3LinkRegex);
                            
                            let finalAudioUrl = null;
                            if (mp3Match && mp3Match[1]) {
                                finalAudioUrl = mp3Match[1].replace(/&amp;/g, '&'); // Link එක පිරිසිදු කරයි
                            }

                            if (finalAudioUrl && finalAudioUrl.startsWith('http')) {
                                console.log(`[DEBUG] Found final Audio URL: ${finalAudioUrl}`);
                                // 4. Audio යැවීම 
                                await this.sendAudio(telegramApi, chatId, finalAudioUrl, messageId, videoTitle);
                            } else {
                                // Scrape කිරීමට අසාර්ථක නම් - Debugging Logs
                                console.log(`[ERROR] Audio Link not found. HTML Start: ${resultHtml.substring(0, 500)}`);
                                await this.sendMessage(telegramApi, chatId, escapeMarkdownV2(`⚠️ සමාවෙන්න, fbdownloader\\.to වෙතින් Audio Link එක සොයා ගැනීමට නොහැකි විය\\. වීඩියෝව Private විය හැක\\.`));
                            }
                            
                        } catch (e) {
                            // Network හෝ Parsing Error - Debugging Logs
                            console.error(`[FATAL ERROR] Audio scraping failed: ${e.stack}`);
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2(`❌ Audio ලබා ගැනීමේදී දෝෂයක් ඇති විය\\.`));
                        }

                    } else {
                        // Link එක කල් ඉකුත් වී ඇත්නම්
                        await this.sendMessage(telegramApi, chatId, escapeMarkdownV2(`⚠️ සමාවෙන්න, එම Link එක කල් ඉකුත් වී ඇත\\. කරුණාකර නැවත වීඩියෝ Link එක එවන්න\\.`));
                    }

                    return new Response('OK', { status: 200 });
                }
                
                await this.answerCallbackQuery(telegramApi, callbackQueryId, 'දත්ත හඳුනාගත නොහැක.');
                return new Response('OK', { status: 200 });
            }

            // -------------------------------------------------------------
            // 💬 2. MESSAGE HANDLING (Text/Links) - fdown.net භාවිතයෙන් Video Link ලබා ගනී
            // -------------------------------------------------------------
            if (message && message.text) {
                const chatId = message.chat.id;
                const text = message.text.trim();
                const messageId = message.message_id;
                
                if (text === '/start') {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('👋 සුභ දවසක්! මට Facebook වීඩියෝ Link එකක් එවන්න. එවිට මම එය download කර දෙන්නම්.'), messageId);
                    return new Response('OK', { status: 200 });
                }

                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                
                if (isLink) {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න.'), messageId);
                    
                    try {
                        // fdown.net භාවිතයෙන් Video Link සොයයි
                        const fdownUrl = "https://fdown.net/download.php";
                        const formData = new URLSearchParams();
                        formData.append('URLz', text);
                        
                        // Fdown.net වෙත POST request යැවීම
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
                        
                        // Link Scraping (fdown.net වෙතින් Video Link පමණක්)
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
                        
                        const thumbnailRegex = /<img[^>]+class=["']?fb_img["']?[^>]*src=["']?([^"'\s]+)["']?/i;
                        let thumbnailMatch = resultHtml.match(thumbnailRegex);
                        if (thumbnailMatch && thumbnailMatch[1]) {
                            thumbnailLink = thumbnailMatch[1];
                        }


                        if (videoUrl) {
                            let cleanedVideoUrl = videoUrl.replace(/&amp;/g, '&');
                            const videoTitle = 'Facebook Video'; 
                            
                            // ** KV Storage එකට Original Facebook Link එක ගබඩා කිරීම **
                            const randomId = Math.random().toString(36).substring(2, 12);
                            // KV Store එකට යවන්නේ Audio Extraction සඳහා අවශ්‍ය වන Original Facebook Link එකයි (text)
                            await env.VIDEO_LINKS.put(randomId, text, { expirationTtl: 3600 }); 

                            const replyMarkup = {
                                inline_keyboard: [
                                    // Callback Data Format: audio_ID|RANDOM_ID|TITLE
                                    [{ text: '🎧 Audio පමණක් ගන්න', callback_data: `audio_ID|${randomId}|${videoTitle}` }]
                                ]
                            };

                            // Video එක යැවීම
                            await this.sendVideo(telegramApi, chatId, cleanedVideoUrl, null, messageId, thumbnailLink, replyMarkup);
                            
                        } else {
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය\\. වීඩියෝව Private (පුද්ගලික) විය හැක\\.'), messageId);
                        }
                        
                    } catch (fdownError) {
                        console.error(`[FATAL ERROR] Fdown scraping failed: ${fdownError.stack}`);
                        await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේදී දෝෂයක් ඇති විය\\.'), messageId);
                    }
                    
                } else {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න\\.'), messageId);
                }
            }

            return new Response('OK', { status: 200 });

        } catch (e) {
            console.error(`[FATAL ERROR] Top-level handler failed: ${e.stack}`);
            return new Response('OK', { status: 200 });
        }
    },

    // ------------------------------------
    // සහායක Functions (Auxiliary Functions)
    // ------------------------------------

    async sendMessage(api, chatId, text, replyToMessageId, replyMarkup = null) {
        try {
            await fetch(`${api}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text,
                    parse_mode: 'MarkdownV2',
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                    ...(replyMarkup && { reply_markup: replyMarkup }), // Added replyMarkup for future flexibility
                }),
            });
        } catch (e) {
            // Error handling
        }
    },

    async sendVideo(api, chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null, replyMarkup = null) {
        
        const videoResponse = await fetch(videoUrl);
        
        if (videoResponse.status !== 200) {
            await this.sendMessage(api, chatId, escapeMarkdownV2(`⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි\\. CDN වෙත පිවිසීමට නොහැක\\.\\n*Link:* ${escapeMarkdownV2(videoUrl)}`), replyToMessageId);
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
        
        if (replyMarkup) {
            formData.append('reply_markup', JSON.stringify(replyMarkup));
        }

        formData.append('video', videoBlob, 'video.mp4');

        if (thumbnailLink) {
            try {
                const thumbResponse = await fetch(thumbnailLink);
                if (thumbResponse.ok) {
                    const thumbBlob = await thumbResponse.blob();
                    formData.append('thumb', thumbBlob, 'thumbnail.jpg');
                }
            } catch (e) {
                // Error handling
            }
        }

        try {
            const telegramResponse = await fetch(`${api}/sendVideo`, {
                method: 'POST',
                body: formData,
            });
            
            if (!telegramResponse.ok) {
                const telegramResult = await telegramResponse.json();
                await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Error: ${escapeMarkdownV2(telegramResult.description || 'නොදන්නා දෝෂයක්\\.')})`), replyToMessageId);
            }
            
        } catch (e) {
            await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Network හෝ Timeout දෝෂයක්)\\.`), replyToMessageId);
        }
    },

    async sendAudio(api, chatId, audioUrl, replyToMessageId, title) {
        try {
            await fetch(`${api}/sendAudio`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    audio: audioUrl,
                    caption: escapeMarkdownV2(`🎶 **Audio Downloaded**\n\nඔබට මෙය Audio ලෙස Save කරගත හැක\\.`),
                    parse_mode: 'MarkdownV2',
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                    title: sanitizeText(title),
                    performer: 'Facebook'
                }),
            });
        } catch (e) {
            // Error handling
        }
    },

    async answerCallbackQuery(api, callbackQueryId, text) {
        try {
            await fetch(`${api}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackQueryId,
                    text: text,
                    show_alert: false 
                }),
            });
        } catch (e) {
            // Error handling
        }
    }
};
