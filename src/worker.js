/**
 * src/index.js
 * Complete Code V54 (Auto Best Quality Upload/Link, Thumbnail via API, No Buttons)
 * - Large Videos (Duration > 5 mins) send the original Facebook URL for manual download via the site.
 * - Small Videos (Duration <= 5 mins) are directly uploaded to Telegram.
 */

// *****************************************************************
// ********** [ 1. Configurations and Constants ] ********************
// *****************************************************************
const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 
const OWNER_ID = '1901997764'; 
const MAX_UPLOAD_DURATION = 300; // 5 minutes (300 seconds)
// *****************************************************************

// Telegram API Base URL
const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

// --- Helper Functions ---

function htmlBold(text) {
    return `<b>${text}</b>`;
}

// *****************************************************************
// ********** [ 2. WorkerHandlers Class ] ****************************
// *****************************************************************

class WorkerHandlers {
    
    constructor(env) {
        this.env = env;
        // KV binding is not used for buttons in this version.
    }
    
    // --- Telegram API Helpers ---
    async sendMessage(chatId, text, replyToMessageId) {
        try {
            const response = await fetch(`${telegramApi}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text, 
                    parse_mode: 'HTML', 
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                }),
            });
            const result = await response.json();
            if (!response.ok) {
                console.error(`sendMessage API Failed (Chat ID: ${chatId}):`, result);
                return null;
            }
            return result.result.message_id;
        } catch (e) { 
            console.error(`sendMessage Fetch Error (Chat ID: ${chatId}):`, e);
            return null;
        }
    }

    // --- sendPhoto (Send thumbnail with caption) ---
    async sendPhoto(chatId, photoUrl, replyToMessageId, caption = null) { 
        try {
            console.log(`[INFO] Attempting to send photo from URL: ${photoUrl.substring(0, 50)}...`);
            const response = await fetch(`${telegramApi}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    photo: photoUrl,
                    reply_to_message_id: replyToMessageId,
                    caption: caption || htmlBold("✅ Thumbnail Downloaded!"),
                    parse_mode: 'HTML',
                }),
            });
            const result = await response.json();
            if (response.ok) {
                console.log("[SUCCESS] sendPhoto successful.");
                return result.result.message_id; 
            }
            console.error(`[ERROR] sendPhoto API Failed (Chat ID: ${chatId}):`, result);
            return null;
        } catch (e) {
            console.error(`[ERROR] sendPhoto Fetch Error (Chat ID: ${chatId}):`, e);
            return null;
        }
    }

    // --- sendVideo (Download & Upload as Blob - Preserves Audio) ---
    async sendVideo(chatId, videoUrl, caption = null, replyToMessageId = null, thumbnailLink = null) {
        
        console.log(`[DEBUG] Attempting to send video. URL: ${videoUrl.substring(0, 50)}...`);
        
        try {
            // Download video with proper headers to get complete file with audio
            const videoResponse = await fetch(videoUrl, {
                method: 'GET',
                headers: {
                    // Sound සහිත වීඩියෝව ලබා ගැනීමට උපකාරී වන Headers
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://fdown.net/', 
                    'Accept': 'video/mp4,video/webm,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
                    'Accept-Language': 'en-US,en;q=0.5'
                },
            });
            
            if (videoResponse.status !== 200) {
                console.error(`[DEBUG] Video Fetch Failed! Status: ${videoResponse.status} for URL: ${videoUrl}`);
                if (videoResponse.body) { await videoResponse.body.cancel(); }
                return null; 
            }
            
            const videoBlob = await videoResponse.blob();
            
            const formData = new FormData();
            formData.append('chat_id', chatId);
            
            if (caption) {
                formData.append('caption', caption);
                formData.append('parse_mode', 'HTML'); 
            }
            
            if (replyToMessageId) {
                formData.append('reply_to_message_id', replyToMessageId);
            }
            
            console.log(`[DEBUG] Video Blob size: ${videoBlob.size} bytes`);
            formData.append('video', videoBlob, 'video.mp4'); 

            if (thumbnailLink) {
                try {
                    const thumbResponse = await fetch(thumbnailLink);
                    if (thumbResponse.ok) {
                        const thumbBlob = await thumbResponse.blob();
                        formData.append('thumb', thumbBlob, 'thumbnail.jpg');
                    } else {
                        if (thumbResponse.body) { await thumbResponse.body.cancel(); }
                    } 
                } catch (e) { 
                    console.warn("Thumbnail fetch failed:", e);
                }
            }

            const telegramResponse = await fetch(`${telegramApi}/sendVideo`, {
                method: 'POST',
                body: formData, 
            });
            
            const telegramResult = await telegramResponse.json();
            
            if (!telegramResponse.ok) {
                console.error(`[DEBUG] sendVideo API Failed! Result:`, telegramResult);
                return null;
            } else {
                console.log(`[DEBUG] sendVideo successful.`);
                return telegramResult.result.message_id;
            }
            
        } catch (e) {
            console.error(`[DEBUG] sendVideo General Error (Chat ID: ${chatId}):`, e);
            return null;
        }
    }

    // --- editMessageText (Edit the text of a message) ---
    async editMessageText(chatId, messageId, text, inlineKeyboard = null) {
        try {
            const response = await fetch(`${telegramApi}/editMessageText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                    text: text,
                    parse_mode: 'HTML',
                    ...(inlineKeyboard !== null && { reply_markup: { inline_keyboard: inlineKeyboard } }),
                }),
            });
            const result = await response.json();
            if (response.ok) {
                console.log("[SUCCESS] editMessageText successful.");
                return true;
            }
            console.warn(`[WARN] editMessageText failed for ${messageId}:`, result);
            return false;
        } catch (e) {
            console.error(`[ERROR] editMessageText error:`, e);
            return false;
        }
    }

    // --- deleteMessage (Delete a previous message) ---
    async deleteMessage(chatId, messageId) {
        if (!messageId) return false;
        try {
            const response = await fetch(`${telegramApi}/deleteMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                }),
            });
            if (response.ok) {
                console.log(`[SUCCESS] Deleted message ${messageId} in chat ${chatId}.`);
                return true;
            }
            console.warn(`[WARN] deleteMessage failed for ${messageId}:`, await response.json());
            return false;
        } catch (e) {
            console.error(`[ERROR] deleteMessage error for ${messageId}:`, e);
            return false;
        }
    }
}


// *****************************************************************
// ********** [ 3. Main Fetch Handler and Helper Functions ] *********
// *****************************************************************

async function fetchVideoInfo(link) {
    // Thumbnail, Metadata සහ Quality List සඳහා API කැඳවීම
    const apiUrl = "https://fdown-fb-download.deno.dev/"; 
    
    const apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'CloudflareWorker/1.0'
        },
        body: JSON.stringify({ url: link })
    });
    
    if (!apiResponse.ok) {
        throw new Error(`API request failed with status ${apiResponse.status}`);
    }
    
    return apiResponse.json();
}


export default {
    
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }
        
        const handlers = new WorkerHandlers(env);
        
        try {
            const update = await request.json();
            
            // --- C. Inline Button Click Handling (Now empty) ---
            if (update.callback_query) {
                // Ignore any old callback queries since buttons are removed
                return new Response('OK', { status: 200 });
            }


            // --- D. New Message Handling ---
            const message = update.message;
            
            if (!message) {
                 return new Response('OK', { status: 200 });
            }

            const chatId = message.chat.id;
            const messageId = message.message_id;
            const text = message.text ? message.text.trim() : null; // Original Facebook Link
            
            const userName = message.from.first_name || "User"; 

            // --- 1. /start command Handling ---
            if (text && text.toLowerCase().startsWith('/start')) {
                const userText = `👋 <b>නමස්කාර ${userName}!</b> 💁‍♂️ මෙය Facebook වීඩියෝ බාගත කිරීමේ Bot එකයි.
                
කරුණාකර Facebook Video link එකක් එවන්න.`;
                await handlers.sendMessage(chatId, userText, messageId);
                return new Response('OK', { status: 200 });
            }

            // --- 2. Facebook Link Handling ---
            if (text) { 
                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                
                if (isLink) {
                    
                    // Initial Acknowledgement Message
                    const initialMessage = await handlers.sendMessage(
                        chatId, 
                        htmlBold('⏳ Video තොරතුරු සොයමින්...'), 
                        messageId
                    );
                    
                    try {
                        // Use Facebook Video Download API (Thumbnail & Metadata)
                        const videoData = await fetchVideoInfo(text);
                        
                        // Metadata Extraction Logic
                        let rawThumbnailLink = null;
                        let videoTitle = 'Facebook Video';
                        let duration = null;
                        let uploader = null;
                        let viewCount = null;
                        let uploadDate = null;
                        
                        const info = videoData.video_info || videoData.data || videoData;
                        
                        if (info) {
                            if (info.thumbnail) {
                                rawThumbnailLink = info.thumbnail.replace(/&amp;/g, '&');
                            }
                            if (info.title) {
                                videoTitle = info.title;
                            }
                            duration = info.duration;
                            uploader = info.uploader;
                            viewCount = info.view_count;
                            uploadDate = info.upload_date;
                        }
                        
                        // ⭐️ 1. Thumbnail Sending Logic
                        let photoMessageId = null;
                        
                        if (rawThumbnailLink) {
                            
                            let durationText = duration ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}` : '';
                            let viewCountText = viewCount ? (typeof viewCount === 'string' ? viewCount : viewCount.toLocaleString()) : '';
                            let uploadDateText = uploadDate && uploadDate.length === 8 ? `${uploadDate.substring(0, 4)}-${uploadDate.substring(4, 6)}-${uploadDate.substring(6, 8)}` : '';
                            
                            let caption = `${htmlBold(videoTitle)}\n\n`;
                            if (uploader) caption += `👤 ${uploader}\n`;
                            if (durationText) caption += `⏱️ Duration: ${durationText}\n`;
                            if (viewCountText) caption += `👁️ Views: ${viewCountText}\n`;
                            if (uploadDateText) caption += `📅 Uploaded: ${uploadDateText}\n`;
                            caption += `\n✅ ${htmlBold('Thumbnail Downloaded!')}`;
                            
                            photoMessageId = await handlers.sendPhoto(
                                chatId, 
                                rawThumbnailLink, 
                                messageId,
                                caption
                            );
                            
                            if (photoMessageId && initialMessage) {
                                handlers.deleteMessage(chatId, initialMessage); 
                            } else {
                                await handlers.editMessageText(chatId, initialMessage, htmlBold('⚠️ Thumbnail එක යැවීම අසාර්ථක විය. Video Processing කරමින්...'));
                                photoMessageId = initialMessage; 
                            }
                        } else if (initialMessage) {
                             await handlers.editMessageText(chatId, initialMessage, htmlBold('⚠️ සමාවෙන්න, මේ Video එකේ Thumbnail එක සොයා ගැනීමට නොහැකි විය. Video Processing කරමින්...'));
                             photoMessageId = initialMessage;
                        }

                        // ⭐️ 2. Best Quality Link Determination
                        let bestQualityLink = null;
                        let bestQuality = 'SD';
                        
                        if (videoData.available_formats) {
                            const qualityOrder = { '1920p': 5, '1080p': 4, '720p': 3, '480p': 2, '360p': 1 };
                            
                            const bestFormat = videoData.available_formats.reduce((best, current) => {
                                const bestScore = qualityOrder[best.quality] || 0;
                                const currentScore = qualityOrder[current.quality] || 0;
                                
                                if (currentScore > bestScore && current.url) {
                                    return current;
                                }
                                return best;
                            }, { quality: '0p', url: null });

                            bestQualityLink = bestFormat.url ? bestFormat.url.replace(/&amp;/g, '&') : null;
                            bestQuality = bestFormat.quality !== '0p' ? bestFormat.quality : 'SD';
                        }

                        // ⭐️ 3. Upload or Send Link Decision
                        
                        if (bestQualityLink) {
                            
                            // Check if the video is too long (Duration check)
                            const shouldSendLink = !duration || duration > MAX_UPLOAD_DURATION;

                            if (shouldSendLink) {
                                // ❌ Send Original Facebook Link (Large Video)
                                const linkMessage = `${htmlBold('📥 Video Download Link:')}\n`
                                    + `Quality: ${bestQuality}\n\n`
                                    + `⚠️ මෙම වීඩියෝව විශාල නිසා (>${MAX_UPLOAD_DURATION/60} mins) Telegram හරහා Upload කළ නොහැක. \n`
                                    + `බාගත කිරීම සඳහා, කරුණාකර පහත Link එක <a href="https://fdown.net/">fdown.net</a> වෙබ් අඩවිය වෙත යොමු කරන්න:\n`
                                    + `${htmlBold('Facebook Video Link:')}\n` 
                                    + `${text}`; // ⬅️ මුල් Facebook Video Link එක යවයි
                                
                                // Send the link as a new message, replying to the original link message
                                await handlers.sendMessage(chatId, linkMessage, messageId);

                            } else {
                                // ✅ Direct Upload (Small Video)
                                const uploadText = htmlBold(`🔄 ${bestQuality} වීඩියෝව Upload කරමින්...`);
                                let statusMessageId = photoMessageId || initialMessage;
                                
                                // Update the message text to show uploading status
                                await handlers.editMessageText(chatId, statusMessageId, uploadText);

                                const caption = `${htmlBold(videoTitle)}\n\n✅ ${bestQuality} Video Uploaded!`;
                                // Pass the original message ID (for reply purposes) and the thumbnail URL
                                const sentVideoId = await handlers.sendVideo(chatId, bestQualityLink, caption, messageId, rawThumbnailLink);

                                if (sentVideoId) {
                                    // Success: Delete the status message
                                    handlers.deleteMessage(chatId, statusMessageId);
                                } else {
                                    // Failure: Edit status message to show failure
                                    await handlers.editMessageText(chatId, statusMessageId, htmlBold('❌ Video Upload කිරීම අසාර්ථක විය. කරුණාකර නැවත උත්සහා කරන්න.'));
                                }
                            }

                        } else {
                             // No format found error
                            const errorText = htmlBold('❌ වීඩියෝ බාගත කිරීමේ Format සොයා ගැනීමට නොහැකි විය. කරුණාකර නැවත උත්සහා කරන්න.');
                            if (photoMessageId && photoMessageId !== initialMessage) {
                                await handlers.sendMessage(chatId, errorText, messageId);
                            } else if (initialMessage) {
                                await handlers.editMessageText(chatId, initialMessage, errorText);
                            }
                        }
                        
                    } catch (apiError) {
                        console.error(`[ERROR] API Error (Chat ID: ${chatId}):`, apiError);
                        const errorText = htmlBold('❌ Video තොරතුරු ලබා ගැනීමේ දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සහා කරන්න. (API Failed)');
                        if (initialMessage) {
                            await handlers.editMessageText(chatId, initialMessage, errorText); 
                        } else {
                            await handlers.sendMessage(chatId, errorText, messageId);
                        }
                    }
                    
                } else {
                    await handlers.sendMessage(chatId, htmlBold('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න.'), messageId);
                }
            } 
            
            return new Response('OK', { status: 200 });

        } catch (e) {
            console.error("--- FATAL FETCH ERROR (Worker Logic Error) ---");
            console.error("The worker failed to process the update: " + e.message);
            console.error("-------------------------------------------------");
            return new Response('OK', { status: 200 }); 
        }
    }
};
