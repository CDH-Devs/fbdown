import { Telegraf } from 'telegraf';
import { getFbVideoInfo } from 'fb-downloader-scrapper';

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN environment variable is required!');
    console.error('   Set it with: export BOT_TOKEN="your_bot_token_here"');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

async function getFbVideoLinks(videoUrl) {
    try {
        console.log(`Fetching video info for: ${videoUrl}`);
        const result = await getFbVideoInfo(videoUrl);
        
        console.log("Video info retrieved:", result);
        
        if (result && (result.hd || result.sd)) {
            return { 
                hd: result.hd, 
                sd: result.sd,
                thumbnail: result.thumbnail,
                title: result.title
            };
        }
        
        console.error("No video links found in response");
        return { error: "No video links found" };

    } catch (error) {
        console.error("Facebook video fetch error:", error.message);
        return { error: error.message };
    }
}

bot.start((ctx) => {
    ctx.reply("👋 **ආයුබෝවන්!** මම Facebook වීඩියෝ බාගත කරන්නා. මට Facebook වීඩියෝ සබැඳියක් (link) එවන්න.", { parse_mode: 'Markdown' });
});

bot.help((ctx) => {
    ctx.reply("👋 **ආයුබෝවන්!** මම Facebook වීඩියෝ බාගත කරන්නා. මට Facebook වීඩියෝ සබැඳියක් (link) එවන්න.", { parse_mode: 'Markdown' });
});

bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    const fbUrlMatch = text.match(/https?:\/\/(?:www\.|m\.|fb\.)?facebook\.com\/\S+|https?:\/\/fb\.watch\/\S+/i);
    
    if (fbUrlMatch) {
        const fbUrl = fbUrlMatch[0];
        
        await ctx.reply("⏳ වීඩියෝ සබැඳිය විශ්ලේෂණය කරමින්... කරුණාකර මොහොතක් රැඳී සිටින්න.");
        
        const result = await getFbVideoLinks(fbUrl);

        if (result.error) {
            await ctx.reply(`❌ දෝෂය: ${result.error}\n\n💡 කරුණාකර පරීක්ෂා කරන්න:\n- වීඩියෝ URL නිවැරදි දැයි\n- වීඩියෝව ප්‍රසිද්ධ (public) දැයි\n- වීඩියෝව තවමත් ලබා ගත හැකි දැයි`);
        } else if (result.hd) {
            try {
                await ctx.replyWithVideo(result.hd, { 
                    caption: '✅ Facebook වීඩියෝව බාගත කරන ලදී! (HD)' 
                });
            } catch (error) {
                console.error("Error sending HD video:", error.message);
                if (result.sd) {
                    try {
                        await ctx.replyWithVideo(result.sd, { 
                            caption: '✅ Facebook වීඩියෝව බාගත කරන ලදී! (SD)\n⚠️ HD ප්‍රමාණය ඉතා විශාල නිසා SD යැවීය.' 
                        });
                    } catch (sdError) {
                        console.error("Error sending SD video:", sdError.message);
                        await ctx.reply("❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.\n\n📎 Download Link:\n" + result.sd);
                    }
                } else {
                    await ctx.reply("❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.");
                }
            }
        } else if (result.sd) {
            try {
                await ctx.replyWithVideo(result.sd, { caption: '✅ Facebook වීඩියෝව බාගත කරන ලදී! (SD)' });
            } catch (error) {
                console.error("Error sending SD video:", error.message);
                await ctx.reply("❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.\n\n📎 Download Link:\n" + result.sd);
            }
        } else {
            await ctx.reply("❌ වීඩියෝ සබැඳිය ලබා ගැනීමට නොහැකි විය. සබැඳිය නිවැරදි දැයි පරීක්ෂා කරන්න.");
        }
    } else {
        await ctx.reply("💡 කරුණාකර වලංගු Facebook වීඩියෝ සබැඳියක් පමණක් එවන්න.\n\nසහාය දක්වන URL ආකෘති:\n- facebook.com/username/videos/...\n- fb.watch/...\n- facebook.com/watch/...");
    }
});

bot.launch().then(() => {
    console.log('✅ Bot is running...');
    console.log('📱 Using fb-downloader-scrapper for video extraction');
    console.log('🔒 Bot token loaded from environment variable');
}).catch((error) => {
    console.error('❌ Failed to start bot:', error.message);
    process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
