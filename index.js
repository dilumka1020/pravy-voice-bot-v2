require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const twilio = require('twilio');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

const openai = new OpenAI({ apiKey: process.env.CLAUDE_API_KEY });
const VoiceResponse = twilio.twiml.VoiceResponse;

const SYSTEM_PROMPT = `You are a smart and polite voice assistant for Pravy Consulting. 
You greet callers, understand their business consulting needs, and answer questions based on services provided at https://pravy.ca. 
If the caller sounds confused, angry, or requests to speak to a real person, offer to connect them to a human agent. 
Keep your answers short and professional.`;

app.post('/voice', async (req, res) => {
  const twiml = new VoiceResponse();
  const speech = req.body.SpeechResult || '';

  try {
    // Ask Claude
    const chatResponse = await openai.chat.completions.create({
      model: 'claude-3-haiku-20240307',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: speech }
      ]
    });

    const reply = chatResponse.choices[0].message.content;
    const normalized = reply.toLowerCase();

    // Detect human transfer intent
    if (normalized.includes('talk to a person') || normalized.includes('human')) {
      twiml.say("Sure, please hold while I connect you to a human agent.");
      twiml.dial('+15067977770'); // Replace with your human agent’s phone number
    } else {
      twiml.say(reply);
      twiml.redirect('/voice'); // Continue conversation
    }
  } catch (error) {
    console.error('Claude API error:', error);
    twiml.say("Sorry, I'm having trouble understanding you. Please try again later.");
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

app.get('/', (req, res) => {
  res.send('Claude bot is up!');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});