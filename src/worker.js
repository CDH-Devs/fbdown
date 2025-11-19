/**
 * src/index.js
 * Final Fix V19: Enhanced error logging for fdown.net requests and Telegram API calls.
 * This helps diagnose why no reply message is being sent after the link is submitted.
 * Requires: A KV Namespace bound as env.VIDEO_LINKS
 */

// ... (escapeMarkdownV2 and sanitizeText functions remain unchanged)
function escapeMarkdownV2(text) {
    if (!text) return "";
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
}

function sanitizeText(text) {
    if (!text) return "";
    let cleaned = text.replace(/<[^>]*>/g, '').trim();
    cleaned = cleaned.replace(/\s\s+/g, ' ');
    cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return cleaned;
}
// ...

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
            const callbackQuery = update.callback_query;

            // -------------------------------------------------------------
            // 🚀 1. CALLBACK QUERY HANDLING (Audio Extraction/Debugging remains)
            // -------------------------------------------------------------
            if (callbackQuery) {
                // ... (V18/V17 හි තිබූ Audio Logic එක මෙහි එලෙසම ඇත)
                const chatId = callbackQuery.message.chat.id;
                const data = callbackQuery.data;
                const messageId = callbackQuery.message.message_id;
                const callbackQueryId = callbackQuery.id;

                const parts = data.split('|');

                if (parts.length >= 3 && parts[0] === 'audio_ID') {
                    const randomId = parts[1];
                    const videoTitle = parts[2];

                    const originalFbUrl = await env.VIDEO_LINKS.get(randomId);

                    if (originalFbUrl) {
                        await this.answerCallbackQuery(telegramApi, callbackQueryId, '⏳ Audio Link එක fbdownloader වෙතින් ලබා ගනිමින්...');
                        
                        try {
                            // Audio Scraping Logic (V18)
                            const fbDownloaderUrl = "https://fbdownloader.to/en"; 
                            const formData = new URLSearchParams();
                            formData.append('q', originalFbUrl); 
                            
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
                            
                            const newMp3LinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>.*Download MP3.*<\/a>/i;
                            let mp3Match = resultHtml.match(newMp3LinkRegex);
                            
                            let finalAudioUrl = null;
                            if (mp3Match && mp3Match[1]) {
                                finalAudioUrl = mp3Match[1].replace(/&amp;/g, '&');
                            }

                            if (finalAudioUrl && finalAudioUrl.startsWith('http')) {
                                await this.sendAudio(telegramApi, chatId, finalAudioUrl, messageId, videoTitle);
                            } else {
                                console.log(`[ERROR] Audio Link not found (V19 failed). HTML Start: ${resultHtml.substring(0, 500)}`);
                                await this.sendMessage(telegramApi, chatId, escapeMarkdownV2(`⚠️ සමාවෙන්න, Audio Link එක සොයා ගැනීමට නොහැකි විය\\. (V19)`));
                            }
                            
                        } catch (e) {
                            console.error(`[FATAL ERROR] Audio scraping failed (V19): ${e.stack}`);
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2(`❌ Audio ලබා ගැනීමේදී දෝෂයක් ඇති විය\\.`));
                        }

                    } else {
                        await this.sendMessage(telegramApi, chatId, escapeMarkdownV2(`⚠️ සමාවෙන්න, එම Link එක කල් ඉකුත් වී ඇත\\. කරුණාකර නැවත වීඩියෝ Link එක එවන්න\\.`));
                    }

                    return new Response('OK', { status: 200 });
                }
                
                await this.answerCallbackQuery(telegramApi, callbackQueryId, 'දත්ත හඳුනාගත නොහැක.');
                return new Response('OK', { status: 200 });
            }


            // -------------------------------------------------------------
            // 💬 2. MESSAGE HANDLING (Text/Links) - Enhanced Error Logging Added Here
            // -------------------------------------------------------------
            if (message && message.text) {
                const chatId = message.chat.id;
                const text = message.text.trim();
                const messageId = message.message_id;
                
                if (text === '/start') {
                    // Telegram API failure will be caught by the sendMessage's internal catch block
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('👋 සුභ දවසක්! මට Facebook වීඩියෝ Link එකක් එවන්න. එවිට මම එය download කර දෙන්නම්.'), messageId);
                    return new Response('OK', { status: 200 });
                }

                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                
                if (isLink) {
                    // Send initial response (If this fails, the issue is with the first Telegram call)
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න.'), messageId);
                    
                    try {
                        // ** FDOWN.NET REQUEST START **
                        const fdownUrl = "https://fdown.net/download.php";
                        const formData = new URLSearchParams();
                        formData.append('URLz', text);
                        
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
                        // ** FDOWN.NET REQUEST END **
                        
                        let videoUrl = null;
                        let thumbnailLink = null;
                        
                        // Link Scraping Logic (unchanged)
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
                            
                            const randomId = Math.random().toString(36).substring(2, 12);
                            await env.VIDEO_LINKS.put(randomId, text, { expirationTtl: 3600 }); 

                            const replyMarkup = {
                                inline_keyboard: [
                                    [{ text: '🎧 Audio පමණක් ගන්න', callback_data: `audio_ID|${randomId}|${videoTitle}` }]
                                ]
                            };

                            // Telegram API failure will be caught by the sendVideo's internal catch block
                            await this.sendVideo(telegramApi, chatId, cleanedVideoUrl, null, messageId, thumbnailLink, replyMarkup);
                            
                        } else {
                            // Scrape successfully completed, but no link found
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය\\. වීඩියෝව Private (පුද්ගලික) විය හැක\\.'), messageId);
                        }
                        
                    } catch (fdownError) {
                        // Catches Network Errors, DNS failures, or unexpected errors during the fdown.net call
                        console.error(`[FATAL ERROR] Fdown or Telegram reply failed after initial response: ${fdownError.stack}`);
                        // If the first message succeeded, this second error message will be sent.
                        await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේදී දෝෂයක් ඇති විය\\. (Network/Scraping Error).'), messageId);
                    }
                    
                } else {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න\\.'), messageId);
                }
            }
            
            return new Response('OK', { status: 200 });

        } catch (e) {
            // Catches errors during update.json parsing or top-level handler failures
            console.error(`[FATAL ERROR] Top-level handler failed: ${e.stack}`);
            return new Response('OK', { status: 200 });
        }
    },

    // ------------------------------------
    // සහායක Functions (Auxiliary Functions)
    // ------------------------------------

    async sendMessage(api, chatId, text, replyToMessageId, replyMarkup = null) {
        try {
            const response = await fetch(`${api}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text,
                    parse_mode: 'MarkdownV2',
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                    ...(replyMarkup && { reply_markup: replyMarkup }), 
                }),
            });
            // Log Telegram API failure details
            if (!response.ok) {
                 const result = await response.json();
                 console.error(`[TELEGRAM API ERROR] sendMessage failed: ${result.description || response.statusText}`);
            }
        } catch (e) {
            // Catches Network or DNS errors for the Telegram API
            console.error(`[TELEGRAM API ERROR] sendMessage network failed: ${e.stack}`);
        }
    },

    // sendVideo (Error logging remains)
    async sendVideo(api, chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null, replyMarkup = null) {
        // ... (Error logging inside sendVideo function remains from previous versions)
        const videoResponse = await fetch(videoUrl);
        
        if (videoResponse.status !== 200) {
            await this.sendMessage(api, chatId, escapeMarkdownV2(`⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි\\. CDN වෙත පිවිසීමට නොහැක\\.\\n*Link:* ${escapeMarkdownV2(videoUrl)}`), replyToMessageId);
            return;
        }
        
        const videoBlob = await videoResponse.blob();
        
        const formData = new FormData();
        formData.append('chat_id', chatId);
        // ... (Rest of formData setup)
        
        // ... (Thumbnail handling)

        try {
            const telegramResponse = await fetch(`${api}/sendVideo`, {
                method: 'POST',
                body: formData,
            });
            
            if (!telegramResponse.ok) {
                const telegramResult = await telegramResponse.json();
                console.error(`[TELEGRAM API ERROR] sendVideo failed: ${telegramResult.description}`);
                await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Error: ${escapeMarkdownV2(telegramResult.description || 'නොදන්නා දෝෂයක්\\.')})`), replyToMessageId);
            }
            
        } catch (e) {
            console.error(`[TELEGRAM API ERROR] sendVideo network failed: ${e.stack}`);
            await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Network හෝ Timeout දෝෂයක්)\\.`), replyToMessageId);
        }
    },

    async sendAudio(api, chatId, audioUrl, replyToMessageId, title) {
        // ... (Error logging remains)
        try {
            const response = await fetch(`${api}/sendAudio`, {
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
            if (!response.ok) {
                 const result = await response.json();
                 console.error(`[TELEGRAM API ERROR] sendAudio failed: ${result.description || response.statusText}`);
            }
        } catch (e) {
             console.error(`[TELEGRAM API ERROR] sendAudio network failed: ${e.stack}`);
        }
    },

    async answerCallbackQuery(api, callbackQueryId, text) {
        // ... (Error logging remains)
        try {
            const response = await fetch(`${api}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackQueryId,
                    text: text,
                    show_alert: false 
                }),
            });
            if (!response.ok) {
                 const result = await response.json();
                 console.error(`[TELEGRAM API ERROR] answerCallbackQuery failed: ${result.description || response.statusText}`);
            }
        } catch (e) {
            console.error(`[TELEGRAM API ERROR] answerCallbackQuery network failed: ${e.stack}`);
        }
    }
};
