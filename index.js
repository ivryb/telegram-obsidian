import { Bot, InlineKeyboard, session } from 'grammy';
import { run, sequentialize } from '@grammyjs/runner';
import { hydrateReply, parseMode } from '@grammyjs/parse-mode';
import { RedisAdapter } from '@grammyjs/storage-redis';

import IORedis from 'ioredis';

const { telegramBotToken, redisURL } = process.env;

const getInitialSessionData = () => ({
  userId: null,
  firstName: null,
  lastName: null,
  username: null,

  webhookLink: null,
  isEditingWebhookLink: true
});

const saveUser = (ctx) => {
  const user = ctx.from;

  ctx.session.userId = user.id;
  ctx.session.firstName = user.first_name;
  ctx.session.lastName = user.last_name;
  ctx.session.username = user.username;
}

const saveWebhookLink = (ctx, link) => {
  ctx.session.webhookLink = link.replace('?path=test/spotify.md', '');
  ctx.session.isEditingWebhookLink = false;
}

const getSessionKey = (ctx) => {
  return ctx.from?.id.toString();
}

const redis = new IORedis(redisURL);

const storage = new RedisAdapter({ instance: redis });

const botSession = session({
  initial: getInitialSessionData,
  storage,
  getSessionKey
});

const bot = new Bot(telegramBotToken);

bot.use(hydrateReply);
bot.use(sequentialize(getSessionKey))
bot.use(botSession);

const replyWithSetupMessage = async (ctx) => {
  await ctx.reply('Please, send me your Obsidian Webhook link');
};

bot.command('start', async (ctx) => {
  await replyWithSetupMessage(ctx);
});

const sendMessageToObsidian = async (ctx, webhookLink, msg) => {
  const title = msg.split('\n')[0];

  try {
    await fetch(`${webhookLink}?path=${title}.md`, {
      method: 'POST',
      body: msg
    });

    await ctx.reply('Message sent to your Obsidian vault')
  } catch (error) {
    console.log(error);

    await ctx.reply(`Request error: ${error}`);
  }
};

bot.on('message:entities:url', async (ctx) => {
  const { webhookLink, isEditingWebhookLink } = ctx.session;

  if (webhookLink && !isEditingWebhookLink) {
    await sendMessageToObsidian(ctx, webhookLink, ctx.msg.text);
  } else {
    saveWebhookLink(ctx, ctx.msg.text);

    await ctx.reply('Thank you! Your webhook link is saved. Further messages will be re-sent to your Obsidian vault.')
  }
});

bot.on('message', async (ctx) => {
  console.log('Start message processing');

  saveUser(ctx);

  const { webhookLink, isEditingWebhookLink } = ctx.session;

  if (webhookLink && !isEditingWebhookLink) {
    await sendMessageToObsidian(ctx, webhookLink, ctx.msg.text);
  } else {
    await replyWithSetupMessage(ctx);
  }

  console.log('End message processing');
});

const runner = run(bot);

const stopRunner = () => runner.isRunning() && runner.stop();

process.once('SIGINT', stopRunner);
process.once('SIGTERM', stopRunner);
