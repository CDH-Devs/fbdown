/**
 * src/index.js
 * Final Fix V21: Reverting to fbdown.blog (Confirmed working via Browser) with all structural fixes (V19).
 */

// Global Helper Functions (V19 හි තිබූ පරිදි)
function escapeMarkdownV2(text) {
    if (!text) return "";
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
}

function sanitizeText(text) {
    if (!text) return "";
    let cleaned = text.replace(/<[^>]*>/g, '').trim(); 
    cleaned = cleaned.replace(/\s\s+/g, ' '); 
    cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); 
    cleaned = cleaned.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1'); 
    return cleaned;
}

export default {
    
    // ... (sendMessage and sendVideo methods here, unchanged from V19)
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
            console.error('SEND_MESSAGE_ERROR:', e.message);
        }
    },

    async sendVideo(api, chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null) {
        try {
            const videoResponse = await fetch(videoUrl);
            
            if (videoResponse.status !== 200) {
                console.error(`VIDEO_FETCH_ERROR: Status ${videoResponse.status} for URL ${videoUrl}`);
                await this.sendMessage(api, chatId, escapeMarkdownV2(`⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි\\. CDN වෙත පිවිසීමට නොහැක\\.\\n\\n*Direct URL:* ${videoUrl}`), replyToMessageId);
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
                    } 
                } catch (e) {
                    console.error('THUMBNAIL_FETCH_ERROR:', e.message);
                }
            }

            const telegramResponse = await fetch(`${api}/sendVideo`, {
                method: 'POST',
                body: formData, 
            });
            
            const telegramResult = await telegramResponse.json();
            
            if (!telegramResponse.ok) {
                console.error(`TELEGRAM_SEND_ERROR: ${telegramResult.description}`);
                await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි\\! \\(Error: ${telegramResult.description || 'නොදන්නා දෝෂයක්\\.'}\\)`), replyToMessageId);
            }
            
        } catch (e) {
            console.error('SEND_VIDEO_NETWORK_ERROR:', e.message);
            await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි\\! \\(Network හෝ Timeout දෝෂයක්\\)\\.`), replyToMessageId);
        }
    },

    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }

        const BOT_TOKEN = env.BOT_TOKEN;
        const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;
        
        // ** V21 FIX: Downloader URL එක fbdown.blog වෙත නැවත හරවයි **
        const DOWNLOADER_URL = "https://fbdown.blog/FB-to-mp3-downloader"; 

        const sendMessage = this.sendMessage.bind(this);
        const sendVideo = this.sendVideo.bind(this);
        
        try {
            const update = await request.json();
            const message = update.message;

            if (message && message.text) {
                const chatId = message.chat.id;
                const text = message.text.trim();
                const messageId = message.message_id;
                
                if (text === '/start') {
                    await sendMessage(telegramApi, chatId, escapeMarkdownV2('👋 සුභ දවසක්! මට Facebook වීඩියෝ Link එකක් එවන්න. එවිට මම එය download කර දෙන්නම්.'), messageId);
                    return new Response('OK', { status: 200 });
                }

                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                
                if (isLink) {
                    await sendMessage(telegramApi, chatId, escapeMarkdownV2('⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න.'), messageId);
                    
                    try {
                        
                        const formData = new URLSearchParams();
                        // 'url' සහ 'locale' (Hidden Input) එකතු කරයි
                        formData.append('url', text); 
                        formData.append('locale', 'en'); 

                        const downloaderResponse = await fetch(DOWNLOADER_URL, {
                            method: 'POST',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                'Content-Type': 'application/x-www-form-urlencoded',
                                // Referer එක fbdown.blog වෙත හරවයි
                                'Referer': 'https://fbdown.blog/', 
                            },
                            body: formData.toString(),
                            redirect: 'follow' 
                        });

                        const resultHtml = await downloaderResponse.text();
                        
                        let videoUrl = null;
                        let thumbnailLink = null;
                        
                        // ** V21 FIX: fbdown.blog Scraping Logic **
                        const thumbnailRegex = /<img[^>]+src=["']?([^"'\s]+)["']?[^>]*width=["']?300px["']?/i;
                        let thumbnailMatch = resultHtml.match(thumbnailRegex);
                        if (thumbnailMatch && thumbnailMatch[1]) {
                            thumbnailLink = thumbnailMatch[1];
                        }

                        const linkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*target=["']?_blank["']?[^>]*>Download<\/a>/i;
                        let match = resultHtml.match(linkRegex);

                        if (match && match[1]) {
                            videoUrl = match[1]; 
                        } 
                        
                        if (videoUrl) {
                            let cleanedUrl = videoUrl.replace(/&amp;/g, '&');
                            await sendVideo(telegramApi, chatId, cleanedUrl, null, messageId, thumbnailLink); 
                            
                        } else {
                            // ** Debugging Log - Link සොයා ගැනීමට නොහැකි වූ විට **
                            console.log(`Video URL not found. HTML snippet (1000 chars): ${resultHtml.substring(0, 1000)}`); 
                            await sendMessage(telegramApi, chatId, escapeMarkdownV2('⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය\\. \\(Private හෝ HTML ව්‍යුහය වෙනස් වී තිබිය හැක\\)'), messageId); 
                        }
                        
                    } catch (fdownError) {
                        console.error('FDOWN_API_ERROR:', fdownError.message); 
                        await sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේදී දෝෂයක් ඇති විය\\. \\(Network හෝ URL වැරදි විය හැක\\)'), messageId); 
                    }
                    
                } else {
                    await sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න\\.'), messageId); 
                }
            }

            return new Response('OK', { status: 200 });

        } catch (e) {
            console.error('MAIN_WORKER_ERROR:', e.message);
            return new Response('OK', { status: 200 }); 
        }
    }
};
