require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { VoiceResponse } = require('twilio').twiml;
const { Anthropic } = require('@anthropic-ai/sdk');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const SYSTEM_PROMPT = `You are a smart and polite voice assistant for Pravy Consulting.
You greet callers, understand their business consulting needs, and answer questions based on services provided at https://pravy.ca.
If the caller sounds confused, angry, or requests to speak to a real person, offer to connect them to a human agent.
Keep your answers short and professional.`;

app.post('/voice', async (req, res) => {
  const twiml = new VoiceResponse();
  const speech = req.body.SpeechResult || '';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 200,
      messages: [
        { role: 'user', content: speech }
      ],
      system: SYSTEM_PROMPT
    });

    const reply = response.content[0]?.text || 'I’m sorry, can you please repeat that?';
    const lower = reply.toLowerCase();

    // If user asks to speak to a real person
    if (
      lower.includes('human') ||
      lower.includes('real person') ||
      lower.includes('agent') ||
      lower.includes('talk to someone')
    ) {
      twiml.say("Sure, please hold while I connect you to a human agent.");
      twiml.dial('+15067977770'); // Replace with real number
    } else {
      twiml.say(reply);
      twiml.redirect('/voice');
    }
  } catch (error) {
    console.error('Claude API Error:', error?.response?.data || error.message || error);
    twiml.say("Sorry, I'm having trouble understanding you right now. Please try again later.");
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

app.get('/', (req, res) => {
  res.send('Claude bot is up and running!');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});