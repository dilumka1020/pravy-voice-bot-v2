require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;
const VoiceResponse = twilio.twiml.VoiceResponse;

const SYSTEM_PROMPT = `You are a smart and polite voice assistant for Pravy Consulting.
You greet callers, understand their business consulting needs, and answer questions based on services provided at https://pravy.ca.
If the caller sounds confused, angry, or requests to speak to a real person, offer to connect them to a human agent.
Keep your answers short and professional.`;

app.use(bodyParser.urlencoded({ extended: false }));

app.post('/voice', async (req, res) => {
  const twiml = new VoiceResponse();
  const userMessage = req.body.SpeechResult?.trim() || '';

   try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        temperature: 0.7,
        messages: [
          { role: 'user', content: userMessage },
          { role: 'assistant', content: '' } // Required to avoid 400 error
        ],
        system: SYSTEM_PROMPT
      })
    });

    const data = await response.json();

    if (data?.error) {
      console.error('Claude Error:', data.error);
      throw new Error(data.error.message);
    }

    const reply = data.content?.[0]?.text || "Sorry, I’m having trouble responding right now.";
    const normalized = reply.toLowerCase();

    if (normalized.includes('talk to a person') || normalized.includes('human')) {
      twiml.say("Sure, please hold while I connect you to a human agent.");
      twiml.dial('+15067977770'); // Update with your real number
    } else {
      twiml.say(reply);
      twiml.redirect('/voice');
    }

  } catch (err) {
    console.error("Claude API Exception:", err.message);
    twiml.say("Sorry, I'm having trouble understanding you. Please try again later.");
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

app.get('/', (req, res) => {
  res.send('Claude bot is up!');
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});