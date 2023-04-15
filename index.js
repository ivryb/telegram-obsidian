import { Bot, session } from 'grammy';
import { run, sequentialize } from '@grammyjs/runner';
import { RedisAdapter } from '@grammyjs/storage-redis';

import IORedis from 'ioredis';

const { telegramBotToken, redisURL } = process.env;

const getInitialSessionData = () => ({
  webhookLink: null,
  isEditingWebhookLink: true
});

const saveWebhookLink = (ctx, link) => {
  ctx.session.webhookLink = link.replace('?path=test/spotify.md', '');
  ctx.session.isEditingWebhookLink = false;
}

const getSessionKey = (ctx) => {
  return ctx.from ? ctx.from.id.toString() : ctx.chat.id.toString();
}

const redis = new IORedis(redisURL);

const botSession = session({
  initial: getInitialSessionData,
  storage: new RedisAdapter({ instance: redis }),
  getSessionKey
});

const bot = new Bot(telegramBotToken);

bot.use(sequentialize(getSessionKey))
bot.use(botSession);

const sendMessageToObsidian = async (webhookLink, msg) => {
  const title = msg.split('\n', 1)[0].replace('/', '\/');
  const content = msg + '\n\n#Telegram';

  await fetch(`${webhookLink}?path=${title}.md`, {
    method: 'POST',
    body: content
  });
};

bot.command('start', async (ctx) => {
  await ctx.reply(`Hi! This bot allows you to quickly create new notes in your Obsidian vault directly from Telegram.\n\nHere's how you can start it up:\n1. Install and activate the <a href="https://publish.obsidian.md/hub/02+-+Community+Expansions/02.05+All+Community+Expansions/Plugins/obsidian-webhooks">Obsidian Webhooks plugin</a> in your Obsidian vault.\n2. In Obsidian, go to the plugin settings and log in. You will be redirected to the Obsidian Webhooks plugin website.\n3. On the Webhooks plugin website, you will recieve your Webhook URL. Copy that Webhook URL and send it to this bot.`, {
    parse_mode: 'HTML'
  });
});

const getMessageText = (ctx) => {
  
}

bot.on('msg', async (ctx) => {
  const { webhookLink, isEditingWebhookLink } = ctx.session;

  const hasActiveWebhook = !isEditingWebhookLink && Boolean(webhookLink);

  const reply = ctx.msg.reply_to_message;
  
  const isDM = ctx.chat.type === 'private';
  const me = '@' + ctx.me.username;
  const isMention = ctx.msg.text.includes(me);
  
  const hasURL = ctx.msg.text.includes('https://') && ctx.msg.text.includes('/webhook/');

  if (!hasActiveWebhook && hasURL) {
    saveWebhookLink(ctx, ctx.msg.text);

    return await ctx.reply(`Great, your webhook URL is saved. Further messages will be re-sent to your Obsidian vault.\n\nFirst line of a message will be the note's title, and the intire message will be the note's text. Additionally, the #Telegram hashtag will be appended to the note.`)
  }

  if (!isDM && !isMention) return null;

  if (!hasActiveWebhook) {
    return await ctx.reply('Please, send me your Obsidian Webhook link');
  }
  
  try {
    const text = (reply ? reply.text : ctx.msg.text).replace(me, '').trim();
    
    await sendMessageToObsidian(webhookLink, text);

    const statusMessage = await ctx.reply('Message sent to your Obsidian vault');
    
    if (!isDM) {
      setTimeout(async () => {
        await ctx.api.deleteMessage(ctx.chat.id, statusMessage.message_id);
      }, 3000);
    }
  } catch (error) {
    console.log(error);

    await ctx.reply(`Request error: ${error}`);
  }
});

const runner = run(bot);

const stopRunner = () => runner.isRunning() && runner.stop();

process.once('SIGINT', stopRunner);
process.once('SIGTERM', stopRunner);
