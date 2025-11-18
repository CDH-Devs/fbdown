/**
 * src/index.js
 * Cloudflare Worker Telegram Bot Code (Facebook Video Downloader via fdown.net scraping)
 * ** විශේෂාංග: Improved Scraping for Title/Stats (V7), HD/Normal Download, Blob Stream Upload, Caption Length Limit Fix, Full Markdown V2 Escape.
 */

// MarkdownV2 හි සියලුම විශේෂ අක්ෂර escape කරන්න.
// මෙම ශ්‍රිතය සාමාන්‍ය පණිවිඩ සඳහා සහ කැප්ෂන් වල ස්ථිතික කොටස් සඳහා භාවිතා වේ.
function escapeMarkdownV2(text) {
    if (!text) return "";
    // MarkdownV2 special characters: _, *, [, ], (, ), ~, `, >, #, +, -, =, |, {, }, ., !
    // Backslash (\) ද escape කළ යුතුය.
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
}

// Title/Stats scraping වලදී HTML ඉවත් කිරීමට සහ අනවශ්‍ය Markdown අක්ෂර Escape කිරීමට.
// මෙහිදී * ද escape කරනු ලැබේ (Title Bold කිරීමට අවශ්‍ය නිසා, එය පසුව යොදනු ලැබේ).
function sanitizeText(text) {
    if (!text) return "";
    // 1. HTML tags ඉවත් කිරීම
    let cleaned = text.replace(/<[^>]*>/g, '').trim(); 
    // 2. බහු spaces තනි space එකක් බවට පත් කිරීම
    cleaned = cleaned.replace(/\s\s+/g, ' '); 
    // 3. HTML entities විකේතනය කිරීම
    cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); 

    // 4. සියලුම Markdown V2 අක්ෂර escape කිරීම
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
                    console.log(`[START] Chat ID: ${chatId}`);
                    // escapeMarkdownV2 භාවිතයෙන් පණිවිඩය යැවීම
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('👋 සුභ දවසක්! මට Facebook වීඩියෝ Link එකක් එවන්න. එවිට මම එය download කර දෙන්නම්.'), messageId);
                    return new Response('OK', { status: 200 });
                }

                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                
                if (isLink) {
                    console.log(`[LINK] Received link from ${chatId}: ${text}`);
                    // escapeMarkdownV2 භාවිතයෙන් පණිවිඩය යැවීම
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න.'), messageId);
                    
                    try {
                        const fdownUrl = "https://fdown.net/download.php";
                        
                        const formData = new URLSearchParams();
                        formData.append('URLz', text); 

                        // 1. fdown.net වෙත POST ඉල්ලීම යැවීම
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
                        
                        // ** 2. Thumbnail, Title සහ Stats Scrap කිරීම (Improved RegEx V7) **
                        let videoUrl = null;
                        let thumbnailLink = null;
                        let videoTitle = "මාතෘකාවක් නොමැත";
                        let videoStats = "";

                        // Thumbnail Link සොයා ගැනීම
                        const thumbnailRegex = /<img[^>]+class=["']?fb_img["']?[^>]*src=["']?([^"'\s]+)["']?/i;
                        let thumbnailMatch = resultHtml.match(thumbnailRegex);
                        if (thumbnailMatch && thumbnailMatch[1]) {
                            thumbnailLink = thumbnailMatch[1];
                        }

                        // ** IMPROVED TITLE SCRAPING V7 **
                        const titleRegexV7 = /<h4[^>]*>([\s\S]*?)<\/h4>/i;
                        let titleMatchV7 = resultHtml.match(titleRegexV7);
                        
                        if (titleMatchV7 && titleMatchV7[1]) {
                            // sanitizeText function එක භාවිතා කර Title එක පිරිසිදු කිරීම (සියලු Markdown escape කර ඇත)
                            let scrapedTitle = sanitizeText(titleMatchV7[1]);
                            
                            if (scrapedTitle.length > 0 && scrapedTitle.toLowerCase() !== "video title") {
                                videoTitle = scrapedTitle;
                            }
                        }

                        // ** IMPROVED STATS SCRAPING V7 (Duration/Description) **
                        
                        const durationRegexV7 = /Duration:\s*(\d+)\s*seconds/i;
                        let durationMatchV7 = resultHtml.match(durationRegexV7);

                        if (durationMatchV7 && durationMatchV7[1]) {
                            videoStats = `දිග: ${sanitizeText(durationMatchV7[1].trim())} තත්පර`; // Stats ද sanitize කර ඇත
                        } else {
                            const descriptionRegexV7 = /Description:\s*([\s\S]+?)(?=<br>|<\/p>)/i;
                            let descriptionMatchV7 = resultHtml.match(descriptionRegexV7);
                            
                            if (descriptionMatchV7 && descriptionMatchV7[1]) {
                                let scrapedDesc = sanitizeText(descriptionMatchV7[1]);
                                
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


                        // 3. HD සහ Normal Video Links Scrap කිරීම
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
                            // ... other URL cleanup logic ...

                            const quality = hdLinkRegex.test(resultHtml) ? "HD" : "Normal";
                            
                            // ** 4. නව Caption එක සකස් කිරීම සහ Length Limit Fix **
                            // Title සහ Stats දැනටමත් sanitize කර ඇත. දැන් Title එක Bold කිරීමට ** යොදමු.
                            let finalCaption = `**${videoTitle}**\n\nQuality: ${quality}\n${videoStats}\n\n[🔗 Original Link](${text})`;
                            
                            // Caption Length Limit එක පරීක්ෂා කිරීම (1024 characters)
                            if (finalCaption.length > 1024) {
                                finalCaption = finalCaption.substring(0, 1000) + '\.\.\. \\(Caption Truncated\\)'; 
                            }

                            
                            // ** 5. sendVideo Function එකට Thumbnail Link එක සමඟ යැවීම **
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
            // Error handling: මෙම දෝෂය log කර ඇත.
        }
    },

    // ** Thumbnail සහ Blob Stream සහිත sendVideo Function එක **
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
                // Error handling: thumbnail fetch failed
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
