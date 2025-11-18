/**
 * src/index.js
 * Cloudflare Worker Telegram Bot Code (Facebook Video Downloader via fdown.net scraping)
 * * විශේෂාංග: HD/Normal Download, URL Cleanup, Thumbnail/Title Scraping, Blob Stream Upload.
 */

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
                    await this.sendMessage(telegramApi, chatId, '👋 සුභ දවසක්! මට Facebook වීඩියෝ Link එකක් එවන්න. එවිට මම එය download කර දෙන්නම්.', messageId);
                    return new Response('OK', { status: 200 });
                }

                // Link වලංගුතාවය පරීක්ෂා කිරීම
                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                
                if (isLink) {
                    console.log(`[LINK] Received link from ${chatId}: ${text}`);
                    await this.sendMessage(telegramApi, chatId, '⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න.', messageId);
                    
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

                        // ** 2. Thumbnail, Title සහ Stats Scrap කිරීම **
                        let videoUrl = null;
                        let thumbnailLink = null;
                        let videoTitle = "මාතෘකාවක් නොමැත";
                        let videoStats = "";

                        // Thumbnail Link සොයා ගැනීම
                        const thumbnailRegex = /<img[^>]+src=["']?([^"'\s]+)["']?[^>]*class=["']?fb_img["']?[^>]*>/i;
                        let thumbnailMatch = resultHtml.match(thumbnailRegex);
                        if (thumbnailMatch && thumbnailMatch[1]) {
                            thumbnailLink = thumbnailMatch[1];
                            console.log(`[SCRAP] Thumbnail found: ${thumbnailLink}`);
                        }

                        // Video Title සොයා ගැනීම
                        const titleRegex = /<h4[^>]*>([\s\S]*?)<\/h4>/i;
                        let titleMatch = resultHtml.match(titleRegex);
                        if (titleMatch && titleMatch[1]) {
                            videoTitle = titleMatch[1].trim().replace(/\n/g, ' '); // Line breaks ඉවත් කිරීම
                        }

                        // Video Description/Duration සොයා ගැනීම
                        const descriptionRegex = /<p[^>]*>Description: ([\s\S]*?)<\/p>/i;
                        let descriptionMatch = resultHtml.match(descriptionRegex);
                        if (descriptionMatch && descriptionMatch[1] && descriptionMatch[1].trim() !== "No video description...") {
                            videoStats = `විස්තරය: ${descriptionMatch[1].trim()}`;
                        } else {
                            const durationRegex = /Duration: (\d+) seconds/i;
                            let durationMatch = resultHtml.match(durationRegex);
                            if (durationMatch && durationMatch[1]) {
                                videoStats = `දිග: ${durationMatch[1].trim()} තත්පර`;
                            } else {
                                videoStats = `විස්තර/දිග තොරතුරු නොමැත.`;
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
                            cleanedUrl = cleanedUrl.replace(/&dl=[01]/, ''); 
                            
                            try {
                                cleanedUrl = decodeURIComponent(cleanedUrl);
                            } catch (e) {
                                console.warn("URL decoding failed, using raw URL.");
                            }
                            
                            let baseVideoUrlMatch = cleanedUrl.match(/(.*\.mp4\?.*)/i);
                            if (baseVideoUrlMatch && baseVideoUrlMatch[1]) {
                                cleanedUrl = baseVideoUrlMatch[1];
                            }

                            const quality = hdLinkRegex.test(resultHtml) ? "HD" : "Normal";
                            console.log(`[SUCCESS] Video Link found (${quality}): ${cleanedUrl}`);
                            
                            // ** 4. නව Caption එක සකස් කිරීම **
                            const finalCaption = `**${videoTitle}**\n\nQuality: ${quality}\n${videoStats}\n\n[🔗 Original Link](${text})`;
                            
                            // ** 5. sendVideo Function එකට Thumbnail Link එක සමඟ යැවීම **
                            await this.sendVideo(telegramApi, chatId, cleanedUrl, finalCaption, messageId, thumbnailLink);
                            
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
                    parse_mode: 'Markdown', // Markdown Format එක භාවිතා කරයි
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                }),
            });
        } catch (e) {
            console.error("[TELEGRAM ERROR] Cannot send message:", e.message);
        }
    },

    // ** Thumbnail සහ Blob Stream සහිත sendVideo Function එක **
    async sendVideo(api, chatId, videoUrl, caption, replyToMessageId, thumbnailLink = null) {
        
        // 1. Facebook CDN Link එක Fetch කිරීම
        const videoResponse = await fetch(videoUrl);
        
        if (videoResponse.status !== 200) {
            console.error(`[TELEGRAM ERROR] Failed to fetch video from CDN. Status: ${videoResponse.status}`);
            await this.sendMessage(api, chatId, `⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි. CDN වෙත පිවිසීමට නොහැක.`, replyToMessageId);
            return;
        }
        
        // 2. Response body එක Blob එකක් ලෙස පරිවර්තනය කිරීම
        const videoBlob = await videoResponse.blob();
        
        // 3. Telegram 'sendVideo' API වෙත FormData ලෙස යැවීම සකස් කිරීම
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', caption);
        formData.append('parse_mode', 'Markdown'); 
        if (replyToMessageId) {
            formData.append('reply_to_message_id', replyToMessageId);
        }
        
        // වීඩියෝ ගොනුව Blob ලෙස යැවීම
        formData.append('video', videoBlob, 'video.mp4'); 

        // ** 4. Thumbnail එකතු කිරීම (ඇත්නම්) **
        if (thumbnailLink) {
            try {
                const thumbResponse = await fetch(thumbnailLink);
                if (thumbResponse.ok) {
                    const thumbBlob = await thumbResponse.blob();
                    formData.append('thumb', thumbBlob, 'thumbnail.jpg');
                    console.log("[TELEGRAM] Thumbnail added to upload.");
                } else {
                    console.warn("[SCRAP] Thumbnail fetch failed (Response not OK). Skipping thumbnail.");
                }
            } catch (e) {
                console.error("[SCRAP] Error fetching thumbnail:", e.message);
            }
        }

        try {
            const telegramResponse = await fetch(`${api}/sendVideo`, {
                method: 'POST',
                body: formData, 
            });
            
            const telegramResult = await telegramResponse.json();
            
            if (!telegramResponse.ok) {
                console.error("[TELEGRAM UPLOAD ERROR] Status:", telegramResponse.status, "Message:", JSON.stringify(telegramResult));
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
