/**
 * src/index.js
 * Final Fix V9: Caption Length Limit Fix + Ultimate Markdown V2 Compliance
 */

// ** 1. MarkdownV2 හි සියලුම විශේෂ අක්ෂර Escape කිරීමේ Helper Function **
function escapeMarkdownV2(text) {
    if (!text) return "";
    // සියලුම MarkdownV2 special characters සහ Backslash (\) ද escape කළ යුතුය.
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
}

// ** 2. Scraped Title/Stats සඳහා Cleaner Function **
function sanitizeText(text) {
    if (!text) return "";
    // 1. HTML tags ඉවත් කිරීම
    let cleaned = text.replace(/<[^>]*>/g, '').trim(); 
    // 2. බහු spaces තනි space එකක් බවට පත් කිරීම
    cleaned = cleaned.replace(/\s\s+/g, ' '); 
    // 3. HTML entities විකේතනය කිරීම
    cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); 

    // 4. සියලුම Markdown V2 අක්ෂර escape කිරීම (Bold සඳහා * පසුව යොදනු ලැබේ)
    cleaned = cleaned.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1'); 

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
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('👋 සුභ දවසක්! මට Facebook වීඩියෝ Link එකක් එවන්න. එවිට මම එය download කර දෙන්නම්.'), messageId);
                    return new Response('OK', { status: 200 });
                }

                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                
                if (isLink) {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න.'), messageId);
                    
                    try {
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
                        
                        let videoUrl = null;
                        let thumbnailLink = null;
                        let videoTitle = "මාතෘකාවක් නොමැත";
                        let videoStats = "";

                        // Thumbnail Scraping
                        const thumbnailRegex = /<img[^>]+class=["']?fb_img["']?[^>]*src=["']?([^"'\s]+)["']?/i;
                        let thumbnailMatch = resultHtml.match(thumbnailRegex);
                        if (thumbnailMatch && thumbnailMatch[1]) {
                            thumbnailLink = thumbnailMatch[1];
                        }

                        // Title Scraping (V9 Fix)
                        const titleRegex = /<h4[^>]*>([\s\S]*?)<\/h4>/i;
                        let titleMatch = resultHtml.match(titleRegex);
                        
                        if (titleMatch && titleMatch[1]) {
                            let scrapedTitle = sanitizeText(titleMatch[1]);
                            
                            // Title එකේ දිග සීමා කිරීම (900 chars)
                            if (scrapedTitle.length > 900) { 
                                scrapedTitle = scrapedTitle.substring(0, 897) + "\\.\\.\\."; // තිත් ද escape කර ඇත
                            }

                            if (scrapedTitle.length > 0 && scrapedTitle.toLowerCase() !== "video title") {
                                videoTitle = scrapedTitle;
                            }
                        }

                        // Stats Scraping
                        const durationRegex = /Duration:\s*(\d+)\s*seconds/i;
                        let durationMatch = resultHtml.match(durationRegex);

                        if (durationMatch && durationMatch[1]) {
                            videoStats = `දිග: ${sanitizeText(durationMatch[1].trim())} තත්පර`;
                        } else {
                            const descriptionRegex = /Description:\s*([\s\S]+?)(?=<br>|<\/p>)/i;
                            let descriptionMatch = resultHtml.match(descriptionRegex);
                            
                            if (descriptionMatch && descriptionMatch[1]) {
                                let scrapedDesc = sanitizeText(descriptionMatch[1]);
                                
                                if (scrapedDesc.toLowerCase() !== "no video description...") {
                                     videoStats = `විස්තරය: ${scrapedDesc}`;
                                }
                            }
                        }

                        if (videoStats === "") {
                            if (videoTitle.includes("Where are videos saved after being downloaded")) {
                                videoTitle = "මාතෘකාවක් නොමැත";
                                videoStats = "FAQ කොටස Title ලෙස වැරදි ලෙස scrape වී ඇත\\.";
                            } else {
                                videoStats = `විස්තර/දිග තොරතුරු නොමැත\\.`;
                            }
                        }


                        // Link Scraping
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
                            let cleanedUrl = videoUrl.replace(/&amp;/g, '&');
                            const quality = hdLinkRegex.test(resultHtml) ? "HD" : "Normal";
                            
                            // Final Caption එක සකස් කිරීම
                            let finalCaption = `**${videoTitle}**\n\nQuality: ${quality}\n${videoStats}\n\n[🔗 Original Link](${text})`;
                            
                            // අවසාන Caption එකේ දිග නැවත පරීක්ෂා කිරීම (1024 chars)
                            if (finalCaption.length > 1024) {
                                finalCaption = finalCaption.substring(0, 1000) + '\.\.\. \\(Caption Truncated\\)'; 
                            }

                            await this.sendVideo(telegramApi, chatId, cleanedUrl, finalCaption, messageId, thumbnailLink);
                            
                        } else {
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය. වීඩියෝව Private (පුද්ගලික) විය හැක.'), messageId);
                        }
                        
                    } catch (fdownError) {
                        await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ වීඩියෝව ලබා ගැනීමේදී තාක්ෂණික දෝෂයක් ඇති විය.'), messageId);
                    }
                    
                } else {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න.'), messageId);
                }
            }

            return new Response('OK', { status: 200 });

        } catch (e) {
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
            // Error handling
        }
    },

    async sendVideo(api, chatId, videoUrl, caption, replyToMessageId, thumbnailLink = null) {
        
        const videoResponse = await fetch(videoUrl);
        
        if (videoResponse.status !== 200) {
            await this.sendMessage(api, chatId, escapeMarkdownV2(`⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි. CDN වෙත පිවිසීමට නොහැක.`), replyToMessageId);
            return;
        }
        
        const videoBlob = await videoResponse.blob();
        
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', caption);
        formData.append('parse_mode', 'MarkdownV2'); 
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
                // Error handling
            }
        }

        try {
            const telegramResponse = await fetch(`${api}/sendVideo`, {
                method: 'POST',
                body: formData, 
            });
            
            const telegramResult = await telegramResponse.json();
            
            if (!telegramResponse.ok) {
                // error message ද escape කරන්න
                await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (File Error). හේතුව: ${telegramResult.description || 'නොදන්නා දෝෂයක්.'}`), replyToMessageId);
            }
            
        } catch (e) {
            await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Timeout හෝ Network දෝෂයක්).`), replyToMessageId);
        }
    }
};
